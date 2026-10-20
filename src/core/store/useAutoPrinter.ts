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
  cancelPairing: () => Promise<void>
  requestUnlink: () => Promise<void>
  control: (type: Exclude<AutoPrinterActionType, 'cancel_package'>) => Promise<void>
  cancelRemaining: () => Promise<void>
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
  const unlinkIntentEpoch = useRef<number | null>(null)
  const statusRead = useRef<{ id: number; controller: AbortController; promise: Promise<void> } | null>(null)
  connectedRef.current = moonrakerConnected

  const cancelStatusRead = useCallback(() => {
    sequence.current++
    statusRead.current?.controller.abort()
    statusRead.current = null
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancelStatusRead()
    }
  }, [cancelStatusRead])

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
        const intentEpoch = unlinkIntentEpoch.current
        if (intentEpoch !== null && (!Number.isSafeInteger(value.binding_epoch) || value.binding_epoch < intentEpoch)) {
          setAvailability('error'); setStale(true); setError('Core вернул устаревшее состояние привязки.')
          return
        }
        if (intentEpoch !== null && value.binding_epoch > intentEpoch) unlinkIntentEpoch.current = null
        lastFreshAt.current = Date.now()
        const current = unlinkIntentEpoch.current === value.binding_epoch
          ? { ...value, unlink_pending: true }
          : value
        setStatus(current); setAvailability('available'); setStale(false); setError(null)
        if (current.binding_state !== 'unpaired' || current.unlink_pending === true) setPairing(null)
        else if (current.pairing !== undefined) setPairing(current.pairing)
      } catch (cause) {
        if (!mountedRef.current || requestId !== sequence.current || controller.signal.aborted) return
        if (cause instanceof AutoPrinterClientError && cause.kind === 'unsupported') {
          setAvailability('unsupported'); setStale(false); setError(null); lastFreshAt.current = Date.now()
        } else {
          setAvailability('error'); setStale(true)
          setError(cause instanceof AutoPrinterClientError ? cause.message : 'Не удалось получить данные принтера.')
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
    if (!pairing || pairing.expires_at === null) return
    const delay = Math.max(0, Date.parse(pairing.expires_at) - Date.now())
    const timer = window.setTimeout(() => setPairing(null), delay)
    return () => window.clearTimeout(timer)
  }, [pairing])

  const requestPairing = useCallback(async () => {
    if (!moonrakerConnected || pendingRef.current || pairing || stale || availability !== 'available'
      || !status || status.capabilities?.account_linking !== true || status.binding_state !== 'unpaired'
      || status.capabilities.pairing === false || status.connection === 'offline' || status.connection === 'disconnected') return
    pendingRef.current = true; setPending({ id: crypto.randomUUID(), type: 'pairing' })
    cancelStatusRead()
    setPairing(null)
    try {
      const response = await client.pair()
      if (connectedRef.current && mountedRef.current) { setPairing(response); setError(null) }
    }
    catch (cause) { if (mountedRef.current) setError(cause instanceof AutoPrinterClientError ? cause.message : 'Не удалось запросить код привязки.') }
    finally { pendingRef.current = false; if (mountedRef.current) setPending(null) }
  }, [availability, cancelStatusRead, client, moonrakerConnected, pairing, stale, status])

  const cancelPairing = useCallback(async () => {
    if (!moonrakerConnected || pendingRef.current || stale || availability !== 'available'
      || status?.binding_state !== 'unpaired' || status.capabilities?.pairing_cancel !== true) return
    pendingRef.current = true; setPending({ id: crypto.randomUUID(), type: 'pairing_cancel' })
    cancelStatusRead()
    try {
      await client.cancelPairing()
      if (mountedRef.current) { setPairing(null); setError(null) }
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof AutoPrinterClientError ? cause.message : 'Не удалось отменить привязку. Код остаётся действующим.')
    } finally { pendingRef.current = false; if (mountedRef.current) setPending(null) }
  }, [availability, cancelStatusRead, client, moonrakerConnected, stale, status])

  const requestUnlink = useCallback(async () => {
    if (!moonrakerConnected || pendingRef.current || stale || availability !== 'available' || !status
      || status.capabilities?.account_linking !== true || status.unlink_pending === true
      || (status.binding_state !== 'paired' && status.binding_state !== 'revoked')) return
    cancelStatusRead()
    pendingRef.current = true; setPending({ id: crypto.randomUUID(), type: 'account_unlink' })
    try {
      const result = await client.unlinkAccount()
      if (!mountedRef.current) return
      const invalidEpoch = result.binding_state === 'unpaired'
        ? result.binding_epoch <= status.binding_epoch
        : result.binding_epoch !== status.binding_epoch
      if (invalidEpoch) {
        throw new AutoPrinterClientError('invalid-result', 'Принтер вернул состояние другой привязки.')
      }
      unlinkIntentEpoch.current = result.binding_state === 'unpaired' ? null : result.binding_epoch
      setStatus(result)
      setPairing(null); setError(null)
      if (connectedRef.current && result.binding_state !== 'unpaired') await readStatus(true)
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof AutoPrinterClientError ? cause.message : 'Не удалось сохранить запрос на отвязку.')
    } finally { pendingRef.current = false; if (mountedRef.current) setPending(null) }
  }, [availability, cancelStatusRead, client, moonrakerConnected, readStatus, stale, status])

  const control = useCallback(async (type: Exclude<AutoPrinterActionType, 'cancel_package'>) => {
    const isLocalPrintAction = type === 'pause_current_print' || type === 'cancel_current_print'
    const isLocalSeriesResume = type === 'resume_queue' && status?.capabilities?.offline_packages_v1 === true
      && (status.hold !== null || status.recovery_required)
    if (!moonrakerConnected || pendingRef.current || stale || availability !== 'available' || !status
      || (status.unlink_pending === true && !isLocalPrintAction && !isLocalSeriesResume)) return
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
        if (mountedRef.current) setError(cause instanceof AutoPrinterClientError ? cause.message : 'Не удалось подтвердить действие принтера.')
      }
    } finally { pendingRef.current = false; if (mountedRef.current) setPending(null) }
  }, [availability, cancelStatusRead, client, moonrakerConnected, readStatus, status, stale])

  const cancelRemaining = useCallback(async () => {
    const activePackage = status?.active_package
    if (!moonrakerConnected || pendingRef.current || stale || availability !== 'available' || !status
      || status.capabilities?.offline_packages_v1 !== true || !activePackage || activePackage.remaining_count < 1) return
    const action = { type: 'cancel_package' as const, package_id: activePackage.package_id, action_id: crypto.randomUUID() }
    cancelStatusRead()
    pendingRef.current = true; setPending({ id: action.action_id, type: action.type })
    try {
      const receipt = await client.control(action)
      if (!mountedRef.current) return
      const confirmed = receipt.type === action.type
      const state = confirmed ? receipt.state : 'uncertain'
      setLastAction({ id: action.action_id, type: action.type, state,
        message: state === 'executed' ? 'Оставшиеся задания отменены' : state === 'rejected' ? 'Отмена оставшихся заданий отклонена' : 'Результат отмены неизвестен; проверьте состояние очереди вручную.' })
      await readStatus(true)
      if (state === 'uncertain' && mountedRef.current) setError('Core не подтвердил отмену оставшихся заданий. Автоматического повтора не будет.')
    } catch (cause) {
      if (mountedRef.current) {
        setLastAction({ id: action.action_id, type: action.type, state: 'uncertain', message: 'Результат отмены неизвестен; автоматического повтора не будет.' })
        await readStatus(true)
        if (mountedRef.current) setError(cause instanceof AutoPrinterClientError ? cause.message : 'Не удалось подтвердить отмену оставшихся заданий.')
      }
    } finally { pendingRef.current = false; if (mountedRef.current) setPending(null) }
  }, [availability, cancelStatusRead, client, moonrakerConnected, readStatus, status, stale])

  const manualStartBlockReason = getAutoPrinterStartBlockReason({ status, availability, stale, connected: moonrakerConnected })
  return { status, availability, stale, error, pending, lastAction, pairing, requestPairing, cancelPairing, requestUnlink, control, cancelRemaining, refresh: () => refresh(), manualStartBlockReason }
}
