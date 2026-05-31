import { useCallback, useEffect, useMemo, useState } from 'react'
import { dataMode } from '../../config'
import { createMockClient } from '../transport/mockClient'
import { createMoonrakerClient } from '../transport/moonrakerClient'
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
  }
}

function getFailureConnection(previous: PrinterSnapshot): PrinterSnapshot['connection'] {
  if (previous.connection === 'shutdown') {
    return 'shutdown'
  }

  return previous.connection === 'offline' ? 'offline' : 'reconnecting'
}

export function usePrinterSnapshot(pollIntervalMs = 2_000) {
  const snapshot = usePrinterStoreSelector(selectPrinterSnapshot)
  const [error, setError] = useState<string>('')

  const client = useMemo(() => {
    return dataMode === 'live' ? createMoonrakerClient() : createMockClient()
  }, [])

  const refresh = useCallback(async () => {
    try {
      const nextSnapshot = await client.fetchSnapshot()
      setPrinterSnapshot(nextSnapshot)
      setError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      updatePrinterSnapshot((prev) => ({
        ...prev,
        connection: getFailureConnection(prev),
        message: `Ошибка связи: ${message}`,
        updatedAt: new Date().toISOString(),
      }))
      setError(message)
    }
  }, [client])

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

        updatePrinterSnapshot((prev) => mergeWebSocketSnapshot(prev, nextSnapshot))
        setError('')
      },
      onConnectionChange(connection, message) {
        if (isDisposed) {
          return
        }

        updatePrinterSnapshot((prev) => ({
          ...prev,
          connection,
          message: message ?? prev.message,
          updatedAt: new Date().toISOString(),
        }))
      },
      onError(message) {
        if (isDisposed) {
          return
        }

        setError(message)
      },
    })

    if (client.subscribe !== undefined) {
      updatePrinterSnapshot((prev) => ({
        ...prev,
        connection: prev.connection === 'online' ? prev.connection : 'connecting',
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
  }, [client, pollIntervalMs, refresh])

  return {
    snapshot,
    error,
    refresh,
  }
}
