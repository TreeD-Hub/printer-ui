import { moonrakerUrl } from '../../config'
import {
  normalizeMoonrakerRuntimeSnapshot,
  type MoonrakerObjectsQueryPayload,
  type MoonrakerPrinterObjectsStatus,
} from './moonrakerNormalizer'
import { MOONRAKER_RUNTIME_OBJECTS } from './moonrakerRuntimeObjects'
import type { PrinterSnapshot, TransportSubscriptionHandlers } from './types'

type MoonrakerJsonRpcMessage = {
  id?: number
  method?: string
  params?: unknown[]
  result?: MoonrakerObjectsQueryPayload
  error?: {
    message?: string
  }
}

type MoonrakerWebSocketHandlers = TransportSubscriptionHandlers

type MoonrakerWebSocketClientOptions = {
  moonrakerUrl?: string
  reconnectDelayMs?: number
  reconnectMaxDelayMs?: number
  reconnectJitterRatio?: number
  WebSocketCtor?: typeof WebSocket
}

export type MoonrakerWebSocketSubscription = {
  close: () => void
}

const SUBSCRIPTION_REQUEST_ID = 1
const DEFAULT_RECONNECT_DELAY_MS = 2_000
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000
const DEFAULT_RECONNECT_JITTER_RATIO = 0.2

export const MOONRAKER_SUBSCRIPTION_OBJECTS = Object.fromEntries(
  MOONRAKER_RUNTIME_OBJECTS.map((objectName) => [objectName, null]),
) as Record<(typeof MOONRAKER_RUNTIME_OBJECTS)[number], null>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergePrinterStatus(
  currentStatus: MoonrakerPrinterObjectsStatus,
  nextStatus: MoonrakerPrinterObjectsStatus,
): MoonrakerPrinterObjectsStatus {
  const mergedStatus: MoonrakerPrinterObjectsStatus = {
    ...currentStatus,
  }

  for (const [objectName, objectValue] of Object.entries(nextStatus)) {
    const currentValue = mergedStatus[objectName]
    if (isRecord(currentValue) && isRecord(objectValue)) {
      mergedStatus[objectName] = {
        ...currentValue,
        ...objectValue,
      }
    } else {
      mergedStatus[objectName] = objectValue
    }
  }

  return mergedStatus
}

function parseMoonrakerMessage(rawMessage: unknown): MoonrakerJsonRpcMessage | null {
  if (typeof rawMessage !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(rawMessage) as unknown
    return isRecord(parsed) ? parsed as MoonrakerJsonRpcMessage : null
  } catch {
    return null
  }
}

function normalizeCachedStatus(
  status: MoonrakerPrinterObjectsStatus,
  runtimeUrl: string,
  eventtime?: number,
): PrinterSnapshot {
  return normalizeMoonrakerRuntimeSnapshot(
    {
      eventtime,
      status,
    },
    {
      source: 'live',
      revisionSource: 'websocket',
      transportState: 'online',
      moonrakerUrl: runtimeUrl,
    },
  )
}

function setWebhooksState(
  currentStatus: MoonrakerPrinterObjectsStatus,
  state: string,
  stateMessage: string,
): MoonrakerPrinterObjectsStatus {
  return mergePrinterStatus(currentStatus, {
    webhooks: {
      state,
      state_message: stateMessage,
    },
  })
}

export function createMoonrakerWebSocketUrl(runtimeUrl = moonrakerUrl): string {
  const url = new URL(runtimeUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/websocket'
  url.search = ''
  url.hash = ''

  return url.toString()
}

export function subscribeToMoonrakerStatus(
  handlers: MoonrakerWebSocketHandlers,
  options: MoonrakerWebSocketClientOptions = {},
): MoonrakerWebSocketSubscription {
  const runtimeUrl = options.moonrakerUrl ?? moonrakerUrl
  const WebSocketConstructor = options.WebSocketCtor ?? WebSocket
  const reconnectBaseDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS
  const reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS
  const reconnectJitterRatio = Math.max(0, options.reconnectJitterRatio ?? DEFAULT_RECONNECT_JITTER_RATIO)
  let socket: WebSocket | null = null
  let reconnectTimer: number | null = null
  let closedByClient = false
  let cachedStatus: MoonrakerPrinterObjectsStatus = {}
  let cachedEventtime: number | undefined
  let reconnectAttempt = 0

  function clearReconnectTimer(): void {
    if (reconnectTimer === null) {
      return
    }

    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  function emitStatusSnapshot(nextStatus: MoonrakerPrinterObjectsStatus, eventtime?: number): void {
    cachedStatus = mergePrinterStatus(cachedStatus, nextStatus)
    cachedEventtime = eventtime ?? cachedEventtime
    const snapshot = normalizeCachedStatus(cachedStatus, runtimeUrl, cachedEventtime)
    handlers.onSnapshot(snapshot)
  }

  function scheduleReconnect(message: string): void {
    if (closedByClient || reconnectTimer !== null) {
      return
    }

    const cappedDelayMs = Math.min(
      reconnectMaxDelayMs,
      reconnectBaseDelayMs * (2 ** reconnectAttempt),
    )
    const jitterMs = cappedDelayMs * reconnectJitterRatio * Math.random()
    const nextDelayMs = Math.round(cappedDelayMs + jitterMs)
    reconnectAttempt += 1
    handlers.onConnectionChange('reconnecting', message)
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, nextDelayMs)
  }

  function sendSubscriptionRequest(nextSocket: WebSocket): void {
    nextSocket.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'printer.objects.subscribe',
      params: {
        objects: MOONRAKER_SUBSCRIPTION_OBJECTS,
      },
      id: SUBSCRIPTION_REQUEST_ID,
    }))
  }

  function handleStatusNotification(params: unknown[] | undefined): void {
    const nextStatus = params?.[0]
    if (!isRecord(nextStatus)) {
      return
    }

    const eventtime = typeof params?.[1] === 'number' ? params[1] : undefined
    emitStatusSnapshot(nextStatus as MoonrakerPrinterObjectsStatus, eventtime)
  }

  function handleRpcMessage(message: MoonrakerJsonRpcMessage): void {
    if (message.error?.message) {
      handlers.onError?.(message.error.message)
      handlers.onConnectionChange('degraded', message.error.message)
      return
    }

    if (message.id === SUBSCRIPTION_REQUEST_ID && message.result?.status) {
      emitStatusSnapshot(message.result.status, message.result.eventtime)
      return
    }

    switch (message.method) {
      case 'notify_status_update':
        handleStatusNotification(message.params)
        return
      case 'notify_klippy_ready':
        emitStatusSnapshot(setWebhooksState(cachedStatus, 'ready', 'Klippy ready'))
        return
      case 'notify_klippy_shutdown':
        emitStatusSnapshot(setWebhooksState(cachedStatus, 'shutdown', 'Klippy shutdown'))
        return
      case 'notify_klippy_disconnected':
        emitStatusSnapshot(setWebhooksState(cachedStatus, 'disconnected', 'Klippy disconnected'))
        return
      case 'notify_filelist_changed':
      case 'notify_metadata_update':
        handlers.onFileListChanged?.()
        return
      case 'notify_gcode_response': {
        const response = message.params?.[0]
        if (typeof response === 'string') {
          handlers.onGcodeResponse?.(response)
        }
        return
      }
      default:
        return
    }
  }

  function connect(): void {
    if (closedByClient) {
      return
    }

    handlers.onConnectionChange('connecting')

    try {
      socket = new WebSocketConstructor(createMoonrakerWebSocketUrl(runtimeUrl))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create Moonraker WebSocket'
      handlers.onError?.(message)
      scheduleReconnect(message)
      return
    }

    socket.onopen = () => {
      reconnectAttempt = 0
      handlers.onConnectionChange('connecting')
      if (socket !== null) {
        sendSubscriptionRequest(socket)
      }
    }

    socket.onmessage = (event) => {
      const message = parseMoonrakerMessage(event.data)
      if (message === null) {
        return
      }

      handleRpcMessage(message)
    }

    socket.onerror = () => {
      handlers.onError?.('Moonraker WebSocket error')
    }

    socket.onclose = () => {
      socket = null
      scheduleReconnect('Moonraker WebSocket closed')
    }
  }

  connect()

  return {
    close() {
      closedByClient = true
      clearReconnectTimer()
      if (socket !== null) {
        socket.close()
        socket = null
      }
    },
  }
}
