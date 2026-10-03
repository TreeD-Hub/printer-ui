import { useSyncExternalStore } from 'react'
import { describePrinterEvent, parsePrinterEvent, type PrinterEvent, type PrinterNotification } from '@treed/printer-logic'
import { resolvePrinterDisplayStatus } from '../../dashboard/printerStatusState'
import { getPrinterConnectionState, type PrinterSnapshot } from '../transport/types'

export type NotificationEntry = PrinterNotification & { receivedAt: number }
type NotificationState = { history: NotificationEntry[]; popup: NotificationEntry | null }
let state: NotificationState = { history: [], popup: null }
let nextId = 0
let lastSequence = 0
let lastEventtime: number | null = null
let lastKlippyState: string | null = null
let lastStatusId: string | null = null
let statusPopupId: string | null = null
const listeners = new Set<() => void>()

function emit(): void { listeners.forEach((listener) => listener()) }

function publish(notification: PrinterNotification, showPopup = true): void {
  const entry = { ...notification, id: `${++nextId}:${notification.id}`, receivedAt: Date.now() }
  state = { history: [entry, ...state.history].slice(0, 50), popup: showPopup ? entry : state.popup }
  emit()
}

export function receivePrinterEvent(event: PrinterEvent | null, showPopup = true): void {
  if (event === null || event.sequence <= lastSequence) return
  lastSequence = event.sequence
  publish(describePrinterEvent(event), showPopup && event.code !== 'print_preparing')
}

export function receivePrinterGcodeResponse(message: string): void {
  receivePrinterEvent(parsePrinterEvent(message))
  // Не превращаем поток температур и отладочный RESPOND в уведомления.
  if (message.startsWith('!!')) {
    publish({ id: 'gcode-error', title: 'Ошибка команды принтера', details: message.slice(2).trim(), severity: 'error' })
  }
}

export function receivePrinterNotificationSnapshot(snapshot: PrinterSnapshot): void {
  const eventtime = snapshot.revisions.printerObjects.eventtime
  if ((eventtime !== null && lastEventtime !== null && eventtime < lastEventtime)
    || snapshot.macros.values._TREED_EVENT?.sequence === 0
    || (snapshot.klippy.state !== 'ready' && snapshot.transport.state === 'online' && lastKlippyState !== snapshot.klippy.state)) {
    lastSequence = 0
  }
  if (eventtime !== null) lastEventtime = eventtime
  lastKlippyState = snapshot.klippy.state

  const status = resolvePrinterDisplayStatus({ ...snapshot, connection: getPrinterConnectionState(snapshot) })
  const notification = status.notification
  const event = snapshot.printerEvent ?? null
  const matchesState = event !== null && (
    (snapshot.printJob.state === 'paused' && (event.code === 'paused' || event.code.startsWith('clog_')))
    || (snapshot.printJob.state === 'cancelled' && event.code === 'print_cancelled')
    || (snapshot.printJob.state === 'complete' && event.code === 'print_complete')
    || (snapshot.printJob.state === 'printing' && ['print_preparing', 'print_resumed'].includes(event.code))
  )
  if (notification?.id !== lastStatusId && state.popup?.id === statusPopupId) dismissPrinterNotification()
  // Старое событие восстанавливаем в историю, но оно не должно закрыть текущую ошибку.
  receivePrinterEvent(event, matchesState && status.severity !== 'error')
  if (notification && notification.id !== lastStatusId) {
    if (!matchesState || status.severity === 'error' || snapshot.transport.state !== 'online') {
      publish(notification)
      statusPopupId = state.popup?.id ?? null
    }
  }
  lastStatusId = notification?.id ?? null
}

export function dismissPrinterNotification(): void {
  state = { ...state, popup: null }
  emit()
}

export function getPrinterNotifications(): NotificationState { return state }
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function usePrinterNotifications(): NotificationState {
  return useSyncExternalStore(subscribe, getPrinterNotifications, getPrinterNotifications)
}
