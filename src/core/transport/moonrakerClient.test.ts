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

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

describe('normalizeMoonrakerSnapshot', () => {
  it('requests TreeD V2 runtime objects and macro state from Moonraker', () => {
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('webhooks')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('toolhead')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('print_stats')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('virtual_sdcard')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('display_status')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('pause_resume')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('exclude_object')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('extruder')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('heater_bed')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20_TREED_GEOMETRY_CFG')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20_TREED_EDDY_Z_OFFSET_AUTOSAVE_STATE')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20_TREED_SERVICE_COMMANDS')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('output_pin%20chamber_light')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20LIGHT_ON')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20LIGHT_OFF')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('firmware_retraction')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('save_variables')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('filament_switch_sensor%20filament_switch')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('filament_motion_sensor%20filament_motion')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20FILAMENT_SENSOR_SET_MODE')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20FILAMENT_SENSOR_STATUS')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20_TREED_UI_TUNE_STATE')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20_TREED_UI_CONTRACT')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20_TREED_CAMERA')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20_TREED_EDDY_CALIBRATION_STATE')
    expect(MOONRAKER_RUNTIME_OBJECTS_QUERY).toContain('gcode_macro%20TREED_UI_MOVE_AXIS')
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
            print_offset_y: 0,
            print_size_x: 245,
            print_size_y: 245,
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
    expect(snapshot.toolhead.printOffsetY).toBe(0)
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
        weight: '—',
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
  it('binds the default fetch implementation to the browser global', async () => {
    const fetchMock = vi.fn(function (this: typeof globalThis) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation')
      }

      return Promise.resolve(moonrakerResponse({ item: {} }))
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      const client = createMoonrakerClient({
        moonrakerUrl: 'http://moonraker.local',
      })

      await client.deletePrintFile?.('jobs/benchy.gcode')

      expect(fetchMock).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('deletes nested G-code files through the Moonraker file endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(moonrakerResponse({ item: {} }))
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await client.deletePrintFile?.('jobs/benchy v2.gcode')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://moonraker.local/server/files/gcodes/jobs/benchy%20v2.gcode',
      expect.objectContaining({
        method: 'DELETE',
        signal: expect.any(AbortSignal),
      }),
    )
  })

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

      if (url.includes('/server/history/totals')) {
        return Promise.resolve(moonrakerResponse({
          job_totals: {
            total_print_time: 437 * 60 * 60,
            total_time: 462 * 60 * 60,
            total_jobs: 126,
          },
        }))
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

    await client.fetchSnapshot()
    const requestedPaths = files.map((item) => item.path)
    const firstMetadata = client.fetchPrintFileMetadata?.(requestedPaths)
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
    await firstMetadata

    expect(maxActiveMetadataRequests).toBeLessThanOrEqual(2)
    expect(metadataRequestCount).toBe(5)

    await client.fetchPrintFileMetadata?.(requestedPaths)

    expect(metadataRequestCount).toBe(5)

    files[0] = {
      ...files[0],
      size: files[0].size + 1,
    }

    await client.fetchPrintFilesState()
    const secondMetadata = client.fetchPrintFileMetadata?.(requestedPaths)
    await vi.waitFor(() => {
      expect(metadataResolvers.length).toBeGreaterThan(0)
    })
    metadataResolvers.shift()?.()
    await secondMetadata

    expect(metadataRequestCount).toBe(6)
  })

  it('loads Moonraker history totals into usage snapshot', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/printer/objects/query')) {
        return Promise.resolve(moonrakerResponse(runtimeObjects()))
      }

      if (url.includes('/server/files/list')) {
        return Promise.resolve(moonrakerResponse([]))
      }

      if (url.includes('/server/history/totals')) {
        return Promise.resolve(moonrakerResponse({
          job_totals: {
            total_jobs: 126,
            total_time: 462 * 60 * 60,
            total_print_time: 437 * 60 * 60,
            total_filament_used: 824_500,
            longest_print: 18 * 60 * 60,
          },
        }))
      }

      return Promise.resolve(moonrakerResponse({}))
    })
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
    })

    const snapshot = await client.fetchSnapshot()

    expect(snapshot.usage).toEqual({
      totalPrintTimeSec: 437 * 60 * 60,
      totalJobTimeSec: 462 * 60 * 60,
      totalJobs: 126,
      totalFilamentUsedMm: 824_500,
      longestPrintSec: 18 * 60 * 60,
      updatedAt: expect.any(String),
      state: 'ready',
      message: null,
    })
  })

  it('refreshes runtime snapshot without fetching files, metadata, or history totals', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/printer/objects/query')) {
        return Promise.resolve(moonrakerResponse({
          eventtime: 42,
          status: {
            webhooks: {
              state: 'ready',
              state_message: 'Printer is ready',
            },
            extruder: {
              temperature: 214.6,
              target: 220,
            },
            heater_bed: {
              temperature: 59.2,
              target: 60,
            },
            fan: {
              speed: 0.42,
            },
            'output_pin chamber_light': {
              value: 1,
            },
            print_stats: {
              state: 'printing',
              filename: 'v2_part.gcode',
            },
            virtual_sdcard: {
              progress: 0.37,
            },
            display_status: {
              progress: 0.37,
            },
            pause_resume: {
              is_paused: true,
            },
            exclude_object: {
              current_object: 'part_2',
              excluded_objects: ['part_1'],
              objects: [
                {
                  name: 'part_1',
                  center: [40, 40],
                  polygon: [[20, 20], [60, 20], [60, 60], [20, 60]],
                },
                {
                  name: 'part_2',
                  center: [105, 40],
                  polygon: [[85, 20], [125, 20], [125, 60], [85, 60]],
                },
              ],
            },
            toolhead: {
              position: [122.5, 65, 12.34, 4.5],
              homed_axes: 'xyz',
            },
            'filament_switch_sensor filament_switch': {
              enabled: true,
              filament_detected: true,
            },
            'filament_motion_sensor filament_motion': {
              enabled: true,
              filament_detected: true,
            },
            'gcode_macro FILAMENT_SENSOR_STATUS': {
              mode: 'motion',
            },
            'gcode_macro _FILAMENT_SENSOR_SENSITIVITY_STATE': {
              sensitivity: 'high',
            },
          },
        }))
      }

      return Promise.resolve(moonrakerResponse({}))
    })
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
    })

    const snapshot = await client.fetchRuntimeSnapshot()

    expect(snapshot.extruderTemp).toBe(214.6)
    expect(snapshot.bedTemp).toBe(59.2)
    expect(snapshot.thermalTargets).toEqual({ nozzle: 220, bed: 60 })
    expect(snapshot.modelFanPercent).toBe(42)
    expect(snapshot.mainLightEnabled).toBe(true)
    expect(snapshot.printJob.filename).toBe('v2_part.gcode')
    expect(snapshot.printJob.isPaused).toBe(true)
    expect(snapshot.printJob.state).toBe('printing')
    expect(snapshot.files.progress).toBe(0.37)
    expect(snapshot.toolhead.rawX).toBe(122.5)
    expect(snapshot.connection).toBe('online')
    expect(snapshot.klippy.state).toBe('ready')
    expect(snapshot.excludeObjects.excludedObjectNames).toContain('part_1')
    expect(snapshot.filamentSensor).toEqual(expect.objectContaining({
      mode: 'motion',
      sensitivity: 'high',
      switchEnabled: true,
      motionEnabled: true,
    }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`http://moonraker.local${MOONRAKER_RUNTIME_OBJECTS_QUERY}`)
    expect(fetchMock.mock.calls.map((call) => call[0]).join('\n')).not.toContain('/server/files/list')
    expect(fetchMock.mock.calls.map((call) => call[0]).join('\n')).not.toContain('/server/files/metadata')
    expect(fetchMock.mock.calls.map((call) => call[0]).join('\n')).not.toContain('/server/history/totals')
  })

  it('refreshes usage through history totals without fetching runtime objects or files', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/server/history/totals')) {
        return Promise.resolve(moonrakerResponse({
          job_totals: {
            total_jobs: 9,
            total_print_time: 7200,
          },
        }))
      }

      return Promise.resolve(moonrakerResponse({}))
    })
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
    })

    const usage = await client.fetchUsage()

    expect(usage.totalJobs).toBe(9)
    expect(usage.totalPrintTimeSec).toBe(7200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://moonraker.local/server/history/totals')
  })

  it('refreshes filament sensor state through a minimal object query', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/printer/objects/query')) {
        return Promise.resolve(moonrakerResponse({
          status: {
            'gcode_macro FILAMENT_SENSOR_STATUS': { mode: 'motion' },
            'gcode_macro _FILAMENT_SENSOR_SENSITIVITY_STATE': { sensitivity: 'high' },
            'filament_switch_sensor filament_switch': { enabled: true, filament_detected: false },
            'filament_motion_sensor filament_motion': { enabled: true, filament_detected: true },
          },
        }))
      }

      return Promise.resolve(moonrakerResponse({}))
    })
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
    })

    const sensor = await client.fetchFilamentSensor()

    expect(sensor.sensitivity).toBe('high')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('filament_switch_sensor%20filament_switch')
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('toolhead')
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('/server/files/list')
  })

  it('refreshes print files without fetching runtime objects', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/server/files/list')) {
        return Promise.resolve(moonrakerResponse([]))
      }

      return Promise.resolve(moonrakerResponse({}))
    })
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
    })

    const files = await client.fetchPrintFilesState()

    expect(files.printFiles).toEqual([])
    expect(files.fileList).toEqual({ state: 'ready', message: null })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://moonraker.local/server/files/list?root=gcodes')
  })

  it('sorts the full file list without eagerly loading metadata', async () => {
    const files = Array.from({ length: 30 }, (_item, index) => ({
      path: `queue/part-${index}.gcode`,
      modified: 1_800_000_000 + index,
      size: 1_024 + index,
    }))
    const metadataUrls: string[] = []
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/printer/objects/query')) {
        return Promise.resolve(moonrakerResponse(runtimeObjects()))
      }

      if (url.includes('/server/files/list')) {
        return Promise.resolve(moonrakerResponse(files))
      }

      if (url.includes('/server/history/totals')) {
        return Promise.resolve(moonrakerResponse({
          job_totals: {
            total_print_time: 437 * 60 * 60,
          },
        }))
      }

      metadataUrls.push(url)
      return Promise.resolve(moonrakerResponse({
        estimated_time: 1200,
        filament_total: 300,
      }))
    })
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
    })

    const snapshot = await client.fetchSnapshot()

    expect(snapshot.printFiles).toHaveLength(30)
    expect(snapshot.printFiles.slice(0, 3).map((item) => item.path)).toEqual([
      'queue/part-29.gcode',
      'queue/part-28.gcode',
      'queue/part-27.gcode',
    ])
    expect(snapshot.printFiles.every((item) => item.metadataStatus === 'idle')).toBe(true)
    expect(metadataUrls).toEqual([])
  })

  it('loads metadata for a requested distant file and reports unavailable metadata without crashing', async () => {
    const files = Array.from({ length: 30 }, (_item, index) => ({
      path: `queue/part-${index}.gcode`,
      modified: 1_800_000_000 + index,
      size: 1_024 + index,
    }))
    const metadataUrls: string[] = []
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/printer/objects/query')) {
        return Promise.resolve(moonrakerResponse(runtimeObjects()))
      }

      if (url.includes('/server/files/list')) {
        return Promise.resolve(moonrakerResponse(files))
      }

      if (url.includes('/server/history/totals')) {
        return Promise.resolve(moonrakerResponse({ job_totals: {} }))
      }

      metadataUrls.push(url)
      if (url.includes('part-1.gcode')) {
        return Promise.resolve(moonrakerHttpError(404))
      }

      return Promise.resolve(moonrakerResponse({
        estimated_time: 3600,
        filament_weight_total: 12,
        filament_type: 'PLA',
      }))
    })
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
    })

    await client.fetchSnapshot()
    const metadataState = await client.fetchPrintFileMetadata?.(['queue/part-0.gcode', 'queue/part-1.gcode'])

    expect(metadataState?.printFiles).toEqual([
      expect.objectContaining({
        path: 'queue/part-0.gcode',
        printTime: '1 ч 00 мин',
        weight: '12 г',
        material: 'PLA',
        metadataStatus: 'ready',
      }),
      expect.objectContaining({
        path: 'queue/part-1.gcode',
        printTime: '—',
        metadataStatus: 'error',
      }),
    ])
    expect(metadataUrls.some((url) => url.includes('queue%2Fpart-0.gcode'))).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(
      '[treed-runtime] metadata unavailable for queue/part-1.gcode: Moonraker 404',
    )

    warnSpy.mockRestore()
  })

  it('prunes removed file metadata and identity entries before the path is reused', async () => {
    let files = [{ path: 'queue/part.gcode', modified: 100, size: 1024 }]
    let metadataVersion = 0
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/server/files/list')) {
        return Promise.resolve(moonrakerResponse(files))
      }

      metadataVersion += 1
      return Promise.resolve(moonrakerResponse({
        estimated_time: metadataVersion * 60,
      }))
    })
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
    })

    await client.fetchPrintFilesState()
    const firstMetadata = await client.fetchPrintFileMetadata?.(['queue/part.gcode'])
    files = []
    await client.fetchPrintFilesState()
    expect(await client.fetchPrintFileMetadata?.(['queue/part.gcode'])).toEqual(expect.objectContaining({
      printFiles: [],
    }))

    files = [{ path: 'queue/part.gcode', modified: 100, size: 1024 }]
    await client.fetchPrintFilesState()
    const secondMetadata = await client.fetchPrintFileMetadata?.(['queue/part.gcode'])

    expect(firstMetadata?.printFiles[0]?.printTime).toBe('1 мин')
    expect(secondMetadata?.printFiles[0]?.printTime).toBe('2 мин')
    expect(metadataVersion).toBe(2)
  })

  it('drops a late metadata response after its file path is removed and reused', async () => {
    let files = [{ path: 'queue/late.gcode', modified: 100, size: 1024 }]
    const metadata = createDeferred<Response>()
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/server/files/list')) {
        return Promise.resolve(moonrakerResponse(files))
      }

      return metadata.promise
    })
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
    })

    await client.fetchPrintFilesState()
    const pendingMetadata = client.fetchPrintFileMetadata?.(['queue/late.gcode'])
    files = []
    await client.fetchPrintFilesState()
    files = [{ path: 'queue/late.gcode', modified: 100, size: 1024 }]
    await client.fetchPrintFilesState()
    metadata.resolve(moonrakerResponse({ estimated_time: 60 }))

    await expect(pendingMetadata).resolves.toEqual(expect.objectContaining({
      printFiles: [],
    }))
  })

  it('keeps runtime snapshot usable when Moonraker file list fails', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/printer/objects/query')) {
        return Promise.resolve(moonrakerResponse(runtimeObjects()))
      }

      return Promise.resolve(moonrakerHttpError(503))
    })
    const client = createMoonrakerClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
    })

    const snapshot = await client.fetchSnapshot()

    expect(snapshot.connection).toBe('online')
    expect(snapshot.printFiles).toEqual([])
    expect(snapshot.fileList).toEqual({
      state: 'error',
      message: 'Moonraker 503',
    })
    expect(snapshot.usage).toEqual({
      totalPrintTimeSec: null,
      totalJobTimeSec: null,
      totalJobs: null,
      totalFilamentUsedMm: null,
      longestPrintSec: null,
      updatedAt: null,
      state: 'unavailable',
      message: 'Moonraker 503',
    })
  })
})
