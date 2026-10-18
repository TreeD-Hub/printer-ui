import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createAutoPrinterClient } from '#runtime'
import { getAutoPrinterStartBlockReason } from '@treed/printer-logic/autoprinter'
import type { AutoPrinterAction, AutoPrinterActionType, AutoPrinterPairing, AutoPrinterPendingType, AutoPrinterStatus } from '@treed/printer-logic/autoprinter'
import { AutoPrinterClientError } from '../autoprinter/client'

type Availability = 'loading' | 'available' | 'unsupported' | 'error'
export type AutoPrinterController = {
  status: AutoPrinterStatus | null
  availability: Availability
  stale: boolean
  error: string | null
  pending: { id: string; type: AutoPrinterPendingType } | null
  lastAction: { id: string; type: AutoPrinterActionType; state: 'executed' | 'rejected' | 'uncertain'; message: string } | null
  pairing: AutoPrinterPairing | null
  requestPairing: () => Promise<void>
  control: (type: AutoPrinterActionType) => Promise<void>
  refresh: () => Promise<void>
  manualStartBlockReason: string | null
}
const STALE_MS = 30_000
const POLL_MS = 5_000

export function useAutoPrinter(moonrakerConnected: boolean): AutoPrinterController {
  const client = useMemo(() => createAutoPrinterClient(), [])
  const [status, setStatus] = useState<AutoPrinterStatus | null>(null)
  const [availability, setAvailability] = useState<Availability>('loading')
  const [stale, setStale] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<AutoPrinterController['pending']>(null)
  const [lastAction, setLastAction] = useState<AutoPrinterController['lastAction']>(null)
  const [pairing, setPairing] = useState<AutoPrinterPairing | null>(null)
  const connectedRef = useRef(moonrakerConnected)
  const mountedRef = useRef(true)
  const pendingRef = useRef(false)
  const lastFreshAt = useRef(0)
  const sequence = useRef(0)
  const statusRead = useRef<{ id: number; controller: AbortController; promise: Promise<void> } | null>(null)
  connectedRef.current = moonrakerConnected

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      sequence.current++
      statusRead.current?.controller.abort()
      statusRead.current = null
    }
  }, [])

  const cancelStatusRead = useCallback(() => {
    sequence.current++
    statusRead.current?.controller.abort()
    statusRead.current = null
  }, [])

  const readStatus = useCallback((force = false): Promise<void> => {
    if (!connectedRef.current) { if (mountedRef.current) setStale(true); return Promise.resolve() }
    if (pendingRef.current && !force) return Promise.resolve()
    if (statusRead.current) return statusRead.current.promise
    const requestId = ++sequence.current
    const controller = new AbortController()
    const promise = (async () => {
      try {
        const value = await client.getStatus(controller.signal)
        if (!mountedRef.current || requestId !== sequence.current || controller.signal.aborted) return
        lastFreshAt.current = Date.now()
        setStatus(value); setAvailability('available'); setStale(false); setError(null)
      } catch (cause) {
        if (!mountedRef.current || requestId !== sequence.current || controller.signal.aborted) return
        if (cause instanceof AutoPrinterClientError && cause.kind === 'unsupported') {
          setAvailability('unsupported'); setStale(false); setError(null); lastFreshAt.current = Date.now()
        } else {
          setAvailability('error'); setStale(true)
          setError(cause instanceof AutoPrinterClientError ? cause.message : 'Не удалось получить состояние AutoPrinter.')
        }
      }
    })().finally(() => { if (statusRead.current?.id === requestId) statusRead.current = null })
    statusRead.current = { id: requestId, controller, promise }
    return promise
  }, [client])
  const refresh = useCallback(() => readStatus(), [readStatus])

  useEffect(() => {
    if (!moonrakerConnected) {
      cancelStatusRead()
      setStale(true); setPairing(null)
      return
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, POLL_MS)
    const staleTimer = window.setInterval(() => { if (Date.now() - lastFreshAt.current >= STALE_MS) setStale(true) }, 1_000)
    return () => { cancelStatusRead(); window.clearInterval(timer); window.clearInterval(staleTimer) }
  }, [cancelStatusRead, moonrakerConnected, refresh])

  useEffect(() => {
    if (!pairing) return
    const delay = Math.max(0, Date.parse(pairing.expires_at) - Date.now())
    const timer = window.setTimeout(() => setPairing(null), delay)
    return () => window.clearTimeout(timer)
  }, [pairing])

  const requestPairing = useCallback(async () => {
    if (!moonrakerConnected || pendingRef.current || stale || availability !== 'available') return
    pendingRef.current = true; setPending({ id: crypto.randomUUID(), type: 'pairing' })
    try {
      const response = await client.pair()
      if (connectedRef.current && mountedRef.current) { setPairing(response); setError(null) }
    }
    catch (cause) { if (mountedRef.current) setError(cause instanceof AutoPrinterClientError ? cause.message : 'Не удалось запросить код привязки.') }
    finally { pendingRef.current = false; if (mountedRef.current) setPending(null) }
  }, [availability, client, moonrakerConnected, stale])

  const control = useCallback(async (type: AutoPrinterActionType) => {
    if (!moonrakerConnected || pendingRef.current || stale || availability !== 'available' || !status) return
    let action: AutoPrinterAction
    const id = crypto.randomUUID()
    if (type === 'pause_current_print' || type === 'cancel_current_print') {
      if (!status.current_run_id) return
      action = { type, run_id: status.current_run_id, action_id: id }
    } else action = { type }
    cancelStatusRead()
    pendingRef.current = true; setPending({ id, type })
    try {
      const receipt = await client.control(action)
      if (!mountedRef.current) return
      const confirmed = receipt.type === type && (type !== 'pause_current_print' && type !== 'cancel_current_print' || receipt.command_id === id)
      const state = confirmed ? receipt.state : 'uncertain'
      setLastAction({ id, type, state, message: state === 'executed' ? 'Действие выполнено' : state === 'rejected' ? 'Действие отклонено' : 'Результат действия неизвестен; повторите проверку состояния вручную.' })
      await readStatus(true)
      if (state === 'uncertain' && mountedRef.current) setError('Core не подтвердил действие. Автоматического повтора не будет.')
    } catch (cause) {
      if (mountedRef.current) {
        setLastAction({ id, type, state: 'uncertain', message: 'Результат действия неизвестен; автоматического повтора не будет.' })
        await readStatus(true)
        if (mountedRef.current) setError(cause instanceof AutoPrinterClientError ? cause.message : 'Не удалось подтвердить действие AutoPrinter.')
      }
    } finally { pendingRef.current = false; if (mountedRef.current) setPending(null) }
  }, [availability, cancelStatusRead, client, moonrakerConnected, readStatus, status, stale])

  const manualStartBlockReason = getAutoPrinterStartBlockReason({ status, availability, stale, connected: moonrakerConnected })
  return { status, availability, stale, error, pending, lastAction, pairing, requestPairing, control, refresh: () => refresh(), manualStartBlockReason }
}
