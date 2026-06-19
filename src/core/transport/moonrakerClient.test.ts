import { describe, expect, it, vi } from 'vitest'
import {
  createMoonrakerClient,
  MOONRAKER_RUNTIME_OBJECTS_QUERY,
  MoonrakerTransportError,
  normalizeMoonrakerSnapshot,
} from './moonrakerClient'

function moonrakerResponse(result: unknown): Response {
  return {
    ok: true,
    json: async () => ({ result }),
  } as Response
}

function moonrakerHttpError(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message: `Moonraker ${status}` } }),
  } as Response
}

function runtimeObjects() {
  return {
    status: {
      webhooks: {
        state: 'ready',
        state_message: 'Printer is ready',
      },
    },
  }
}

describe('normalizeMoonrakerSnapshot', () => {
  it('requests TreeD V2 runtime objects and macro state from Moonraker', () => {
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('toolhead')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20_TREED_GEOMETRY_CFG')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20_TREED_EDDY_Z_OFFSET_AUTOSAVE_STATE')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20_TREED_SERVICE_COMMANDS')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('firmware_retraction')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20_TREED_UI_TUNE_STATE')
  })

  it('normalizes TreeD V2 Moonraker objects into a runtime snapshot', () => {
    const snapshot = normalizeMoonrakerSnapshot({
      source: 'live',
      moonrakerUrl: 'http://127.0.0.1:7125',
      nowIso: '2026-05-31T10:00:00.000Z',
      info: { state: 'ready' },
      objects: {
        status: {
          webhooks: {
            state: 'ready',
            state_message: 'Printer is ready',
          },
          toolhead: {
            position: [122.5, 65, 12.34, 4.5],
            homed_axes: 'xyz',
            max_accel: 12000,
          },
          gcode_move: {
            speed_factor: 1.2,
            extrude_factor: 0.97,
            homing_origin: [0, 0, -0.04],
          },
          extruder: {
            temperature: 214.6,
            target: 220,
            pressure_advance: 0.075,
          },
          heater_bed: {
            temperature: 59.2,
            target: 60,
          },
          fan: {
            speed: 0.42,
          },
          firmware_retraction: {
            retract_length: 0.9,
          },
          print_stats: {
            state: 'printing',
            filename: 'v2_part.gcode',
            print_duration: 120,
            total_duration: 150,
          },
          virtual_sdcard: {
            progress: 0.37,
          },
          pause_resume: {
            is_paused: false,
          },
          'gcode_macro _TREED_GEOMETRY_CFG': {
            print_offset_x: 0,
            print_offset_y: 65,
            print_size_x: 245,
            print_size_y: 180,
          },
          'gcode_macro _TREED_PAUSE_STATE': {
            is_active: 0,
          },
          'gcode_macro _TREED_CAM_STATE': {
            enabled: 1,
          },
          'gcode_macro _TREED_EDDY_Z_OFFSET_AUTOSAVE_STATE': {
            enabled: 1,
            has_pending: 0,
          },
          'gcode_macro _TREED_UI_TUNE_STATE': {
            contract_version: '1.0',
            applied_babystep: -0.025,
          },
        },
      },
      files: [
        {
          path: 'v2_part.gcode',
          modified: 1_780_000_000,
          size: 1024,
        },
      ],
      fileMetadata: {
        'v2_part.gcode': {
          estimated_time: 3661,
          filament_total: 1234,
          filament_name: 'PETG',
        },
      },
    })

    expect(snapshot.connection).toBe('online')
    expect(snapshot.hardware.profile).toBe('treed_v2_corexy_v1')
    expect(snapshot.hardware.host).toBe('Rock Pi / Armbian Debian 12')
    expect(snapshot.hardware.mainMcu).toBe('Octopus Pro CAN')
    expect(snapshot.v2.eddy.status).toBe('ready')
    expect(snapshot.toolhead.rawY).toBe(65)
    expect(snapshot.toolhead.printOffsetY).toBe(65)
    expect(snapshot.printJob.filename).toBe('v2_part.gcode')
    expect(snapshot.printJob.progressPercent).toBe(37)
    expect(snapshot.thermalTargets).toEqual({
      nozzle: 220,
      bed: 60,
    })
    expect(snapshot.runtimeTune).toEqual({
      contractVersion: '1.0',
      speedFactorPercent: 120,
      flowFactorPercent: 97,
      accelMmS2: 12000,
      pressureAdvance: 0.075,
      retractLengthMm: 0.9,
      appliedBabystepMm: -0.025,
    })
    expect(snapshot.printFiles).toEqual([
      expect.objectContaining({
        id: 'file-v2-part-gcode',
        path: 'v2_part.gcode',
        name: 'v2_part.gcode',
        directory: null,
        printTime: '1 ч 01 мин',
        weight: '1 г',
        material: 'PETG',
      }),
    ])
    expect(snapshot.capabilities.network).toBe(false)
    expect(snapshot.capabilities.console).toBe(true)
    expect(snapshot.capabilities.camera).toBe(true)
  })

  it('marks shutdown state and uncalibrated Eddy errors explicitly', () => {
    const snapshot = normalizeMoonrakerSnapshot({
      source: 'live',
      moonrakerUrl: 'http://127.0.0.1:7125',
      nowIso: '2026-05-31T10:00:00.000Z',
      info: { state: 'shutdown' },
      objects: {
        status: {
          webhooks: {
            state: 'shutdown',
            state_message: 'Must calibrate probe_eddy_current first',
          },
          print_stats: {
            state: 'error',
          },
        },
      },
      files: [],
      fileMetadata: {},
    })

    expect(snapshot.connection).toBe('shutdown')
    expect(snapshot.v2.eddy.status).toBe('uncalibrated')
    expect(snapshot.message).toContain('Must calibrate probe_eddy_current first')
  })
})

describe('createMoonrakerClient', () => {
  it('aborts stuck Moonraker HTTP requests after timeout', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/server/files/list')) {
        return Promise.resolve(moonrakerResponse([]))
      }

      return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
      })
    })
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
      fetchTimeoutMs: 25,
    })

    const promise = client.fetchSnapshot()
    const timeoutExpectation = expect(promise).rejects.toMatchObject({
      kind: 'timeout',
      message: expect.stringContaining('25ms'),
    })

    await vi.advanceTimersByTimeAsync(25)
    await timeoutExpectation
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(MOONRAKER_RUNTIME_OBJECTS_QUERY),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
    vi.useRealTimers()
  })

  it('throws typed transport errors for Moonraker HTTP failures', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/printer/objects/query')) {
        return Promise.resolve(moonrakerHttpError(500))
      }

      return Promise.resolve(moonrakerResponse([]))
    })
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
    })

    await expect(client.fetchSnapshot()).rejects.toBeInstanceOf(MoonrakerTransportError)
    await expect(client.fetchSnapshot()).rejects.toMatchObject({
      kind: 'http',
      status: 500,
      message: 'Moonraker 500',
    })
  })

  it('limits concurrent metadata requests and caches metadata by file identity', async () => {
    const files = Array.from({ length: 5 }, (_item, index) => ({
      path: `part-${index}.gcode`,
      modified: 1_800_000_000 + index,
      size: 1_024 + index,
    }))
    let activeMetadataRequests = 0
    let maxActiveMetadataRequests = 0
    let metadataRequestCount = 0
    const metadataResolvers: Array<() => void> = []
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/printer/objects/query')) {
        return Promise.resolve(moonrakerResponse(runtimeObjects()))
      }

      if (url.includes('/server/files/list')) {
        return Promise.resolve(moonrakerResponse(files))
      }

      metadataRequestCount += 1
      activeMetadataRequests += 1
      maxActiveMetadataRequests = Math.max(maxActiveMetadataRequests, activeMetadataRequests)

      return new Promise<Response>((resolve) => {
        metadataResolvers.push(() => {
          activeMetadataRequests -= 1
          resolve(moonrakerResponse({
            estimated_time: 1200 + metadataRequestCount,
            filament_total: 300,
          }))
        })
      })
    })
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
      metadataConcurrency: 2,
    })

    const firstSnapshot = client.fetchSnapshot()
    await vi.waitFor(() => {
      expect(metadataResolvers).toHaveLength(2)
    })

    for (let resolvedCount = 0; resolvedCount < files.length; resolvedCount += 1) {
      await vi.waitFor(() => {
        expect(metadataResolvers.length).toBeGreaterThan(0)
      })
      metadataResolvers.shift()?.()
      await Promise.resolve()
    }
    await firstSnapshot

    expect(maxActiveMetadataRequests).toBeLessThanOrEqual(2)
    expect(metadataRequestCount).toBe(5)

    await client.fetchSnapshot()

    expect(metadataRequestCount).toBe(5)
  })
})
