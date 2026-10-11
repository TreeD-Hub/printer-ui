import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearMockCommandFailure,
  clearMockTransportSnapshot,
  createCommandClient,
  createMockSnapshot,
  createTransportClient,
  setMockCommandFailure,
  setMockTransportSnapshot,
} from '../mocks/runtime'
import { subscribePrinterGcodeResponses } from '../src/core/store/printerNotifications'
import { PRINT_FILE_LIBRARY } from '../src/printFiles'

describe('mock calibration runtime', () => {
  afterEach(() => {
    vi.useRealTimers()
    clearMockCommandFailure()
    clearMockTransportSnapshot()
  })

  it('confirms drive current only across the simulated SAVE_CONFIG restart', async () => {
    vi.useFakeTimers()
    setMockTransportSnapshot(createMockSnapshot())
    const transport = createTransportClient()
    const pending = createCommandClient().execute({ command: 'eddyDriveCurrentCalibrate' })
    await vi.advanceTimersByTimeAsync(220)
    expect(await transport.fetchSnapshot()).toMatchObject({
      klippy: { state: 'startup' },
      calibration: { config: { savePending: true, pendingSections: ['eddy_drive_current'] } },
    })
    await vi.advanceTimersByTimeAsync(4_000)
    expect((await pending).ok).toBe(true)
    expect(await transport.fetchSnapshot()).toMatchObject({
      klippy: { state: 'ready' },
      calibration: { eddy: { driveCurrent: 18 }, config: { savePending: false, pendingSections: [] } },
      v2: { eddy: { calibration: { driveCurrentDone: true } } },
    })
  })

  it('simulates gradual temperatures while polling an active Eddy series', async () => {
    vi.useFakeTimers()
    const snapshot = createMockSnapshot()
    snapshot.extruderTemp = 100
    snapshot.bedTemp = 40
    setMockTransportSnapshot(snapshot)
    const transport = createTransportClient()
    const client = createCommandClient()
    const start = client.execute({ command: 'eddyTemperatureStart' })
    await vi.advanceTimersByTimeAsync(220)
    expect((await start).ok).toBe(true)
    const before = await transport.fetchSnapshot()
    await vi.advanceTimersByTimeAsync(2_000)
    const after = await transport.fetchRuntimeSnapshot()
    expect(after.extruderTemp).toBeGreaterThan(before.extruderTemp)
    expect(after.extruderTemp).toBeLessThan(after.thermalTargets.nozzle)
    expect(after.bedTemp).toBeLessThan(before.bedTemp)
    expect(after.thermalTargets).toEqual({ nozzle: 160, bed: 0 })
    expect(after.calibration!.eddy.temperatureC).toBeGreaterThan(before.calibration!.eddy.temperatureC!)
    expect(after.updatedAt).not.toBe(before.updatedAt)
    expect(after.calibration!.eddy.temperaturePoints).toBe(0)
    expect(after.calibration!.manualProbe.active).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(await transport.fetchSnapshot()).toEqual(after)

    const unavailable = structuredClone(after)
    unavailable.calibration!.eddy.temperatureC = null
    setMockTransportSnapshot(unavailable)
    await vi.advanceTimersByTimeAsync(2_000)
    expect((await transport.fetchEddyState()).calibrationState?.eddy.temperatureC).toBeNull()

    const abort = client.execute({ command: 'eddyAbort' })
    await vi.advanceTimersByTimeAsync(220)
    expect((await abort).ok).toBe(true)
    const stopped = await transport.fetchSnapshot()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await transport.fetchRuntimeSnapshot()).toEqual(stopped)
  })

  it('publishes new resonance revisions only after a successful shaper command', async () => {
    vi.useFakeTimers()
    const transport = createTransportClient()
    const command = createCommandClient()
    expect((await transport.fetchShaperResonances('full')).axes).toEqual({ x: null, y: null })
    for (let run = 0; run < 2; run += 1) {
      const before = await transport.fetchShaperResonances('full')
      const pending = command.execute({ command: 'shaperCalibrateFull', save: false })
      await vi.runAllTimersAsync()
      expect((await pending).ok).toBe(true)
      const after = await transport.fetchShaperResonances('full')
      expect(after.axes.x?.revision).not.toBe(before.axes.x?.revision)
      expect(after.axes.y?.revision).not.toBe(before.axes.y?.revision)
      expect(after.axes.x?.csv).toContain('freq,psd_x,psd_y,psd_z,psd_xyz')
      expect((await transport.fetchShaperResonances('light')).axes).toEqual({ x: null, y: null })
    }
    const beforeFailure = await transport.fetchShaperResonances('full')
    setMockCommandFailure('shaperCalibrateFull', 'failed')
    const pending = command.execute({ command: 'shaperCalibrateFull', save: false })
    await vi.runAllTimersAsync()
    expect((await pending).ok).toBe(false)
    expect(await transport.fetchShaperResonances('full')).toEqual(beforeFailure)
  })

  it('returns calibration measurements and confirms config saves across restart', async () => {
    vi.useFakeTimers()
    setMockTransportSnapshot(createMockSnapshot())
    const client = createCommandClient()
    const transport = createTransportClient()
    const responses: string[] = []
    const unsubscribe = subscribePrinterGcodeResponses((response) => responses.push(response))

    try {
      for (const args of [
        { command: 'accelerometerQuery' },
        { command: 'accelerometerMeasureNoise' },
        { command: 'shaperCalibrateFull', save: false },
      ] as const) {
        const command = client.execute(args)
        await vi.runAllTimersAsync()
        expect((await command).ok).toBe(true)
      }

      expect(responses).toContain('accelerometer values (x, y, z): 0.124, -0.086, 9.812')
      expect(responses).toContain('axes noise for xy-axis accelerometer: 0.0012 (x), 0.0016 (y), 0.0021 (z)')
      expect(responses).toContain('Recommended shaper_type_x = ei, shaper_freq_x = 51.4 Hz\nRecommended shaper_type_y = mzv, shaper_freq_y = 42.2 Hz')
      expect(await transport.fetchSnapshot()).toMatchObject({
        calibration: {
          shaper: { typeX: 'ei', typeY: 'mzv', freqXHz: 51.4, freqYHz: 42.2 },
          config: { savePending: true, pendingSections: ['input_shaper'] },
        },
      })

      const apply = client.execute({ command: 'extruderRotationDistanceApply', distanceMm: 24 })
      await vi.runAllTimersAsync()
      expect((await apply).ok).toBe(true)
      expect((await transport.fetchSnapshot()).calibration?.extruder.rotationDistanceMm).toBe(24)

      const save = client.execute({ command: 'extruderRotationDistanceSave', distanceMm: 24 })
      await vi.advanceTimersByTimeAsync(220)
      expect((await transport.fetchSnapshot()).klippy.state).toBe('startup')
      await vi.advanceTimersByTimeAsync(4_000)
      expect((await save).ok).toBe(true)
      expect(await transport.fetchSnapshot()).toMatchObject({
        klippy: { state: 'ready' },
        calibration: {
          extruder: { rotationDistanceMm: 24 },
          config: { savePending: false, pendingSections: [] },
        },
      })
    } finally {
      unsubscribe()
    }
  })

  it('advances the Eddy height and temperature procedures through saved state', async () => {
    vi.useFakeTimers()
    setMockTransportSnapshot(createMockSnapshot())
    const client = createCommandClient()
    const transport = createTransportClient()
    const execute = async (args: Parameters<typeof client.execute>[0]) => {
      const command = client.execute(args)
      await vi.runAllTimersAsync()
      expect((await command).ok).toBe(true)
    }

    await execute({ command: 'eddyPrimaryHeightStart' })
    await execute({ command: 'eddyTestZ', deltaMm: -0.05 })
    const probe = (await transport.fetchSnapshot()).calibration?.manualProbe
    expect(probe?.active).toBe(true)
    expect(probe?.zMm).toBeCloseTo(0.07)
    await execute({ command: 'eddyPrimaryAcceptSave' })
    expect(await transport.fetchSnapshot()).toMatchObject({
      klippy: { state: 'ready' },
      calibration: {
        manualProbe: { active: false },
        eddy: { heightCalibrated: true },
        config: { savePending: false, pendingSections: [] },
      },
    })

    await execute({ command: 'eddyTemperatureStart' })
    const premature = client.execute({ command: 'eddyTemperatureAccept' })
    const rejected = expect(premature).rejects.toThrow('ещё не запросил бумажный замер')
    await vi.runAllTimersAsync()
    await rejected
    let acceptedPoints = 0
    for (let poll = 0; poll < 1000; poll += 1) {
      await vi.advanceTimersByTimeAsync(2_000)
      const current = await transport.fetchSnapshot()
      if (current.calibration?.eddy.inTemperatureCalibration === false) break
      if (current.calibration?.manualProbe.active) {
        await execute({ command: 'eddyTestZ', deltaMm: -0.05 })
        await execute({ command: 'eddyTemperatureAccept' })
        acceptedPoints += 1
        expect((await transport.fetchSnapshot()).calibration?.manualProbe.active).toBe(false)
      }
    }
    expect(acceptedPoints).toBeGreaterThanOrEqual(3)
    expect(await transport.fetchSnapshot()).toMatchObject({
      calibration: {
        eddy: { temperatureSeriesActive: true, inTemperatureCalibration: false },
        config: { savePending: true, pendingSections: ['temperature_probe btt_eddy'] },
      },
      v2: { eddy: { calibration: { temperatureDone: false } } },
    })
    await execute({ command: 'eddyTemperatureComplete' })
    expect(await transport.fetchSnapshot()).toMatchObject({
      klippy: { state: 'ready' },
      calibration: {
        manualProbe: { active: false },
        eddy: { temperaturePoints: acceptedPoints, temperatureSeriesActive: false, inTemperatureCalibration: false },
        config: { savePending: false, pendingSections: [] },
      },
      v2: { eddy: { calibration: { temperatureDone: true } } },
    })
  })

  it('publishes the Eddy probe responses and refreshed bed measurements', async () => {
    vi.useFakeTimers()
    setMockTransportSnapshot(createMockSnapshot())
    const client = createCommandClient()
    const transport = createTransportClient()
    const responses: string[] = []
    const unsubscribe = subscribePrinterGcodeResponses((response) => responses.push(response))

    try {
      for (const commandName of ['eddyDriveCurrentCalibrate', 'eddyProbeAccuracy', 'eddyCheckZ0', 'eddyScrewsTiltStart', 'eddyScanMesh'] as const) {
        const command = client.execute({ command: commandName, ...(commandName === 'eddyScanMesh' ? { save: false } : {}) })
        await vi.runAllTimersAsync()
        expect((await command).ok).toBe(true)
      }

      expect(responses).toContain('Eddy drive current calibration complete: drive_current=18')
      expect(responses).toContain(' probe accuracy: probe range 0.012, average 0.004, standard deviation 0.003')
      expect(responses).toContain('Eddy Z0: probe=(0.100, 0.200) tool=(0.100, 0.200) offset=(0.000, 0.000)')
      expect(await transport.fetchSnapshot()).toMatchObject({
        calibration: {
          eddy: { driveCurrent: 18 },
          screws: { error: false, results: expect.arrayContaining([expect.objectContaining({ name: 'P4 probe X25 Y205' })]) },
          mesh: { probedMatrix: expect.any(Array) },
        },
        v2: { eddy: { calibration: { z0Done: true } } },
      })
      const mesh = (await transport.fetchSnapshot()).calibration!.mesh
      expect(mesh.probedMatrix).toHaveLength(7)
      expect(mesh.probedMatrix.every((row) => row.length === 7 && row.every(Number.isFinite))).toBe(true)
      const heights = mesh.probedMatrix.flat() as number[]
      expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.05)
    } finally {
      unsubscribe()
    }
  })

  it('confirms a fresh mesh after accepted SAVE=0 scan and preserves it across config restart', async () => {
    vi.useFakeTimers()
    setMockTransportSnapshot(createMockSnapshot())
    const command = createCommandClient()
    const transport = createTransportClient()
    const before = await transport.fetchSnapshot()
    setMockCommandFailure('eddyScanMesh', 'failed')
    const failed = command.execute({ command: 'eddyScanMesh', save: false })
    await vi.runAllTimersAsync()
    expect((await failed).ok).toBe(false)
    expect((await transport.fetchSnapshot()).v2.eddy.calibration).toEqual(before.v2.eddy.calibration)
    expect((await transport.fetchSnapshot()).calibration?.mesh).toEqual(before.calibration?.mesh)
    clearMockCommandFailure()

    const scan = command.execute({ command: 'eddyScanMesh', save: false })
    await vi.runAllTimersAsync()
    expect((await scan).ok).toBe(true)
    const scanned = await transport.fetchSnapshot()
    expect(scanned).toMatchObject({
      klippy: { state: 'ready' },
      v2: { eddy: { calibration: { meshDone: true, requiredDone: true, activeStep: 'complete', operatorPrompt: 'none' } } },
      calibration: { config: { savePending: true, pendingSections: ['bed_mesh default'] } },
    })
    const mesh = scanned.calibration!.mesh
    expect(mesh.probedMatrix).toHaveLength(7)
    expect(mesh.probedMatrix.every((row) => row.length === 7 && row.every(Number.isFinite))).toBe(true)
    expect(mesh.meshMatrix).toEqual(mesh.probedMatrix)
    expect(mesh.savedProfiles.default).toEqual(mesh.probedMatrix)
    const heights = mesh.probedMatrix.flat() as number[]
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.05)

    const save = command.execute({ command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' })
    await vi.advanceTimersByTimeAsync(220)
    expect((await transport.fetchSnapshot()).klippy.state).toBe('startup')
    await vi.advanceTimersByTimeAsync(4_000)
    expect((await save).ok).toBe(true)
    const saved = await transport.fetchSnapshot()
    expect(saved).toMatchObject({
      klippy: { state: 'ready' },
      calibration: { config: { savePending: false, pendingSections: [] } },
      v2: { eddy: { calibration: { meshDone: true, requiredDone: true, activeStep: 'complete' } } },
    })
    expect(saved.calibration!.mesh.savedProfiles.default).toEqual(mesh.probedMatrix)

    const scanAndSave = command.execute({ command: 'eddyScanMesh', save: true })
    await vi.advanceTimersByTimeAsync(220)
    expect(await transport.fetchSnapshot()).toMatchObject({
      klippy: { state: 'startup' },
      v2: { eddy: { calibration: { meshDone: true, requiredDone: true, operatorPrompt: 'restart' } } },
    })
    await vi.advanceTimersByTimeAsync(4_000)
    expect((await scanAndSave).ok).toBe(true)
    expect((await transport.fetchSnapshot()).calibration?.config.savePending).toBe(false)
  })

  it('marks screw calibration complete only after explicit confirmation', async () => {
    vi.useFakeTimers()
    setMockTransportSnapshot(createMockSnapshot())
    const client = createCommandClient()
    const transport = createTransportClient()

    const initial = await transport.fetchSnapshot()
    expect(initial.calibration?.screws.results.map(({ name, xMm, yMm, isBase, sign, adjust }) => ({ name, xMm, yMm, isBase, sign, adjust }))).toEqual([
      { name: 'P1 probe X25 Y70', xMm: 25, yMm: 100, isBase: true, sign: 'CW', adjust: '00:00' },
      { name: 'P2 probe X220 Y70', xMm: 220, yMm: 100, isBase: false, sign: 'CCW', adjust: '00:01' },
      { name: 'P3 probe X220 Y205', xMm: 220, yMm: 235, isBase: false, sign: 'CW', adjust: '00:01' },
      { name: 'P4 probe X25 Y205', xMm: 25, yMm: 235, isBase: false, sign: 'CCW', adjust: '00:01' },
    ])

    const measurement = client.execute({ command: 'eddyScrewsTiltStart' })
    await vi.runAllTimersAsync()
    expect((await measurement).ok).toBe(true)
    const measured = await transport.fetchSnapshot()
    expect(measured).toMatchObject({
      calibration: { screws: { error: false, results: expect.arrayContaining([expect.objectContaining({ name: 'P4 probe X25 Y205' })]) } },
      v2: { eddy: { calibration: { screwsDone: false } } },
    })
    expect(measured.calibration?.screws.results.map(({ name, xMm, yMm, isBase, sign, adjust }) => ({ name, xMm, yMm, isBase, sign, adjust }))).toEqual([
      { name: 'P1 probe X25 Y70', xMm: 25, yMm: 100, isBase: true, sign: 'CW', adjust: '00:00' },
      { name: 'P2 probe X220 Y70', xMm: 220, yMm: 100, isBase: false, sign: 'CCW', adjust: '00:01' },
      { name: 'P3 probe X220 Y205', xMm: 220, yMm: 235, isBase: false, sign: 'CW', adjust: '00:01' },
      { name: 'P4 probe X25 Y205', xMm: 25, yMm: 235, isBase: false, sign: 'CCW', adjust: '00:01' },
    ])

    const confirmation = client.execute({ command: 'eddyScrewsTiltDone' })
    await vi.runAllTimersAsync()
    expect((await confirmation).ok).toBe(true)
    expect(await transport.fetchSnapshot()).toMatchObject({
      v2: { eddy: { calibration: { screwsDone: true, activeStep: 'mesh' } } },
    })
  })

  it('exposes the shared print library and keeps it through snapshot updates', async () => {
    vi.useFakeTimers()
    setMockTransportSnapshot(createMockSnapshot())
    const client = createCommandClient()
    const transport = createTransportClient()

    expect((await transport.fetchSnapshot()).printFiles).toEqual(PRINT_FILE_LIBRARY)

    const command = client.execute({ command: 'setFanPercent', percent: 40 })
    await vi.runAllTimersAsync()
    expect((await command).ok).toBe(true)
    expect((await transport.fetchSnapshot()).printFiles).toEqual(PRINT_FILE_LIBRARY)
  })

  it('updates toolhead Z only when the Z-offset command succeeds', async () => {
    vi.useFakeTimers()
    setMockTransportSnapshot(createMockSnapshot())
    const client = createCommandClient()
    const transport = createTransportClient()
    const initialZ = (await transport.fetchSnapshot()).toolheadZ

    const acceptedCommand = client.execute({ command: 'adjustZOffset', deltaMm: 0.025 })
    await vi.runAllTimersAsync()
    expect((await acceptedCommand).ok).toBe(true)
    expect((await transport.fetchSnapshot()).toolheadZ).toBeCloseTo(initialZ + 0.025)

    setMockCommandFailure('adjustZOffset', 'Mock failure')
    const failedCommand = client.execute({ command: 'adjustZOffset', deltaMm: 0.025 })
    await vi.runAllTimersAsync()
    expect((await failedCommand).ok).toBe(false)
    expect((await transport.fetchSnapshot()).toolheadZ).toBeCloseTo(initialZ + 0.025)
  })
})
