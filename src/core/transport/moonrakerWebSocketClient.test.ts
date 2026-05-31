import { describe, expect, it } from 'vitest'
import {
  createMoonrakerWebSocketUrl,
  MOONRAKER_SUBSCRIPTION_OBJECTS,
} from './moonrakerWebSocketClient'

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
})
