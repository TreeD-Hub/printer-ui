import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createTransportClient } from '#runtime'
import { recordOperationalDiagnostic } from '../../diagnostics'
import type {
  FilamentSensorSnapshot,
  PrinterEddyStateSnapshot,
  PrinterExcludeObjectSnapshot,
  PrinterMotionStateSnapshot,
  PrinterPrintFilesMetadataSnapshot,
  PrinterPrintFilesStateSnapshot,
  PrinterPrintJobStateSnapshot,
  PrinterSnapshot,
  PrinterUsageSnapshot,
} from '../transport/types'
import {
  setPrinterSnapshot,
  updatePrinterSnapshot,
  usePrinterStoreSelector,
} from './printerStore'

const DEGRADED_HTTP_FALLBACK_INTERVAL_MS = 2_000
const HEALTHY_WEBSOCKET_HTTP_FALLBACK_INTERVAL_MS = 15_000

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

function isRuntimeSnapshotCurrent(previous: PrinterSnapshot, next: PrinterSnapshot): boolean {
  const previousEventtime = previous.revisions.printerObjects.eventtime
  const nextEventtime = next.revisions.printerObjects.eventtime

  if (nextEventtime !== null && previousEventtime !== null) {
    return nextEventtime >= previousEventtime
  }

  if (nextEventtime !== null) {
    return true
  }

  if (previousEventtime !== null) {
    return false
  }

  return next.revisions.printerObjects.receivedAt >= previous.revisions.printerObjects.receivedAt
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

function getFailureConnection(previous: PrinterSnapshot): PrinterSnapshot['connection'] {
  if (previous.connection === 'shutdown') {
    return 'shutdown'
  }

  return previous.connection === 'offline' ? 'offline' : 'reconnecting'
}

function getTransportState(connection: PrinterSnapshot['connection']): PrinterSnapshot['transport']['state'] {
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
  const snapshotRevisionRef = useRef(0)
  const runtimeStateRevisionRef = useRef(0)
  const refreshSequenceRef = useRef(0)
  const runtimeRefreshSequenceRef = useRef(0)
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
    const snapshotRevision = snapshotRevisionRef.current

    try {
      const nextSnapshot = await client.fetchSnapshot()
      if (refreshSequence !== refreshSequenceRef.current) {
        return
      }

      if (snapshotRevision !== snapshotRevisionRef.current) {
        let didApplyRuntimeSnapshot = false
        let didUpdateSnapshot = false

        updatePrinterSnapshot((prev) => {
          const mergedSnapshot = isRuntimeSnapshotCurrent(prev, nextSnapshot)
            ? nextSnapshot
            : hasHttpSupplementalData(nextSnapshot)
              ? mergeHttpSupplementalSnapshot(prev, nextSnapshot)
              : prev

          didApplyRuntimeSnapshot = Object.is(mergedSnapshot, nextSnapshot)
          didUpdateSnapshot = !Object.is(mergedSnapshot, prev)
          return mergedSnapshot
        })

        if (didUpdateSnapshot) {
          snapshotRevisionRef.current += 1
          setError('')
        }
        if (didApplyRuntimeSnapshot) {
          runtimeStateRevisionRef.current += 1
          recordSnapshotTransition(nextSnapshot)
        }
        return
      }

      recordSnapshotTransition(nextSnapshot)
      snapshotRevisionRef.current += 1
      runtimeStateRevisionRef.current += 1
      setPrinterSnapshot(nextSnapshot)
      setError('')
    } catch (err) {
      if (refreshSequence !== refreshSequenceRef.current || snapshotRevision !== snapshotRevisionRef.current) {
        return
      }

      const message = getErrorMessage(err)
      recordOperationalDiagnostic('transport-error', message)
      snapshotRevisionRef.current += 1
      updatePrinterSnapshot((prev) => ({
        ...prev,
        connection: getFailureConnection(prev),
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
    const refreshSequence = ++runtimeRefreshSequenceRef.current
    const snapshotRevision = snapshotRevisionRef.current

    try {
      const nextSnapshot = await client.fetchRuntimeSnapshot()
      if (refreshSequence !== runtimeRefreshSequenceRef.current) {
        return
      }

      let didUpdateSnapshot = false

      updatePrinterSnapshot((prev) => {
        if (!isRuntimeSnapshotCurrent(prev, nextSnapshot)) {
          return prev
        }

        const mergedSnapshot = mergeRuntimeSnapshot(prev, nextSnapshot)
        didUpdateSnapshot = !Object.is(mergedSnapshot, prev)
        return mergedSnapshot
      })

      if (didUpdateSnapshot) {
        recordSnapshotTransition(nextSnapshot)
        snapshotRevisionRef.current += 1
        runtimeStateRevisionRef.current += 1
        setError('')
      }
    } catch (err) {
      if (refreshSequence !== runtimeRefreshSequenceRef.current || snapshotRevision !== snapshotRevisionRef.current) {
        return
      }

      const message = getErrorMessage(err)
      recordOperationalDiagnostic('transport-error', message)
      snapshotRevisionRef.current += 1
      updatePrinterSnapshot((prev) => ({
        ...prev,
        connection: getFailureConnection(prev),
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
    const requestSequence = (targetedRefreshSequenceRef.current.get(action) ?? 0) + 1
    targetedRefreshSequenceRef.current.set(action, requestSequence)
    const runtimeStateRevision = runtimeStateRevisionRef.current
    const isRequestCurrent = (): boolean => {
      return targetedRefreshSequenceRef.current.get(action) === requestSequence
        && (!guardRuntimeRevision || runtimeStateRevisionRef.current === runtimeStateRevision)
    }

    try {
      const value = await fetchValue()
      if (!isRequestCurrent()) {
        return
      }

      updatePrinterSnapshot((prev) => mergeValue(prev, value))
      snapshotRevisionRef.current += 1
      if (guardRuntimeRevision) {
        runtimeStateRevisionRef.current += 1
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
        state: printJobState.state,
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

    snapshotRevisionRef.current += 1
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
        message: motionState.message,
        state: motionState.state,
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
    let isSocketHealthy = false
    let runtimeTimer: number | null = null
    const getFallbackIntervalMs = (): number => {
      if (client.subscribe === undefined) {
        return pollIntervalMs
      }

      return isSocketHealthy
        ? HEALTHY_WEBSOCKET_HTTP_FALLBACK_INTERVAL_MS
        : Math.min(pollIntervalMs, DEGRADED_HTTP_FALLBACK_INTERVAL_MS)
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
      }, getFallbackIntervalMs())
    }
    const setSocketHealthy = (nextHealthy: boolean): void => {
      if (nextHealthy === isSocketHealthy) {
        return
      }

      isSocketHealthy = nextHealthy
      scheduleRuntimeRefresh(true)
    }
    const subscription = client.subscribe?.({
      onSnapshot(nextSnapshot) {
        if (isDisposed) {
          return
        }

        setSocketHealthy(true)
        snapshotRevisionRef.current += 1
        runtimeStateRevisionRef.current += 1
        recordSnapshotTransition(nextSnapshot)
        updatePrinterSnapshot((prev) => mergeRuntimeSnapshot(prev, nextSnapshot))
        setError('')
      },
      onConnectionChange(connection, message) {
        if (isDisposed) {
          return
        }

        setSocketHealthy(connection === 'online')
        snapshotRevisionRef.current += 1
        recordOperationalDiagnostic('state-transition', `transport -> ${connection}`, message ?? null)
        updatePrinterSnapshot((prev) => ({
          ...prev,
          connection,
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

        setSocketHealthy(false)
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
        }
      },
    })

    if (client.subscribe !== undefined) {
      updatePrinterSnapshot((prev) => ({
        ...prev,
        connection: prev.connection === 'online' ? prev.connection : 'connecting',
        transport: {
          state: prev.transport.state === 'online' ? 'online' : 'connecting',
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
