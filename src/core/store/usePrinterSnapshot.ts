import { useCallback, useEffect, useMemo, useState } from 'react'
import { dataMode } from '../../config'
import { createMockClient } from '../transport/mockClient'
import { createMoonrakerClient } from '../transport/moonrakerClient'
import type { PrinterSnapshot } from '../transport/types'

const FALLBACK_SNAPSHOT: PrinterSnapshot = {
  source: dataMode,
  connection: 'offline',
  wifiSsid: 'Не подключено',
  ipAddress: '—',
  state: 'unknown',
  extruderTemp: 0,
  bedTemp: 0,
  modelFanPercent: 0,
  updatedAt: new Date(0).toISOString(),
  message: 'Ожидание данных...',
}

export function usePrinterSnapshot(pollIntervalMs = 2_000) {
  const [snapshot, setSnapshot] = useState<PrinterSnapshot>(FALLBACK_SNAPSHOT)
  const [error, setError] = useState<string>('')

  const client = useMemo(() => {
    return dataMode === 'live' ? createMoonrakerClient() : createMockClient()
  }, [])

  const refresh = useCallback(async () => {
    try {
      const nextSnapshot = await client.fetchSnapshot()
      setSnapshot(nextSnapshot)
      setError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setSnapshot((prev) => ({
        ...prev,
        connection: 'offline',
        updatedAt: new Date().toISOString(),
      }))
      setError(message)
    }
  }, [client])

  useEffect(() => {
    const firstTick = window.setTimeout(() => {
      void refresh()
    }, 0)

    const timer = window.setInterval(() => {
      void refresh()
    }, pollIntervalMs)

    return () => {
      window.clearTimeout(firstTick)
      window.clearInterval(timer)
    }
  }, [pollIntervalMs, refresh])

  return {
    snapshot,
    error,
    refresh,
  }
}
