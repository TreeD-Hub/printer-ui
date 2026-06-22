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

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ script: 'G28 X Y' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: '_TREED_EDDY_HOME_Z' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'TREED_UI_MOVE_AXIS AXIS=X DISTANCE=10 FEEDRATE=3000' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'LOAD_FILAMENT LENGTH=80 SPEED=6' }),
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
  })

  it('rejects invalid heating and movement arguments before transport', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const client = createMoonrakerCommandClient({ fetchImpl })

    await expect(client.execute({ command: 'setBedTarget', targetCelsius: 121 })).rejects.toThrow('0…120')
    await expect(client.execute({ command: 'moveAxis', axis: 'X', distanceMm: Number.NaN })).rejects.toThrow('DISTANCE')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects unsupported capability commands before hitting Moonraker', async () => {
    const fetchMock = vi.fn()
    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
      capabilities: {
        power: false,
      },
    })

    await expect(client.execute({ command: 'shutdownHost' })).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        kind: 'unsupported',
        message: expect.stringContaining('not supported'),
      }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('routes enabled host power and service commands to Moonraker system endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'ok' }),
    })
    const client = createMoonrakerCommandClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
      capabilities: {
        power: true,
      },
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
