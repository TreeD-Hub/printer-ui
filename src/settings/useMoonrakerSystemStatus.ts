import { useCallback, useEffect, useRef, useState } from 'react'
import { runtimeMode } from '#runtime'
import {
  createLoadingMoonrakerSystemStatus,
  fetchMoonrakerSystemStatus,
  type MoonrakerSystemStatus,
} from './systemStatus'

const DEFAULT_SYSTEM_STATUS_POLL_INTERVAL_MS = 10_000

type UseMoonrakerSystemStatusOptions = {
  pollIntervalMs?: number
}

export type MoonrakerSystemStatusController = {
  status: MoonrakerSystemStatus
  isRefreshing: boolean
  refresh: () => void
}

export function useMoonrakerSystemStatus(
  options: UseMoonrakerSystemStatusOptions = {},
): MoonrakerSystemStatusController {
  const [status, setStatus] = useState<MoonrakerSystemStatus>(createLoadingMoonrakerSystemStatus)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const requestSequenceRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_SYSTEM_STATUS_POLL_INTERVAL_MS

  const refresh = useCallback((): void => {
    if (runtimeMode === 'mock') {
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
          abortControllerRef.current = null
          setIsRefreshing(false)
        }
      })
  }, [])

  useEffect(() => {
    if (runtimeMode === 'mock') {
      return
    }

    refresh()
    const timer = window.setInterval(() => {
      if (abortControllerRef.current === null) {
        refresh()
      }
    }, pollIntervalMs)

    return () => {
      requestSequenceRef.current += 1
      abortControllerRef.current?.abort()
      window.clearInterval(timer)
    }
  }, [pollIntervalMs, refresh])

  return {
    status,
    isRefreshing,
    refresh,
  }
}
