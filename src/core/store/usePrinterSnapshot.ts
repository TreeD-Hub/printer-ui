import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createTransportClient } from '#runtime'
import { recordOperationalDiagnostic } from '../../diagnostics'
import type {
  FilamentSensorSnapshot,
  PrinterEddyStateSnapshot,
  PrinterExcludeObjectSnapshot,
  PrinterMotionStateSnapshot,
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

const LIVE_HTTP_FALLBACK_INTERVAL_MS = 30_000

const selectPrinterSnapshot = (snapshot: PrinterSnapshot) => snapshot

function mergeWebSocketSnapshot(previous: PrinterSnapshot, next: PrinterSnapshot): PrinterSnapshot {
  return {
    ...next,
    usage: next.usage.state === 'ready' ? next.usage : previous.usage,
    printFiles: next.printFiles.length > 0 ? next.printFiles : previous.printFiles,
    fileList: next.fileList?.state === 'unknown' ? previous.fileList : next.fileList ?? previous.fileList,
  }
}

function hasHttpSupplementalData(next: PrinterSnapshot): boolean {
  return next.usage.state === 'ready'
    || (next.fileList !== undefined && next.fileList.state !== 'unknown')
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

export function usePrinterSnapshot(pollIntervalMs = 2_000) {
  const snapshot = usePrinterStoreSelector(selectPrinterSnapshot)
  const [error, setError] = useState<string>('')
  const lastTransitionRef = useRef<string>('')
  const snapshotRevisionRef = useRef(0)
  const refreshSequenceRef = useRef(0)

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
        if (hasHttpSupplementalData(nextSnapshot)) {
          snapshotRevisionRef.current += 1
          updatePrinterSnapshot((prev) => mergeHttpSupplementalSnapshot(prev, nextSnapshot))
        }
        return
      }

      recordSnapshotTransition(nextSnapshot)
      snapshotRevisionRef.current += 1
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

  const applyTargetedRefresh = useCallback(async <T,>(
    action: string,
    fetchValue: () => Promise<T>,
    mergeValue: (previous: PrinterSnapshot, value: T) => PrinterSnapshot,
  ): Promise<void> => {
    try {
      const value = await fetchValue()
      snapshotRevisionRef.current += 1
      updatePrinterSnapshot((prev) => mergeValue(prev, value))
      setError('')
    } catch (err) {
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
    )
  }, [applyTargetedRefresh, client.fetchMotionState])

  useEffect(() => {
    let isDisposed = false
    const fallbackIntervalMs = client.subscribe === undefined
      ? pollIntervalMs
      : Math.max(pollIntervalMs, LIVE_HTTP_FALLBACK_INTERVAL_MS)
    const subscription = client.subscribe?.({
      onSnapshot(nextSnapshot) {
        if (isDisposed) {
          return
        }

        snapshotRevisionRef.current += 1
        recordSnapshotTransition(nextSnapshot)
        updatePrinterSnapshot((prev) => mergeWebSocketSnapshot(prev, nextSnapshot))
        setError('')
      },
      onConnectionChange(connection, message) {
        if (isDisposed) {
          return
        }

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

    const timer = window.setInterval(() => {
      void refresh()
    }, fallbackIntervalMs)

    return () => {
      isDisposed = true
      subscription?.close()
      window.clearTimeout(firstTick)
      window.clearInterval(timer)
    }
  }, [client, pollIntervalMs, recordSnapshotTransition, refresh, refreshPrintFiles])

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
    refreshMotionState,
    deletePrintFile,
  }
}
