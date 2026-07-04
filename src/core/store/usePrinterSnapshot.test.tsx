import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FALLBACK_PRINTER_SNAPSHOT, setPrinterSnapshot } from './printerStore'
import { usePrinterSnapshot } from './usePrinterSnapshot'
import type { PrinterSnapshot, TransportSubscriptionHandlers } from '../transport/types'

const runtimeMocks = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
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

describe('usePrinterSnapshot', () => {
  let handlers: TransportSubscriptionHandlers | null = null

  beforeEach(() => {
    runtimeMocks.fetchSnapshot.mockReset()
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

    const websocketSnapshot = createSnapshot(20, 220, 10)
    const staleHttpSnapshot = createSnapshot(null, 180, 3)

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

    expect(hook.result.current.snapshot.extruderTemp).toBe(220)
    expect(hook.result.current.snapshot.toolhead.rawX).toBe(10)

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
