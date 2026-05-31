import { describe, expect, it, vi } from 'vitest'
import { createMoonrakerCommandClient } from './moonrakerCommandClient'

describe('createMoonrakerCommandClient', () => {
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
    await client.execute({ command: 'consoleGcode', script: 'M115' })
    await client.execute({ command: 'setNozzleTarget', targetCelsius: 230, wait: true })
    await client.execute({ command: 'setBedTarget', targetCelsius: 70, wait: true })

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
        body: JSON.stringify({ script: 'G91\nG1 X10 F3000\nG90' }),
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
        body: JSON.stringify({ script: 'M115' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'M109 S230' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      'http://moonraker.local/printer/gcode/script',
      expect.objectContaining({
        body: JSON.stringify({ script: 'M190 S70' }),
      }),
    )
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
})
