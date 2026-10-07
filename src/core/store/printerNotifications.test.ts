import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeMoonrakerRuntimeSnapshot } from '../transport/moonrakerNormalizer'

describe('центр уведомлений', () => {
  beforeEach(() => vi.resetModules())
  it('показывает причину автоотмены один раз для RESPOND и snapshot', async () => {
    const store = await import('./printerNotifications')
    store.receivePrinterGcodeResponse('treed_event v1|7|print_cancelled|spaghetti')
    const snapshot = normalizeMoonrakerRuntimeSnapshot({ eventtime: 20, status: {
      webhooks: { state: 'ready' }, print_stats: { state: 'cancelled' },
      'gcode_macro _TREED_EVENT': { sequence: 7, code: 'print_cancelled', detail: 'spaghetti' },
    } })
    store.receivePrinterNotificationSnapshot(snapshot)
    expect(store.getPrinterNotifications().history).toHaveLength(1)
    expect(store.getPrinterNotifications().popup?.title).toBe('Печать отменена: спагетти')
    expect(store.getPrinterNotifications().popup?.details).toContain('трёх последовательных кадрах')
  })
  it('дедуплицирует RESPOND и snapshot, хранит историю и закрывает окно', async () => {
    const store = await import('./printerNotifications')
    store.receivePrinterGcodeResponse('treed_event v1|1|clog_started|')
    store.receivePrinterEvent({ sequence: 1, code: 'clog_started', detail: '' })
    expect(store.getPrinterNotifications().history).toHaveLength(1)
    expect(store.getPrinterNotifications().popup?.title).toBe('Прочистка сопла')
    store.dismissPrinterNotification()
    expect(store.getPrinterNotifications().popup).toBeNull()
    store.receivePrinterEvent({ sequence: 2, code: 'clog_failed', detail: 'timeout' })
    expect(store.getPrinterNotifications().popup?.details).toContain('Превышено время')
    expect(store.getPrinterNotifications().history).toHaveLength(2)
  })

  it('восстанавливает событие из snapshot, повтор reconnect не создаёт копию', async () => {
    const store = await import('./printerNotifications')
    const snapshot = normalizeMoonrakerRuntimeSnapshot({ eventtime: 20, status: {
      webhooks: { state: 'ready' }, print_stats: { state: 'paused' },
      'gcode_macro _TREED_EVENT': { sequence: 4, code: 'paused', detail: 'filament_runout' },
    } })
    store.receivePrinterNotificationSnapshot(snapshot)
    const count = store.getPrinterNotifications().history.length
    expect(store.getPrinterNotifications().popup?.details).toContain('отсутствии филамента')
    store.receivePrinterNotificationSnapshot(snapshot)
    expect(store.getPrinterNotifications().history).toHaveLength(count)
    store.receivePrinterNotificationSnapshot({ ...snapshot, klippy: { state: 'startup', message: '' }, printerEvent: null })
    store.receivePrinterEvent({ sequence: 1, code: 'clog_started', detail: '' })
    expect(store.getPrinterNotifications().popup?.title).toBe('Прочистка сопла')
  })

  it('не показывает поток температур; ограничивает историю 50 записями', async () => {
    const store = await import('./printerNotifications')
    store.receivePrinterGcodeResponse('ok T:220 B:60')
    expect(store.getPrinterNotifications().history).toHaveLength(0)
    for (let sequence = 1; sequence <= 55; sequence++) store.receivePrinterEvent({ sequence, code: 'clog_attempt', detail: '1/5' })
    expect(store.getPrinterNotifications().history).toHaveLength(50)
  })

  it('ошибка после reconnect важнее сохранённой паузы', async () => {
    const store = await import('./printerNotifications')
    const snapshot = normalizeMoonrakerRuntimeSnapshot({ eventtime: 20, status: {
      webhooks: { state: 'shutdown', state_message: 'Heater error' },
      print_stats: { state: 'error', message: 'Heater error' },
      'gcode_macro _TREED_EVENT': { sequence: 4, code: 'paused', detail: 'filament_runout' },
    } })
    store.receivePrinterNotificationSnapshot(snapshot)
    expect(store.getPrinterNotifications().popup?.severity).toBe('error')
    expect(store.getPrinterNotifications().popup?.details).toBe('Heater error')
    const count = store.getPrinterNotifications().history.length
    store.receivePrinterNotificationSnapshot(snapshot)
    expect(store.getPrinterNotifications().history).toHaveLength(count)
  })
})
