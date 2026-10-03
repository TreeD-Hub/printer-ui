import { moonrakerUrl } from '../../config'
import {
  normalizeMoonrakerRuntimeSnapshot,
  type MoonrakerObjectsQueryPayload,
  type MoonrakerPrinterObjectsStatus,
} from './moonrakerNormalizer'
import { selectMoonrakerRuntimeObjects } from './moonrakerRuntimeObjects'
import type { PrinterSnapshot, TransportSubscriptionHandlers } from './types'

type MoonrakerJsonRpcMessage = {
  id?: number
  method?: string
  params?: unknown[]
  result?: MoonrakerObjectsQueryPayload & { klippy_state?: string, objects?: string[] }
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

const DEFAULT_RECONNECT_DELAY_MS = 2_000
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000
const DEFAULT_RECONNECT_JITTER_RATIO = 0.2

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
  availableObjects: readonly string[],
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
      availableObjects,
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
  let readyCheckTimer: number | null = null
  let closedByClient = false
  let cachedStatus: MoonrakerPrinterObjectsStatus = {}
  let cachedEventtime: number | undefined
  let reconnectAttempt = 0
  let nextDiscoveryRequestId = -1
  let nextSubscriptionRequestId = 1
  let activeRequestId: number | null = null
  let requestPhase: 'info' | 'list' | 'contract' | 'subscribe' | null = null
  let availableObjects: string[] = []
  let subscriptionActive = false

  function clearReconnectTimer(): void {
    if (reconnectTimer === null) {
      return
    }

    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  function resetCachedStatus(): void {
    cachedStatus = {}
    cachedEventtime = undefined
  }

  function resetKlippySubscription(): void {
    if (readyCheckTimer !== null) {
      window.clearTimeout(readyCheckTimer)
      readyCheckTimer = null
    }
    activeRequestId = null
    requestPhase = null
    availableObjects = []
    subscriptionActive = false
    resetCachedStatus()
  }

  function emitStatusSnapshot(
    nextStatus: MoonrakerPrinterObjectsStatus,
    eventtime?: number,
    mode: 'merge' | 'replace' = 'merge',
  ): void {
    cachedStatus = mode === 'replace'
      ? nextStatus
      : mergePrinterStatus(cachedStatus, nextStatus)
    cachedEventtime = mode === 'replace' ? eventtime : eventtime ?? cachedEventtime
    const snapshot = normalizeCachedStatus(cachedStatus, runtimeUrl, availableObjects, cachedEventtime)
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

  function sendRequest(nextSocket: WebSocket, phase: 'info' | 'list' | 'contract' | 'subscribe'): void {
    const requestId = phase === 'subscribe' ? nextSubscriptionRequestId++ : nextDiscoveryRequestId--
    activeRequestId = requestId
    requestPhase = phase
    subscriptionActive = false
    const method = {
      info: 'server.info',
      list: 'printer.objects.list',
      contract: 'printer.objects.query',
      subscribe: 'printer.objects.subscribe',
    }[phase]
    const objects = phase === 'contract'
      ? { 'gcode_macro _TREED_UI_CONTRACT': null }
      : Object.fromEntries(selectMoonrakerRuntimeObjects(availableObjects).map((name) => [name, null]))
    nextSocket.send(JSON.stringify({
      jsonrpc: '2.0',
      method,
      ...(phase === 'contract' || phase === 'subscribe' ? { params: { objects } } : {}),
      id: requestId,
    }))
  }

  function handleStatusNotification(params: unknown[] | undefined): void {
    if (!subscriptionActive) {
      return
    }

    const nextStatus = params?.[0]
    if (!isRecord(nextStatus)) {
      return
    }

    const eventtime = typeof params?.[1] === 'number' ? params[1] : undefined
    emitStatusSnapshot(nextStatus as MoonrakerPrinterObjectsStatus, eventtime)
  }

  function handleRpcMessage(message: MoonrakerJsonRpcMessage): void {
    if (message.id !== undefined && message.id !== activeRequestId) {
      return
    }

    if (message.error?.message) {
      subscriptionActive = false
      handlers.onError?.(message.error.message)
      handlers.onConnectionChange('degraded', message.error.message)
      socket?.close()
      return
    }

    if (message.id === activeRequestId) {
      if (requestPhase === 'info') {
        const state = message.result?.klippy_state
        if (state === 'ready') {
          if (socket !== null) sendRequest(socket, 'list')
        } else {
          emitStatusSnapshot(setWebhooksState({}, state ?? 'disconnected', `Klippy ${state ?? 'disconnected'}`), undefined, 'replace')
          readyCheckTimer = window.setTimeout(() => {
            readyCheckTimer = null
            if (socket !== null) sendRequest(socket, 'info')
          }, 2_000)
        }
        return
      }
      if (requestPhase === 'list') {
        if (!Array.isArray(message.result?.objects)
          || !message.result.objects.every((name) => typeof name === 'string')) {
          handlers.onError?.('Некорректный ответ printer.objects.list')
          socket?.close()
          return
        }
        availableObjects = message.result.objects
        if (socket !== null) sendRequest(socket, availableObjects.includes('gcode_macro _TREED_UI_CONTRACT') ? 'contract' : 'subscribe')
        return
      }
      if (requestPhase === 'contract') {
        if (!message.result?.status?.['gcode_macro _TREED_UI_CONTRACT']) {
          handlers.onError?.('Контракт UI отсутствует в ответе printer.objects.query')
          socket?.close()
          return
        }
        const contractSnapshot = normalizeCachedStatus(message.result.status, runtimeUrl, availableObjects)
        if (contractSnapshot.uiContract.status !== 'compatible') {
          handlers.onConnectionChange('degraded', contractSnapshot.uiContract.message ?? 'Несовместимый контракт UI')
        }
        if (socket !== null) sendRequest(socket, 'subscribe')
        return
      }
      if (requestPhase === 'subscribe' && message.result?.status) {
        subscriptionActive = true
        reconnectAttempt = 0
        emitStatusSnapshot(message.result.status, message.result.eventtime, 'replace')
        return
      }
      handlers.onError?.('Некорректный ответ Moonraker')
      socket?.close()
      return
    }

    switch (message.method) {
      case 'notify_status_update':
        handleStatusNotification(message.params)
        return
      case 'notify_klippy_ready':
        resetKlippySubscription()
        emitStatusSnapshot(setWebhooksState({}, 'ready', 'Klippy ready'), undefined, 'replace')
        if (socket !== null) {
          sendRequest(socket, 'list')
        }
        return
      case 'notify_klippy_shutdown':
        resetKlippySubscription()
        emitStatusSnapshot(setWebhooksState({}, 'shutdown', 'Klippy shutdown'), undefined, 'replace')
        return
      case 'notify_klippy_disconnected':
        resetKlippySubscription()
        emitStatusSnapshot(setWebhooksState({}, 'disconnected', 'Klippy disconnected'), undefined, 'replace')
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

    resetKlippySubscription()
    nextSubscriptionRequestId = 1
    handlers.onConnectionChange('connecting')

    try {
      socket = new WebSocketConstructor(createMoonrakerWebSocketUrl(runtimeUrl))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create Moonraker WebSocket'
      handlers.onError?.(message)
      scheduleReconnect(message)
      return
    }
    const nextSocket = socket

    nextSocket.onopen = () => {
      if (socket !== nextSocket) return
      handlers.onConnectionChange('connecting')
      sendRequest(nextSocket, 'info')
    }

    nextSocket.onmessage = (event) => {
      if (socket !== nextSocket) return
      const message = parseMoonrakerMessage(event.data)
      if (message === null) {
        return
      }

      handleRpcMessage(message)
    }

    nextSocket.onerror = () => {
      if (socket !== nextSocket) return
      handlers.onError?.('Moonraker WebSocket error')
    }

    nextSocket.onclose = () => {
      if (socket !== nextSocket) return
      socket = null
      resetKlippySubscription()
      scheduleReconnect('Moonraker WebSocket closed')
    }
  }

  connect()

  return {
    close() {
      closedByClient = true
      clearReconnectTimer()
      resetKlippySubscription()
      if (socket !== null) {
        socket.close()
        socket = null
      }
    },
  }
}
