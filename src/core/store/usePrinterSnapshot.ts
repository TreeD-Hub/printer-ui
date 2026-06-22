import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createTransportClient } from '#runtime'
import { recordOperationalDiagnostic } from '../../diagnostics'
import type { PrinterSnapshot } from '../transport/types'
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
    printFiles: next.printFiles.length > 0 ? next.printFiles : previous.printFiles,
    fileList: next.fileList?.state === 'unknown' ? previous.fileList : next.fileList ?? previous.fileList,
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

export function usePrinterSnapshot(pollIntervalMs = 2_000) {
  const snapshot = usePrinterStoreSelector(selectPrinterSnapshot)
  const [error, setError] = useState<string>('')
  const lastTransitionRef = useRef<string>('')

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
    try {
      const nextSnapshot = await client.fetchSnapshot()
      recordSnapshotTransition(nextSnapshot)
      setPrinterSnapshot(nextSnapshot)
      setError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      recordOperationalDiagnostic('transport-error', message)
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

        recordSnapshotTransition(nextSnapshot)
        updatePrinterSnapshot((prev) => mergeWebSocketSnapshot(prev, nextSnapshot))
        setError('')
      },
      onConnectionChange(connection, message) {
        if (isDisposed) {
          return
        }

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
          void refresh()
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
  }, [client, pollIntervalMs, recordSnapshotTransition, refresh])

  const deletePrintFile = useCallback(async (path: string): Promise<void> => {
    if (client.deletePrintFile === undefined) {
      throw new Error('Удаление файлов не поддерживается текущим runtime.')
    }

    await client.deletePrintFile(path)
    await refresh()
  }, [client, refresh])

  return {
    snapshot,
    error,
    refresh,
    deletePrintFile,
  }
}
