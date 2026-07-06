import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FALLBACK_PRINTER_SNAPSHOT, setPrinterSnapshot } from './printerStore'
import { usePrinterSnapshot } from './usePrinterSnapshot'
import type { PrinterSnapshot, TransportSubscriptionHandlers } from '../transport/types'

const runtimeMocks = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
  fetchRuntimeSnapshot: vi.fn(),
  fetchUsage: vi.fn(),
  fetchFilamentSensor: vi.fn(),
  fetchEddyState: vi.fn(),
  fetchExcludeObjects: vi.fn(),
  fetchPrintJobState: vi.fn(),
  fetchPrintFilesState: vi.fn(),
  fetchMotionState: vi.fn(),
  deletePrintFile: vi.fn(),
  subscribe: vi.fn(),
}))

vi.mock('#runtime', () => ({
  runtimeMode: 'live',
  createTransportClient: () => ({
    fetchSnapshot: runtimeMocks.fetchSnapshot,
    fetchRuntimeSnapshot: runtimeMocks.fetchRuntimeSnapshot,
    fetchUsage: runtimeMocks.fetchUsage,
    fetchFilamentSensor: runtimeMocks.fetchFilamentSensor,
    fetchEddyState: runtimeMocks.fetchEddyState,
    fetchExcludeObjects: runtimeMocks.fetchExcludeObjects,
    fetchPrintJobState: runtimeMocks.fetchPrintJobState,
    fetchPrintFilesState: runtimeMocks.fetchPrintFilesState,
    fetchMotionState: runtimeMocks.fetchMotionState,
    deletePrintFile: runtimeMocks.deletePrintFile,
    subscribe: runtimeMocks.subscribe,
  }),
}))

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

function createSnapshot(eventtime: number | null, extruderTemp: number, toolheadX: number): PrinterSnapshot {
  const snapshot = structuredClone(FALLBACK_PRINTER_SNAPSHOT)
  snapshot.revisions.printerObjects.eventtime = eventtime
  snapshot.extruderTemp = extruderTemp
  snapshot.toolhead.rawX = toolheadX
  snapshot.updatedAt = '2026-06-30T00:00:00.000Z'
  return snapshot
}

function applyRuntimeFields(snapshot: PrinterSnapshot, seed: number): PrinterSnapshot {
  snapshot.revisions.printerObjects.eventtime = seed
  snapshot.connection = seed % 2 === 0 ? 'online' : 'degraded'
  snapshot.klippy = {
    state: seed % 2 === 0 ? 'ready' : 'startup',
    message: `klippy-${seed}`,
  }
  snapshot.extruderTemp = 180 + seed
  snapshot.bedTemp = 50 + seed
  snapshot.thermalTargets = {
    nozzle: 200 + seed,
    bed: 60 + seed,
  }
  snapshot.modelFanPercent = seed
  snapshot.mainLightEnabled = seed % 2 === 0
  snapshot.printJob = {
    ...snapshot.printJob,
    filename: `job-${seed}.gcode`,
    state: seed % 2 === 0 ? 'printing' : 'standby',
    progress: seed / 100,
    progressPercent: seed,
    isActive: seed % 2 === 0,
  }
  snapshot.files = {
    ...snapshot.files,
    type: 'virtual_sdcard',
    path: `job-${seed}.gcode`,
    progress: seed / 100,
    isActive: seed % 2 === 0,
  }
  snapshot.toolhead = {
    ...snapshot.toolhead,
    rawX: seed,
    rawY: seed + 1,
    rawZ: seed + 2,
  }
  snapshot.toolheadX = seed
  snapshot.toolheadY = seed + 1
  snapshot.toolheadZ = seed + 2
  snapshot.updatedAt = `2026-06-30T00:00:${String(seed).padStart(2, '0')}.000Z`
  return snapshot
}

function expectRuntimeFields(snapshot: PrinterSnapshot, seed: number): void {
  expect(snapshot.extruderTemp).toBe(180 + seed)
  expect(snapshot.bedTemp).toBe(50 + seed)
  expect(snapshot.thermalTargets).toEqual({
    nozzle: 200 + seed,
    bed: 60 + seed,
  })
  expect(snapshot.modelFanPercent).toBe(seed)
  expect(snapshot.mainLightEnabled).toBe(seed % 2 === 0)
  expect(snapshot.printJob).toEqual(expect.objectContaining({
    filename: `job-${seed}.gcode`,
    state: seed % 2 === 0 ? 'printing' : 'standby',
    progress: seed / 100,
  }))
  expect(snapshot.files).toEqual(expect.objectContaining({
    path: `job-${seed}.gcode`,
    progress: seed / 100,
  }))
  expect(snapshot.toolhead).toEqual(expect.objectContaining({
    rawX: seed,
    rawY: seed + 1,
    rawZ: seed + 2,
  }))
  expect(snapshot.connection).toBe(seed % 2 === 0 ? 'online' : 'degraded')
  expect(snapshot.klippy.state).toBe(seed % 2 === 0 ? 'ready' : 'startup')
}

describe('usePrinterSnapshot', () => {
  let handlers: TransportSubscriptionHandlers | null = null

  beforeEach(() => {
    runtimeMocks.fetchSnapshot.mockReset()
    runtimeMocks.fetchRuntimeSnapshot.mockReset()
    runtimeMocks.fetchUsage.mockReset()
    runtimeMocks.fetchFilamentSensor.mockReset()
    runtimeMocks.fetchEddyState.mockReset()
    runtimeMocks.fetchExcludeObjects.mockReset()
    runtimeMocks.fetchPrintJobState.mockReset()
    runtimeMocks.fetchPrintFilesState.mockReset()
    runtimeMocks.fetchMotionState.mockReset()
    runtimeMocks.deletePrintFile.mockReset()
    runtimeMocks.subscribe.mockReset()
    handlers = null
    setPrinterSnapshot(structuredClone(FALLBACK_PRINTER_SNAPSHOT))
  })

  afterEach(() => {
    vi.useRealTimers()
    setPrinterSnapshot(structuredClone(FALLBACK_PRINTER_SNAPSHOT))
  })

  it('keeps a newer websocket snapshot when an older HTTP refresh resolves later', async () => {
    vi.useFakeTimers()
    const refresh = createDeferred<PrinterSnapshot>()

    runtimeMocks.fetchSnapshot.mockReturnValue(refresh.promise)
    runtimeMocks.subscribe.mockImplementation((nextHandlers: TransportSubscriptionHandlers) => {
      handlers = nextHandlers
      return { close: vi.fn() }
    })

    let hook!: {
      result: { current: ReturnType<typeof usePrinterSnapshot> }
      unmount: () => void
    }
    await act(async () => {
      hook = renderHook(() => usePrinterSnapshot(60_000))
      await Promise.resolve()
    })
    vi.clearAllTimers()

    expect(handlers).not.toBeNull()

    const websocketSnapshot = applyRuntimeFields(createSnapshot(20, 220, 10), 20)
    const staleHttpSnapshot = applyRuntimeFields(createSnapshot(null, 180, 3), 3)

    await act(async () => {
      const refreshPromise = hook.result.current.refresh()
      handlers?.onSnapshot(websocketSnapshot)
      refresh.resolve(staleHttpSnapshot)
      await refreshPromise
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expectRuntimeFields(hook.result.current.snapshot, 20)

    await act(async () => {
      hook.unmount()
    })
  })

  it('keeps HTTP usage totals when a websocket snapshot omits history data', async () => {
    vi.useFakeTimers()
    runtimeMocks.fetchSnapshot.mockReturnValue(new Promise<PrinterSnapshot>(() => undefined))
    runtimeMocks.subscribe.mockImplementation((nextHandlers: TransportSubscriptionHandlers) => {
      handlers = nextHandlers
      return { close: vi.fn() }
    })

    const initialSnapshot = createSnapshot(10, 180, 3)
    initialSnapshot.usage = {
      totalPrintTimeSec: 120,
      totalJobTimeSec: 150,
      totalJobs: 3,
      totalFilamentUsedMm: 400,
      longestPrintSec: 80,
      updatedAt: '2026-06-30T00:00:01.000Z',
      state: 'ready',
      message: null,
    }
    setPrinterSnapshot(initialSnapshot)

    let hook!: {
      result: { current: ReturnType<typeof usePrinterSnapshot> }
      unmount: () => void
    }
    await act(async () => {
      hook = renderHook(() => usePrinterSnapshot(60_000))
      await Promise.resolve()
    })
    vi.clearAllTimers()

    const websocketSnapshot = createSnapshot(20, 220, 10)
    await act(async () => {
      handlers?.onSnapshot(websocketSnapshot)
    })

    expect(hook.result.current.snapshot.extruderTemp).toBe(220)
    expect(hook.result.current.snapshot.usage).toEqual(initialSnapshot.usage)

    await act(async () => {
      hook.unmount()
    })
  })

  it('applies HTTP usage totals when a websocket snapshot wins the state race', async () => {
    vi.useFakeTimers()
    const refresh = createDeferred<PrinterSnapshot>()

    runtimeMocks.fetchSnapshot.mockReturnValue(refresh.promise)
    runtimeMocks.subscribe.mockImplementation((nextHandlers: TransportSubscriptionHandlers) => {
      handlers = nextHandlers
      return { close: vi.fn() }
    })

    let hook!: {
      result: { current: ReturnType<typeof usePrinterSnapshot> }
      unmount: () => void
    }
    await act(async () => {
      hook = renderHook(() => usePrinterSnapshot(60_000))
      await Promise.resolve()
    })
    vi.clearAllTimers()

    const websocketSnapshot = createSnapshot(20, 220, 10)
    const httpSnapshot = createSnapshot(10, 180, 3)
    httpSnapshot.usage = {
      totalPrintTimeSec: 3600,
      totalJobTimeSec: 4200,
      totalJobs: 12,
      totalFilamentUsedMm: 900,
      longestPrintSec: 1800,
      updatedAt: '2026-06-30T01:00:00.000Z',
      state: 'ready',
      message: null,
    }

    await act(async () => {
      const refreshPromise = hook.result.current.refresh()
      handlers?.onSnapshot(websocketSnapshot)
      refresh.resolve(httpSnapshot)
      await refreshPromise
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(hook.result.current.snapshot.extruderTemp).toBe(220)
    expect(hook.result.current.snapshot.toolhead.rawX).toBe(10)
    expect(hook.result.current.snapshot.usage).toEqual(httpSnapshot.usage)

    await act(async () => {
      hook.unmount()
    })
  })

  it('applies fresh HTTP runtime fields when a refresh resolves after older websocket state', async () => {
    vi.useFakeTimers()
    const refresh = createDeferred<PrinterSnapshot>()

    runtimeMocks.fetchSnapshot.mockReturnValue(refresh.promise)
    runtimeMocks.subscribe.mockImplementation((nextHandlers: TransportSubscriptionHandlers) => {
      handlers = nextHandlers
      return { close: vi.fn() }
    })

    let hook!: {
      result: { current: ReturnType<typeof usePrinterSnapshot> }
      unmount: () => void
    }
    await act(async () => {
      hook = renderHook(() => usePrinterSnapshot(60_000))
      await Promise.resolve()
    })
    vi.clearAllTimers()

    const websocketSnapshot = applyRuntimeFields(createSnapshot(20, 220, 10), 20)
    const httpSnapshot = applyRuntimeFields(createSnapshot(21, 225, 12), 22)
    httpSnapshot.revisions.printerObjects.eventtime = 21

    await act(async () => {
      const refreshPromise = hook.result.current.refresh()
      handlers?.onSnapshot(websocketSnapshot)
      refresh.resolve(httpSnapshot)
      await refreshPromise
      await Promise.resolve()
      await Promise.resolve()
    })

    expectRuntimeFields(hook.result.current.snapshot, 22)
    expect(hook.result.current.snapshot.revisions.printerObjects.eventtime).toBe(21)

    await act(async () => {
      hook.unmount()
    })
  })

  it('caps live HTTP fallback at two seconds when websocket is available', async () => {
    vi.useFakeTimers()
    runtimeMocks.fetchSnapshot.mockResolvedValue(createSnapshot(1, 180, 3))
    runtimeMocks.fetchRuntimeSnapshot.mockResolvedValue(createSnapshot(2, 181, 4))
    runtimeMocks.subscribe.mockImplementation((nextHandlers: TransportSubscriptionHandlers) => {
      handlers = nextHandlers
      return { close: vi.fn() }
    })

    let hook!: {
      result: { current: ReturnType<typeof usePrinterSnapshot> }
      unmount: () => void
    }
    await act(async () => {
      hook = renderHook(() => usePrinterSnapshot(60_000))
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(runtimeMocks.fetchSnapshot).toHaveBeenCalledTimes(1)
    expect(runtimeMocks.fetchRuntimeSnapshot).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999)
    })
    expect(runtimeMocks.fetchSnapshot).toHaveBeenCalledTimes(1)
    expect(runtimeMocks.fetchRuntimeSnapshot).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(runtimeMocks.fetchSnapshot).toHaveBeenCalledTimes(1)
    expect(runtimeMocks.fetchRuntimeSnapshot).toHaveBeenCalledTimes(1)

    await act(async () => {
      hook.unmount()
    })
  })

  it('updates runtime fields through HTTP fallback when websocket is silent', async () => {
    vi.useFakeTimers()
    const initialSnapshot = applyRuntimeFields(createSnapshot(1, 181, 1), 1)
    initialSnapshot.usage = {
      totalPrintTimeSec: 120,
      totalJobTimeSec: 150,
      totalJobs: 3,
      totalFilamentUsedMm: 400,
      longestPrintSec: 80,
      updatedAt: '2026-06-30T00:00:01.000Z',
      state: 'ready',
      message: null,
    }
    initialSnapshot.fileList = { state: 'ready', message: null }
    initialSnapshot.printFiles = [
      {
        id: 'file-jobs-benchy-gcode',
        path: 'jobs/benchy.gcode',
        name: 'benchy.gcode',
        directory: 'jobs',
        printTime: '20 мин',
        weight: '—',
        material: '—',
        addedAt: '2026-06-30T01:00:00.000Z',
      },
    ]
    initialSnapshot.revisions.files = {
      eventtime: null,
      receivedAt: 10,
      source: 'http',
    }
    const nextRuntimeSnapshot = applyRuntimeFields(createSnapshot(2, 182, 2), 24)
    nextRuntimeSnapshot.revisions.printerObjects.eventtime = 2
    runtimeMocks.fetchSnapshot.mockResolvedValue(initialSnapshot)
    runtimeMocks.fetchRuntimeSnapshot.mockResolvedValue(nextRuntimeSnapshot)
    runtimeMocks.subscribe.mockImplementation((nextHandlers: TransportSubscriptionHandlers) => {
      handlers = nextHandlers
      return { close: vi.fn() }
    })

    let hook!: {
      result: { current: ReturnType<typeof usePrinterSnapshot> }
      unmount: () => void
    }
    await act(async () => {
      hook = renderHook(() => usePrinterSnapshot(60_000))
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expectRuntimeFields(hook.result.current.snapshot, 1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(runtimeMocks.fetchRuntimeSnapshot).toHaveBeenCalledTimes(1)
    expectRuntimeFields(hook.result.current.snapshot, 24)
    expect(hook.result.current.snapshot.usage).toEqual(initialSnapshot.usage)
    expect(hook.result.current.snapshot.printFiles).toEqual(initialSnapshot.printFiles)
    expect(hook.result.current.snapshot.fileList).toEqual(initialSnapshot.fileList)
    expect(hook.result.current.snapshot.revisions.files).toEqual(initialSnapshot.revisions.files)

    await act(async () => {
      hook.unmount()
    })
  })

  it('refreshes usage totals without replacing the printer snapshot', async () => {
    vi.useFakeTimers()
    runtimeMocks.fetchSnapshot.mockResolvedValue(createSnapshot(1, 180, 3))
    runtimeMocks.subscribe.mockImplementation((nextHandlers: TransportSubscriptionHandlers) => {
      handlers = nextHandlers
      return { close: vi.fn() }
    })

    const initialSnapshot = createSnapshot(10, 205, 33)
    initialSnapshot.usage = {
      totalPrintTimeSec: 120,
      totalJobTimeSec: 150,
      totalJobs: 3,
      totalFilamentUsedMm: 400,
      longestPrintSec: 80,
      updatedAt: '2026-06-30T00:00:01.000Z',
      state: 'ready',
      message: null,
    }
    const nextUsage = {
      ...initialSnapshot.usage,
      totalPrintTimeSec: 3600,
      totalJobs: 12,
      updatedAt: '2026-06-30T01:00:00.000Z',
    }
    setPrinterSnapshot(initialSnapshot)
    runtimeMocks.fetchUsage.mockResolvedValue(nextUsage)

    let hook!: {
      result: { current: ReturnType<typeof usePrinterSnapshot> }
      unmount: () => void
    }
    await act(async () => {
      hook = renderHook(() => usePrinterSnapshot(60_000))
      await Promise.resolve()
    })
    vi.clearAllTimers()
    runtimeMocks.fetchSnapshot.mockClear()

    await act(async () => {
      await hook.result.current.refreshUsage()
    })

    expect(runtimeMocks.fetchUsage).toHaveBeenCalledTimes(1)
    expect(runtimeMocks.fetchSnapshot).not.toHaveBeenCalled()
    expect(hook.result.current.snapshot.usage).toEqual(nextUsage)
    expect(hook.result.current.snapshot.extruderTemp).toBe(205)
    expect(hook.result.current.snapshot.toolhead.rawX).toBe(33)

    await act(async () => {
      hook.unmount()
    })
  })

  it('refreshes file list change events without fetching a full snapshot', async () => {
    vi.useFakeTimers()
    runtimeMocks.fetchSnapshot.mockResolvedValue(createSnapshot(1, 180, 3))
    runtimeMocks.subscribe.mockImplementation((nextHandlers: TransportSubscriptionHandlers) => {
      handlers = nextHandlers
      return { close: vi.fn() }
    })
    const printFilesState: PrinterSnapshot['printFiles'] = [
      {
        id: 'file-jobs-benchy-gcode',
        path: 'jobs/benchy.gcode',
        name: 'benchy.gcode',
        directory: 'jobs',
        printTime: '20 мин',
        weight: '—',
        material: '—',
        addedAt: '2026-06-30T01:00:00.000Z',
      },
    ]
    runtimeMocks.fetchPrintFilesState.mockResolvedValue({
      fileList: { state: 'ready', message: null },
      printFiles: printFilesState,
      revisions: {
        printerObjects: {
          eventtime: null,
          receivedAt: 1,
          source: 'http',
        },
        files: {
          eventtime: null,
          receivedAt: 2,
          source: 'http',
        },
      },
    })

    let hook!: {
      result: { current: ReturnType<typeof usePrinterSnapshot> }
      unmount: () => void
    }
    await act(async () => {
      hook = renderHook(() => usePrinterSnapshot(60_000))
      await Promise.resolve()
    })
    vi.clearAllTimers()
    runtimeMocks.fetchSnapshot.mockClear()

    await act(async () => {
      handlers?.onFileListChanged?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(runtimeMocks.fetchPrintFilesState).toHaveBeenCalledTimes(1)
    expect(runtimeMocks.fetchSnapshot).not.toHaveBeenCalled()
    expect(hook.result.current.snapshot.printFiles).toEqual(printFilesState)
    expect(hook.result.current.snapshot.fileList).toEqual({ state: 'ready', message: null })

    await act(async () => {
      hook.unmount()
    })
  })
})
