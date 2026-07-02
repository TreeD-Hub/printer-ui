import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createLoadingMoonrakerSystemStatus,
  fetchMoonrakerSystemStatus,
  type MoonrakerSystemStatus,
} from './systemStatus'

const SYSTEM_STATUS_POLL_INTERVAL_MS = 10_000

export type MoonrakerSystemStatusController = {
  status: MoonrakerSystemStatus
  isRefreshing: boolean
  refresh: () => void
}

export function useMoonrakerSystemStatus(enabled = true): MoonrakerSystemStatusController {
  const [status, setStatus] = useState<MoonrakerSystemStatus>(createLoadingMoonrakerSystemStatus)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const requestSequenceRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const refresh = useCallback((): void => {
    if (!enabled) {
      return
    }

    requestSequenceRef.current += 1
    const requestSequence = requestSequenceRef.current
    abortControllerRef.current?.abort()

    const abortController = new AbortController()
    abortControllerRef.current = abortController
    setIsRefreshing(true)

    void fetchMoonrakerSystemStatus({ signal: abortController.signal })
      .then((nextStatus) => {
        if (requestSequence === requestSequenceRef.current && !abortController.signal.aborted) {
          setStatus(nextStatus)
        }
      })
      .catch((error: unknown) => {
        if (requestSequence !== requestSequenceRef.current || abortController.signal.aborted) {
          return
        }

        const message = error instanceof Error ? error.message : String(error)
        setStatus((currentStatus) => ({
          ...currentStatus,
          loadState: currentStatus.updatedAt === null ? 'unavailable' : 'partial',
          health: 'error',
          errors: [message],
        }))
      })
      .finally(() => {
        if (requestSequence === requestSequenceRef.current) {
          setIsRefreshing(false)
        }
      })
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      requestSequenceRef.current += 1
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      return
    }

    refresh()
    const timer = window.setInterval(refresh, SYSTEM_STATUS_POLL_INTERVAL_MS)

    return () => {
      requestSequenceRef.current += 1
      abortControllerRef.current?.abort()
      window.clearInterval(timer)
    }
  }, [enabled, refresh])

  return {
    status,
    isRefreshing,
    refresh,
  }
}
