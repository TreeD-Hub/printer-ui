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
  snapshot.updatedAt = '2026-07-04T00:00:00.000Z'
  return snapshot
}

describe('usePrinterSnapshot initial file loading', () => {
  let handlers: TransportSubscriptionHandlers | null = null

  beforeEach(() => {
    for (const mock of Object.values(runtimeMocks)) {
      mock.mockReset()
    }
    handlers = null
    setPrinterSnapshot(structuredClone(FALLBACK_PRINTER_SNAPSHOT))
  })

  afterEach(() => {
    vi.useRealTimers()
    setPrinterSnapshot(structuredClone(FALLBACK_PRINTER_SNAPSHOT))
  })

  it('keeps live WebSocket state and applies files from a slower initial HTTP snapshot', async () => {
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
    httpSnapshot.fileList = { state: 'ready', message: null }
    httpSnapshot.printFiles = [
      {
        id: 'file-jobs-benchy-gcode',
        path: 'jobs/benchy.gcode',
        name: 'benchy.gcode',
        directory: 'jobs',
        printTime: '20 мин',
        weight: '—',
        material: '—',
        addedAt: '2026-07-04T01:00:00.000Z',
      },
    ]
    httpSnapshot.revisions.files = {
      eventtime: null,
      receivedAt: 10,
      source: 'http',
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
    expect(hook.result.current.snapshot.fileList).toEqual({ state: 'ready', message: null })
    expect(hook.result.current.snapshot.printFiles).toEqual(httpSnapshot.printFiles)
    expect(hook.result.current.snapshot.revisions.files).toEqual(httpSnapshot.revisions.files)

    await act(async () => {
      hook.unmount()
    })
  })
})
