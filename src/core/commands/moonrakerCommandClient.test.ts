import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMoonrakerCommandClient } from './moonrakerCommandClient'

let consoleDebug: ReturnType<typeof vi.spyOn>
let consoleError: ReturnType<typeof vi.spyOn>

describe('createMoonrakerCommandClient', () => {
  beforeEach(() => {
    consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleDebug.mockRestore()
    consoleError.mockRestore()
    vi.unstubAllGlobals()
  })

  it('binds the default fetch implementation to the browser global', async () => {
    const fetchMock = vi.fn(function (this: typeof globalThis) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation')
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ result: 'ok' }),
      } as Response)
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
    })

    await client.execute({ command: 'setNozzleTarget', targetCelsius: 230 })

    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('aborts stuck Moonraker command requests after timeout', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    }))
    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
      fetchTimeoutMs: 25,
    })

    const promise = client.execute({ command: 'turnOffHeaters' })
    const timeoutExpectation = expect(promise).rejects.toMatchObject({
      kind: 'timeout',
      message: expect.stringContaining('25ms'),
    })

    await vi.advanceTimersByTimeAsync(25)
    await timeoutExpectation
    expect(fetchMock).toHaveBeenCalledWith(
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
    vi.useRealTimers()
  })

  it('starts nested print file paths through Moonraker print start endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    })

    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await client.execute({ command: 'start', filename: 'jobs/benchy v2.gcode' })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://moonraker.local/printer/print/start?filename=jobs%2Fbenchy%20v2.gcode',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('routes filament sensor mode through G-code and sensitivity through host API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    })
    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await client.execute({ command: 'setFilamentSensorMode', mode: 'motion' })
    await client.execute({ command: 'setFilamentEncoderSensitivity', sensitivity: 'high' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ script: 'FILAMENT_SENSOR_SET_MODE MODE=MOTION' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://moonraker.local/server/treed/filament-sensor/settings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sensitivity: 'high' }),
      }),
    )
  })

  it('maps TreeD V2 motion and service commands to Moonraker G-code scripts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    })

    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await client.execute({ command: 'homeXY' })
    await client.execute({ command: 'homeZ' })
    await client.execute({ command: 'moveAxis', axis: 'X', distanceMm: 10, speedMmS: 50 })
    await client.execute({ command: 'loadFilament', lengthMm: 80, speedMmS: 6 })
    await client.execute({ command: 'zParkZeroEddy' })
    await client.execute({ command: 'disableMotors' })
    await client.execute({ command: 'consoleGcode', script: 'M115' })
    await client.execute({ command: 'setHeatingTargets', nozzleCelsius: 230, bedCelsius: 70 })
    await client.execute({ command: 'setNozzleTarget', targetCelsius: 230, wait: true })
    await client.execute({ command: 'setBedTarget', targetCelsius: 70, wait: true })
    await client.execute({ command: 'setPrintSpeedFactorPercent', percent: 120 })
    await client.execute({ command: 'setPrintFlowFactorPercent', percent: 97 })
    await client.execute({ command: 'setPrintAccel', accelMmS2: 12000 })
    await client.execute({ command: 'setPressureAdvance', advance: 0.075 })
    await client.execute({ command: 'setRetractionLength', retractLengthMm: 0.9 })
    await client.execute({ command: 'adjustZOffset', deltaMm: -0.025 })
    await client.execute({ command: 'excludeObject', objectName: 'part_1' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ script: 'G28 X Y\nM400' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: '_TREED_EDDY_HOME_Z\nM400' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'TREED_UI_MOVE_AXIS AXIS=X DISTANCE=10 FEEDRATE=3000\nM400' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'LOAD_FILAMENT LENGTH=80 SPEED=6\nM400' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'TREED_Z_PARK_ZERO_EDDY' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'M84' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'M115' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'M104 S230\nM140 S70' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      9,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'M109 S230' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      10,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'M190 S70' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      11,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'TREED_UI_SET_SPEED_FACTOR PERCENT=120' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      12,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'TREED_UI_SET_FLOW_FACTOR PERCENT=97' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      13,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'TREED_UI_SET_ACCEL ACCEL=12000' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      14,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'TREED_UI_SET_PRESSURE_ADVANCE ADVANCE=0.075' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      15,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'TREED_UI_SET_RETRACTION RETRACT_LENGTH=0.9' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      16,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'TREED_UI_ADJUST_Z_OFFSET DELTA=-0.025' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      17,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'EXCLUDE_OBJECT NAME=part_1' }),
      }),
    )
  })

  it('serializes EXCLUDE_OBJECT names without changing the object name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    })
    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await client.execute({ command: 'excludeObject', objectName: 'part 1' })
    await client.execute({ command: 'excludeObject', objectName: 'деталь 2' })
    await client.execute({ command: 'excludeObject', objectName: 'part "quoted" \\ test' })
    await client.execute({ command: 'excludeObject', objectName: 'part_#3+ok' })

    const scripts = fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)).script)
    expect(scripts).toEqual([
      'EXCLUDE_OBJECT NAME="part 1"',
      'EXCLUDE_OBJECT NAME="деталь 2"',
      'EXCLUDE_OBJECT NAME="part \\"quoted\\" \\\\ test"',
      'EXCLUDE_OBJECT NAME="part_#3+ok"',
    ])
  })

  it('rejects object names that cannot be serialized safely', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const client = createMoonrakerCommandClient({ fetchImpl })

    await expect(client.execute({ command: 'excludeObject', objectName: 'part\nM112' })).rejects.toThrow('NAME')
    await expect(client.execute({ command: 'excludeObject', objectName: 'part;comment' })).rejects.toThrow('NAME')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps main light toggle commands to TreeD chamber light macros', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    })
    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await client.execute({ command: 'setMainLightEnabled', enabled: true })
    await client.execute({ command: 'setMainLightEnabled', enabled: false })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ script: 'LIGHT_ON' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ script: 'LIGHT_OFF' }),
      }),
    )
  })

  it('maps Eddy calibration workflow commands to TreeD wrapper macros', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    })
    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await client.execute({ command: 'eddyDriveCurrentCalibrate' })
    await client.execute({ command: 'eddyPrimaryHeightStart' })
    await client.execute({ command: 'eddyTestZ', deltaMm: -0.05 })
    await client.execute({ command: 'eddyPrimaryAcceptSave' })
    await client.execute({ command: 'eddyTemperatureStart' })
    await client.execute({ command: 'eddyTemperatureAcceptSave' })
    await client.execute({ command: 'eddyCheckZ0' })
    await client.execute({ command: 'eddyScrewsTiltStart' })
    await client.execute({ command: 'eddyScrewsTiltDone' })
    await client.execute({ command: 'eddyBedMeshCalibrate' })
    await client.execute({ command: 'eddyAutosaveEnable' })
    await client.execute({ command: 'eddyAutosaveDisable' })
    await client.execute({ command: 'eddyAutosaveStatus' })

    const scripts = fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)).script)

    expect(scripts).toEqual([
      'TREED_EDDY_CALIBRATE_DRIVE_CURRENT',
      'TREED_EDDY_PRIMARY_HEIGHT_START',
      'TESTZ Z=-0.05',
      'TREED_EDDY_PRIMARY_ACCEPT_SAVE',
      'TREED_EDDY_TEMPERATURE_START',
      'TREED_EDDY_TEMPERATURE_ACCEPT_SAVE',
      'TREED_EDDY_CHECK_Z0',
      'TREED_EDDY_SCREWS_TILT_START',
      'TREED_EDDY_SCREWS_TILT_DONE',
      'TREED_EDDY_BED_MESH_CALIBRATE',
      'TREED_EDDY_Z_OFFSET_AUTOSAVE_ENABLE',
      'TREED_EDDY_Z_OFFSET_AUTOSAVE_DISABLE',
      'TREED_EDDY_Z_OFFSET_AUTOSAVE_STATUS',
    ])
  })

  it('homes X and Y independently', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    })
    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await client.execute({ command: 'homeX' })
    await client.execute({ command: 'homeY' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({ body: JSON.stringify({ script: 'G28 X\nM400' }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({ body: JSON.stringify({ script: 'G28 Y\nM400' }) }),
    )
  })

  it('rejects invalid heating and movement arguments before transport', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const client = createMoonrakerCommandClient({ fetchImpl })

    await expect(client.execute({ command: 'setBedTarget', targetCelsius: 121 })).rejects.toThrow('0…120')
    await expect(client.execute({ command: 'moveAxis', axis: 'X', distanceMm: Number.NaN })).rejects.toThrow('DISTANCE')
    await expect(client.execute({ command: 'loadFilament', lengthMm: 0 })).rejects.toThrow('LENGTH')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('routes host power commands without capability flags', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    })
    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await client.execute({ command: 'rebootHost' })
    await client.execute({ command: 'shutdownHost' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://moonraker.local/machine/reboot',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://moonraker.local/machine/shutdown',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('routes host power and service commands to Moonraker system endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    })
    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await client.execute({ command: 'rebootHost' })
    await client.execute({ command: 'shutdownHost' })
    await client.execute({ command: 'restartKlipper' })
    await client.execute({ command: 'firmwareRestart' })
    await client.execute({ command: 'restartMoonraker' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://moonraker.local/machine/reboot',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://moonraker.local/machine/shutdown',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://moonraker.local/printer/restart',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://moonraker.local/printer/firmware_restart',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://moonraker.local/server/restart',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('rejects Moonraker JSON-RPC errors and logs command details', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: { message: 'Klipper rejected command' } }),
    })
    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await expect(client.execute({ command: 'setFanPercent', percent: 50 })).rejects.toThrow('Klipper rejected command')

    expect(consoleDebug).toHaveBeenCalledWith(
      '[treed-command] sending',
      expect.objectContaining({
        command: 'setFanPercent',
        path: '/printer/gcode/script',
        body: { script: 'M106 S128' },
      }),
    )
    expect(consoleError).toHaveBeenCalledWith(
      '[treed-command] failed',
      expect.objectContaining({
        command: 'setFanPercent',
        error: 'Klipper rejected command',
      }),
    )
  })
})
