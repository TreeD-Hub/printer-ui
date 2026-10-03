import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createTransportClient } from '#runtime'
import { receivePrinterGcodeResponse } from './printerNotifications'
import { recordOperationalDiagnostic } from '../../diagnostics'
import { getPrinterConnectionState } from '../transport/types'
import type {
  FilamentSensorSnapshot,
  PrinterEddyStateSnapshot,
  PrinterExcludeObjectSnapshot,
  PrinterMotionStateSnapshot,
  PrinterPrintFilesMetadataSnapshot,
  PrinterPrintFilesStateSnapshot,
  PrinterPrintJobStateSnapshot,
  PrinterConnectionState,
  PrinterSnapshot,
  PrinterUsageSnapshot,
} from '../transport/types'
import {
  setPrinterSnapshot,
  updatePrinterSnapshot,
  usePrinterStoreSelector,
} from './printerStore'

const POLLING_INTERVAL_MS = 2_000
const WEBSOCKET_WATCHDOG_INTERVAL_MS = 15_000

const selectPrinterSnapshot = (snapshot: PrinterSnapshot) => snapshot

function mergeRuntimeSnapshot(previous: PrinterSnapshot, next: PrinterSnapshot): PrinterSnapshot {
  return {
    ...next,
    usage: next.usage.state === 'ready' ? next.usage : previous.usage,
    printFiles: next.printFiles.length > 0 ? next.printFiles : previous.printFiles,
    fileList: next.fileList?.state === 'unknown' ? previous.fileList : next.fileList ?? previous.fileList,
    revisions: {
      ...next.revisions,
      files: next.revisions.files ?? previous.revisions.files,
    },
  }
}

function hasHttpSupplementalData(next: PrinterSnapshot): boolean {
  return next.usage.state === 'ready'
    || (next.fileList !== undefined && next.fileList.state !== 'unknown')
}

function hasNewerRuntimeSnapshot(previous: PrinterSnapshot, next: PrinterSnapshot): boolean {
  const previousEventtime = previous.revisions.printerObjects.eventtime
  const nextEventtime = next.revisions.printerObjects.eventtime

  if (nextEventtime !== null && previousEventtime !== null) {
    return nextEventtime > previousEventtime
  }

  if (nextEventtime !== null) {
    return true
  }

  if (previousEventtime !== null) {
    return false
  }

  return false
}

function mergeHttpSupplementalSnapshot(previous: PrinterSnapshot, next: PrinterSnapshot): PrinterSnapshot {
  const fileList = next.fileList
  const hasFileListResult = fileList !== undefined && fileList.state !== 'unknown'

  return {
    ...previous,
    usage: next.usage.state === 'ready' ? next.usage : previous.usage,
    ...(hasFileListResult
      ? {
          fileList,
          printFiles: fileList.state === 'ready' ? next.printFiles : previous.printFiles,
          revisions: {
            ...previous.revisions,
            files: next.revisions.files ?? previous.revisions.files,
          },
        }
      : {}),
  }
}

function getTransportState(connection: PrinterConnectionState): PrinterSnapshot['transport']['state'] {
  if (connection === 'reconnecting' || connection === 'offline' || connection === 'connecting') {
    return connection
  }

  return 'online'
}

function getFailureTransportState(previous: PrinterSnapshot): PrinterSnapshot['transport']['state'] {
  return previous.transport.state === 'offline' ? 'offline' : 'reconnecting'
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}

function normalizeRequestedMetadataPaths(paths: readonly string[]): string[] {
  const seenPaths = new Set<string>()
  const nextPaths: string[] = []

  for (const path of paths) {
    const normalizedPath = path.trim().replace(/\\/g, '/').replace(/^\/+/, '')
    if (normalizedPath.length === 0 || seenPaths.has(normalizedPath)) {
      continue
    }

    seenPaths.add(normalizedPath)
    nextPaths.push(normalizedPath)
  }

  return nextPaths
}

function markPrintFileMetadataLoading(previous: PrinterSnapshot, paths: readonly string[]): PrinterSnapshot {
  if (paths.length === 0) {
    return previous
  }

  const requestedPaths = new Set(paths)
  let didChange = false
  const printFiles = previous.printFiles.map((item) => {
    if (
      !requestedPaths.has(item.path) ||
      item.metadataStatus === 'ready' ||
      item.metadataStatus === 'loading' ||
      item.metadataStatus === 'queued'
    ) {
      return item
    }

    didChange = true
    return {
      ...item,
      metadataStatus: 'loading' as const,
      metadataError: null,
    }
  })

  return didChange
    ? {
        ...previous,
        printFiles,
      }
    : previous
}

function mergePrintFileMetadata(
  previous: PrinterSnapshot,
  printFilesMetadata: PrinterPrintFilesMetadataSnapshot,
): PrinterSnapshot {
  if (printFilesMetadata.printFiles.length === 0) {
    return previous
  }

  const metadataByPath = new Map(printFilesMetadata.printFiles.map((item) => [item.path, item]))
  const printFiles = previous.printFiles.map((item) => {
    const nextItem = metadataByPath.get(item.path)
    if (nextItem === undefined) {
      return item
    }

    return {
      ...item,
      ...nextItem,
    }
  })

  return {
    ...previous,
    printFiles,
    revisions: {
      ...previous.revisions,
      files: printFilesMetadata.revisions.files ?? previous.revisions.files,
    },
  }
}

export function usePrinterSnapshot(pollIntervalMs = 2_000) {
  const snapshot = usePrinterStoreSelector(selectPrinterSnapshot)
  const [error, setError] = useState<string>('')
  const lastTransitionRef = useRef<string>('')
  const runtimeSourceRef = useRef<'websocket' | 'polling'>('polling')
  const lastWebsocketSnapshotAtRef = useRef<number | null>(null)
  const runtimeEpochRef = useRef(0)
  const refreshSequenceRef = useRef(0)
  const targetedRefreshSequenceRef = useRef(new Map<string, number>())

  const client = useMemo(() => {
    return createTransportClient()
  }, [])

  const recordSnapshotTransition = useCallback((nextSnapshot: PrinterSnapshot): void => {
    const transition = [
      nextSnapshot.transport.state,
      nextSnapshot.klippy.state,
      nextSnapshot.printJob.state,
    ].join(' -> ')
    if (transition === lastTransitionRef.current) {
      return
    }

    lastTransitionRef.current = transition
    recordOperationalDiagnostic('state-transition', transition, nextSnapshot.message || null)
  }, [])

  const refresh = useCallback(async () => {
    const refreshSequence = ++refreshSequenceRef.current
    const runtimeEpoch = runtimeEpochRef.current

    try {
      const nextSnapshot = await client.fetchSnapshot()
      if (refreshSequence !== refreshSequenceRef.current) {
        return
      }

      if (runtimeSourceRef.current === 'websocket' || runtimeEpoch !== runtimeEpochRef.current) {
        if (hasHttpSupplementalData(nextSnapshot)) {
          updatePrinterSnapshot((prev) => mergeHttpSupplementalSnapshot(prev, nextSnapshot))
          setError('')
        }
        return
      }

      recordSnapshotTransition(nextSnapshot)
      runtimeEpochRef.current += 1
      setPrinterSnapshot(nextSnapshot)
      setError('')
    } catch (err) {
      if (refreshSequence !== refreshSequenceRef.current || runtimeSourceRef.current === 'websocket' || runtimeEpoch !== runtimeEpochRef.current) {
        return
      }

      const message = getErrorMessage(err)
      recordOperationalDiagnostic('transport-error', message)
      updatePrinterSnapshot((prev) => ({
        ...prev,
        transport: {
          state: getFailureTransportState(prev),
          message: `Ошибка связи: ${message}`,
        },
        message: `Ошибка связи: ${message}`,
        updatedAt: new Date().toISOString(),
      }))
      setError(message)
    }
  }, [client, recordSnapshotTransition])

  const refreshRuntime = useCallback(async () => {
    const runtimeEpoch = runtimeEpochRef.current

    try {
      const nextSnapshot = await client.fetchRuntimeSnapshot()
      if (runtimeEpoch !== runtimeEpochRef.current) {
        return
      }

      if (runtimeSourceRef.current === 'websocket') {
        let isWebsocketStale = false
        updatePrinterSnapshot((prev) => {
          isWebsocketStale = hasNewerRuntimeSnapshot(prev, nextSnapshot)
          return isWebsocketStale ? mergeRuntimeSnapshot(prev, nextSnapshot) : prev
        })
        if (!isWebsocketStale) {
          return
        }
        runtimeSourceRef.current = 'polling'
      } else {
        updatePrinterSnapshot((prev) => mergeRuntimeSnapshot(prev, nextSnapshot))
      }
      recordSnapshotTransition(nextSnapshot)
      runtimeEpochRef.current += 1
      setError('')
    } catch (err) {
      const hasFreshWebsocketSnapshot = runtimeSourceRef.current === 'websocket'
        && lastWebsocketSnapshotAtRef.current !== null
        && Date.now() - lastWebsocketSnapshotAtRef.current < WEBSOCKET_WATCHDOG_INTERVAL_MS
      if (runtimeEpoch !== runtimeEpochRef.current || hasFreshWebsocketSnapshot) {
        return
      }

      runtimeSourceRef.current = 'polling'
      runtimeEpochRef.current += 1
      const message = getErrorMessage(err)
      recordOperationalDiagnostic('transport-error', message)
      updatePrinterSnapshot((prev) => ({
        ...prev,
        transport: {
          state: getFailureTransportState(prev),
          message: `Ошибка связи: ${message}`,
        },
        message: `Ошибка связи: ${message}`,
        updatedAt: new Date().toISOString(),
      }))
      setError(message)
    }
  }, [client, recordSnapshotTransition])

  const applyTargetedRefresh = useCallback(async <T,>(
    action: string,
    fetchValue: () => Promise<T>,
    mergeValue: (previous: PrinterSnapshot, value: T) => PrinterSnapshot,
    guardRuntimeRevision = false,
  ): Promise<void> => {
    if (guardRuntimeRevision && runtimeSourceRef.current === 'websocket') {
      return
    }
    const requestSequence = (targetedRefreshSequenceRef.current.get(action) ?? 0) + 1
    targetedRefreshSequenceRef.current.set(action, requestSequence)
    const runtimeEpoch = runtimeEpochRef.current
    const isRequestCurrent = (): boolean => {
      return targetedRefreshSequenceRef.current.get(action) === requestSequence
        && (!guardRuntimeRevision || (runtimeSourceRef.current !== 'websocket' && runtimeEpochRef.current === runtimeEpoch))
    }

    try {
      const value = await fetchValue()
      if (!isRequestCurrent()) {
        return
      }

      updatePrinterSnapshot((prev) => mergeValue(prev, value))
      if (guardRuntimeRevision) {
        runtimeEpochRef.current += 1
      }
      setError('')
    } catch (err) {
      if (!isRequestCurrent()) {
        return
      }

      const message = getErrorMessage(err)
      recordOperationalDiagnostic('transport-error', `${action}: ${message}`)
      setError(message)
    }
  }, [])

  const refreshUsage = useCallback(async (): Promise<void> => {
    await applyTargetedRefresh(
      'refresh-usage',
      client.fetchUsage,
      (prev, usage: PrinterUsageSnapshot) => ({
        ...prev,
        usage,
      }),
    )
  }, [applyTargetedRefresh, client.fetchUsage])

  const refreshFilamentSensor = useCallback(async (): Promise<void> => {
    await applyTargetedRefresh(
      'refresh-filament-sensor',
      client.fetchFilamentSensor,
      (prev, filamentSensor: FilamentSensorSnapshot) => ({
        ...prev,
        filamentSensor,
      }),
      true,
    )
  }, [applyTargetedRefresh, client.fetchFilamentSensor])

  const refreshEddyState = useCallback(async (): Promise<void> => {
    await applyTargetedRefresh(
      'refresh-eddy-state',
      client.fetchEddyState,
      (prev, eddyState: PrinterEddyStateSnapshot) => ({
        ...prev,
        v2: {
          ...prev.v2,
          eddy: {
            ...prev.v2.eddy,
            autosaveEnabled: eddyState.autosaveEnabled,
            autosavePending: eddyState.autosavePending,
            calibration: eddyState.calibration,
          },
        },
      }),
      true,
    )
  }, [applyTargetedRefresh, client.fetchEddyState])

  const refreshExcludeObjects = useCallback(async (): Promise<void> => {
    await applyTargetedRefresh(
      'refresh-exclude-objects',
      client.fetchExcludeObjects,
      (prev, excludeObjects: PrinterExcludeObjectSnapshot) => ({
        ...prev,
        excludeObjects,
      }),
      true,
    )
  }, [applyTargetedRefresh, client.fetchExcludeObjects])

  const refreshPrintJob = useCallback(async (): Promise<void> => {
    await applyTargetedRefresh(
      'refresh-print-job',
      client.fetchPrintJobState,
      (prev, printJobState: PrinterPrintJobStateSnapshot) => ({
        ...prev,
        excludeObjects: printJobState.excludeObjects,
        files: printJobState.files,
        message: printJobState.message,
        printJob: printJobState.printJob,
        updatedAt: printJobState.updatedAt,
      }),
      true,
    )
  }, [applyTargetedRefresh, client.fetchPrintJobState])

  const refreshPrintFiles = useCallback(async (): Promise<void> => {
    await applyTargetedRefresh(
      'refresh-print-files',
      client.fetchPrintFilesState,
      (prev, printFilesState: PrinterPrintFilesStateSnapshot) => ({
        ...prev,
        fileList: printFilesState.fileList,
        printFiles: printFilesState.printFiles,
        revisions: {
          ...prev.revisions,
          files: printFilesState.revisions.files,
        },
      }),
    )
  }, [applyTargetedRefresh, client.fetchPrintFilesState])

  const refreshPrintFileMetadata = useCallback(async (paths: string[]): Promise<void> => {
    const fetchPrintFileMetadata = client.fetchPrintFileMetadata
    if (fetchPrintFileMetadata === undefined) {
      return
    }

    const requestedPaths = normalizeRequestedMetadataPaths(paths)
    if (requestedPaths.length === 0) {
      return
    }

    updatePrinterSnapshot((prev) => markPrintFileMetadataLoading(prev, requestedPaths))

    await applyTargetedRefresh(
      'refresh-print-file-metadata',
      () => fetchPrintFileMetadata(requestedPaths),
      mergePrintFileMetadata,
    )
  }, [applyTargetedRefresh, client])

  const refreshMotionState = useCallback(async (): Promise<void> => {
    await applyTargetedRefresh(
      'refresh-motion-state',
      client.fetchMotionState,
      (prev, motionState: PrinterMotionStateSnapshot) => ({
        ...prev,
        geometry: motionState.geometry,
        homedAxes: motionState.homedAxes,
        limits: { ...prev.limits, axis: motionState.axisLimits },
        message: motionState.message,
        toolhead: motionState.toolhead,
        toolheadX: motionState.toolheadX,
        toolheadY: motionState.toolheadY,
        toolheadZ: motionState.toolheadZ,
        updatedAt: motionState.updatedAt,
        v2: {
          ...prev.v2,
          eddy: {
            ...prev.v2.eddy,
            status: motionState.eddyStatus,
          },
        },
      }),
      true,
    )
  }, [applyTargetedRefresh, client.fetchMotionState])

  useEffect(() => {
    let isDisposed = false
    let runtimeTimer: number | null = null
    runtimeSourceRef.current = 'polling'
    lastWebsocketSnapshotAtRef.current = null
    const getRuntimeIntervalMs = (): number => {
      if (client.subscribe === undefined) {
        return pollIntervalMs
      }

      return runtimeSourceRef.current === 'websocket'
        ? WEBSOCKET_WATCHDOG_INTERVAL_MS
        : Math.min(pollIntervalMs, POLLING_INTERVAL_MS)
    }
    const scheduleRuntimeRefresh = (reset = false): void => {
      if (reset && runtimeTimer !== null) {
        window.clearTimeout(runtimeTimer)
        runtimeTimer = null
      }
      if (isDisposed || runtimeTimer !== null) {
        return
      }

      runtimeTimer = window.setTimeout(() => {
        runtimeTimer = null
        void refreshRuntime().finally(() => {
          scheduleRuntimeRefresh()
        })
      }, getRuntimeIntervalMs())
    }
    const setRuntimeSource = (nextSource: 'websocket' | 'polling'): void => {
      if (nextSource === runtimeSourceRef.current) {
        return
      }

      runtimeSourceRef.current = nextSource
      runtimeEpochRef.current += 1
      scheduleRuntimeRefresh(true)
    }
    const subscription = client.subscribe?.({
      onSnapshot(nextSnapshot) {
        if (isDisposed) {
          return
        }

        lastWebsocketSnapshotAtRef.current = Date.now()
        setRuntimeSource('websocket')
        runtimeEpochRef.current += 1
        recordSnapshotTransition(nextSnapshot)
        updatePrinterSnapshot((prev) => mergeRuntimeSnapshot(prev, nextSnapshot))
        setError('')
      },
      onConnectionChange(connection, message) {
        if (isDisposed) {
          return
        }

        if (connection !== 'online') {
          setRuntimeSource('polling')
        }
        recordOperationalDiagnostic('state-transition', `transport -> ${connection}`, message ?? null)
        updatePrinterSnapshot((prev) => ({
          ...prev,
          transport: {
            state: getTransportState(connection),
            message: message ?? null,
          },
          message: message ?? prev.message,
          updatedAt: new Date().toISOString(),
        }))
      },
      onError(message) {
        if (isDisposed) {
          return
        }

        setRuntimeSource('polling')
        recordOperationalDiagnostic('transport-error', message)
        setError(message)
      },
      onFileListChanged() {
        if (!isDisposed) {
          void refreshPrintFiles()
        }
      },
      onGcodeResponse(message) {
        if (!isDisposed) {
          recordOperationalDiagnostic('gcode-response', message)
          receivePrinterGcodeResponse(message)
        }
      },
    })

    if (client.subscribe !== undefined) {
      updatePrinterSnapshot((prev) => ({
        ...prev,
        transport: {
          state: getPrinterConnectionState(prev) === 'online' ? 'online' : 'connecting',
          message: null,
        },
        updatedAt: new Date().toISOString(),
      }))
    }

    const firstTick = window.setTimeout(() => {
      void refresh()
    }, 0)
    scheduleRuntimeRefresh()

    return () => {
      isDisposed = true
      subscription?.close()
      window.clearTimeout(firstTick)
      if (runtimeTimer !== null) {
        window.clearTimeout(runtimeTimer)
      }
    }
  }, [client, pollIntervalMs, recordSnapshotTransition, refresh, refreshPrintFiles, refreshRuntime])

  const deletePrintFile = useCallback(async (path: string): Promise<void> => {
    if (client.deletePrintFile === undefined) {
      throw new Error('Удаление файлов не поддерживается текущим runtime.')
    }

    await client.deletePrintFile(path)
    await refreshPrintFiles()
  }, [client, refreshPrintFiles])

  return {
    snapshot,
    error,
    refresh,
    refreshUsage,
    refreshRuntime,
    refreshFilamentSensor,
    refreshEddyState,
    refreshExcludeObjects,
    refreshPrintJob,
    refreshPrintFiles,
    refreshPrintFileMetadata,
    refreshMotionState,
    deletePrintFile,
  }
}
