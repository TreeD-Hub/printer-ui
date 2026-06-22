import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMoonrakerWebSocketUrl,
  MOONRAKER_SUBSCRIPTION_OBJECTS,
  subscribeToMoonrakerStatus,
} from './moonrakerWebSocketClient'
import type { PrinterConnectionState, PrinterSnapshot } from './types'

class TestWebSocket {
  static instances: TestWebSocket[] = []

  readonly url: string
  readonly sentMessages: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    TestWebSocket.instances.push(this)
  }

  send(message: string): void {
    this.sentMessages.push(message)
  }

  close(): void {
    this.onclose?.()
  }

  open(): void {
    this.onopen?.()
  }

  message(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  failClose(): void {
    this.onclose?.()
  }

  static reset(): void {
    TestWebSocket.instances = []
  }
}

function subscribeForTest() {
  const snapshots: PrinterSnapshot[] = []
  const connectionChanges: Array<{ connection: PrinterConnectionState, message?: string }> = []
  const errors: string[] = []
  const fileListChanges: number[] = []
  const gcodeResponses: string[] = []
  const subscription = subscribeToMoonrakerStatus(
    {
      onSnapshot(snapshot) {
        snapshots.push(snapshot)
      },
      onConnectionChange(connection, message) {
        connectionChanges.push({ connection, message })
      },
      onError(message) {
        errors.push(message)
      },
      onFileListChanged() {
        fileListChanges.push(Date.now())
      },
      onGcodeResponse(message) {
        gcodeResponses.push(message)
      },
    },
    {
      moonrakerUrl: 'http://127.0.0.1:7125',
      reconnectDelayMs: 50,
      reconnectJitterRatio: 0,
      WebSocketCtor: TestWebSocket as unknown as typeof WebSocket,
    },
  )

  return {
    connectionChanges,
    errors,
    fileListChanges,
    gcodeResponses,
    snapshots,
    subscription,
  }
}

afterEach(() => {
  vi.useRealTimers()
  TestWebSocket.reset()
})

describe('moonrakerWebSocketClient', () => {
  it('maps Moonraker HTTP URLs to the primary websocket endpoint', () => {
    expect(createMoonrakerWebSocketUrl('http://127.0.0.1:7125')).toBe('ws://127.0.0.1:7125/websocket')
    expect(createMoonrakerWebSocketUrl('https://printer.local/api')).toBe('wss://printer.local/websocket')
  })

  it('subscribes to TreeD V2 runtime objects with full object payloads', () => {
    expect(MOONRAKER_SUBSCRIPTION_OBJECTS.webhooks).toBeNull()
    expect(MOONRAKER_SUBSCRIPTION_OBJECTS.toolhead).toBeNull()
    expect(MOONRAKER_SUBSCRIPTION_OBJECTS.gcode_move).toBeNull()
    expect(MOONRAKER_SUBSCRIPTION_OBJECTS.print_stats).toBeNull()
    expect(MOONRAKER_SUBSCRIPTION_OBJECTS.idle_timeout).toBeNull()
    expect(MOONRAKER_SUBSCRIPTION_OBJECTS['gcode_macro _TREED_GEOMETRY_CFG']).toBeNull()
  })

  it('sends subscription request and normalizes initial status result', () => {
    const { snapshots, subscription } = subscribeForTest()
    const socket = TestWebSocket.instances[0]

    expect(socket?.url).toBe('ws://127.0.0.1:7125/websocket')

    socket?.open()

    expect(socket?.sentMessages).toHaveLength(1)
    expect(JSON.parse(socket?.sentMessages[0] ?? '{}')).toEqual({
      jsonrpc: '2.0',
      method: 'printer.objects.subscribe',
      params: {
        objects: MOONRAKER_SUBSCRIPTION_OBJECTS,
      },
      id: 1,
    })

    socket?.message({
      id: 1,
      result: {
        eventtime: 12.3,
        status: {
          webhooks: {
            state: 'ready',
            state_message: 'Printer is ready',
          },
          toolhead: {
            position: [10, 20, 30, 0],
            homed_axes: 'xy',
          },
        },
      },
    })

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.connection).toBe('online')
    expect(snapshots[0]?.toolhead.rawX).toBe(10)
    expect(snapshots[0]?.toolhead.rawY).toBe(20)
    expect(snapshots[0]?.homedAxes).toBe('xy')

    subscription.close()
  })

  it('merges notify_status_update payloads without losing cached object fields', () => {
    const { snapshots, subscription } = subscribeForTest()
    const socket = TestWebSocket.instances[0]

    socket?.open()
    socket?.message({
      id: 1,
      result: {
        status: {
          webhooks: {
            state: 'ready',
          },
          toolhead: {
            position: [10, 20, 30, 0],
            homed_axes: 'xy',
          },
        },
      },
    })
    socket?.message({
      method: 'notify_status_update',
      params: [
        {
          toolhead: {
            homed_axes: 'xyz',
          },
        },
        13.4,
      ],
    })

    expect(snapshots).toHaveLength(2)
    expect(snapshots[1]?.toolhead.rawX).toBe(10)
    expect(snapshots[1]?.toolhead.rawY).toBe(20)
    expect(snapshots[1]?.homedAxes).toBe('xyz')
    expect(snapshots[1]?.connection).toBe('online')

    subscription.close()
  })

  it('maps Klippy lifecycle notifications to connection snapshots', () => {
    const { snapshots, subscription } = subscribeForTest()
    const socket = TestWebSocket.instances[0]

    socket?.open()
    socket?.message({
      method: 'notify_klippy_disconnected',
    })

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.connection).toBe('offline')
    expect(snapshots[0]?.message).toBe('Klippy disconnected')

    socket?.message({
      method: 'notify_klippy_shutdown',
    })

    expect(snapshots[1]?.connection).toBe('shutdown')
    expect(snapshots[1]?.message).toBe('Klippy shutdown')

    subscription.close()
  })

  it('routes file and G-code notifications to typed handlers', () => {
    const { fileListChanges, gcodeResponses, subscription } = subscribeForTest()
    const socket = TestWebSocket.instances[0]

    socket?.open()
    socket?.message({ method: 'notify_filelist_changed', params: [{ action: 'create_file' }] })
    socket?.message({ method: 'notify_metadata_update', params: [{ filename: 'benchy.gcode' }] })
    socket?.message({ method: 'notify_gcode_response', params: ['ok T:220'] })

    expect(fileListChanges).toHaveLength(2)
    expect(gcodeResponses).toEqual(['ok T:220'])

    subscription.close()
  })

  it('emits reconnecting state and opens a new socket after close', () => {
    vi.useFakeTimers()
    const { connectionChanges, subscription } = subscribeForTest()
    const socket = TestWebSocket.instances[0]

    socket?.open()
    socket?.failClose()

    expect(connectionChanges.at(-1)).toEqual({
      connection: 'reconnecting',
      message: 'Moonraker WebSocket closed',
    })

    vi.advanceTimersByTime(50)

    expect(TestWebSocket.instances).toHaveLength(2)
    expect(connectionChanges.at(-1)).toEqual({
      connection: 'connecting',
      message: undefined,
    })

    subscription.close()
  })

  it('uses capped exponential backoff between repeated reconnect attempts', () => {
    vi.useFakeTimers()
    const subscription = subscribeToMoonrakerStatus(
      {
        onSnapshot() {
          return undefined
        },
        onConnectionChange() {
          return undefined
        },
      },
      {
        moonrakerUrl: 'http://127.0.0.1:7125',
        reconnectDelayMs: 50,
        reconnectMaxDelayMs: 200,
        reconnectJitterRatio: 0,
        WebSocketCtor: TestWebSocket as unknown as typeof WebSocket,
      },
    )

    TestWebSocket.instances[0]?.failClose()
    vi.advanceTimersByTime(49)
    expect(TestWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(TestWebSocket.instances).toHaveLength(2)

    TestWebSocket.instances[1]?.failClose()
    vi.advanceTimersByTime(99)
    expect(TestWebSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(TestWebSocket.instances).toHaveLength(3)

    TestWebSocket.instances[2]?.failClose()
    vi.advanceTimersByTime(199)
    expect(TestWebSocket.instances).toHaveLength(3)
    vi.advanceTimersByTime(1)
    expect(TestWebSocket.instances).toHaveLength(4)

    TestWebSocket.instances[3]?.failClose()
    vi.advanceTimersByTime(200)
    expect(TestWebSocket.instances).toHaveLength(5)

    subscription.close()
  })
})
