// Общий контракт событий core: WebSocket RESPOND и последнее состояние макроса.
export type PrinterEvent = { sequence: number; code: string; detail: string }
export type PrinterNotification = {
  id: string
  title: string
  details: string
  severity: 'info' | 'warning' | 'error'
}

export function readPrinterEvent(value: unknown): PrinterEvent | null {
  if (typeof value !== 'object' || value === null) return null
  const event = value as Record<string, unknown>
  if (!Number.isSafeInteger(event.sequence) || (event.sequence as number) < 1
    || typeof event.code !== 'string' || !/^[a-z0-9_]{1,64}$/.test(event.code)
    || typeof event.detail !== 'string' || !/^[a-z0-9_./]{0,128}$/.test(event.detail)) return null
  return { sequence: event.sequence as number, code: event.code, detail: event.detail }
}

export function parsePrinterEvent(message: string): PrinterEvent | null {
  const match = /^(?:\/\/\s*)?treed_event\s+v1\|(\d+)\|([^|]+)\|([^|]*)$/.exec(message.trim())
  return match ? readPrinterEvent({ sequence: Number(match[1]), code: match[2], detail: match[3] }) : null
}

const reasons: Record<string, string> = {
  operator: 'Пауза по команде оператора или G-code.',
  filament_change: 'Команда M600: печать остановлена для замены филамента.',
  filament_runout: 'Датчик сообщил об отсутствии филамента. Установите пластик, нагрейте сопло и проверьте подачу.',
  clog: 'Датчик не видит движения филамента. Проверяется возможный засор сопла.',
  no_filament: 'Филамент отсутствует.',
  no_motion: 'Подача не восстановлена после всех попыток.',
  encoder_unavailable: 'Канал движения датчика недоступен.',
  low_target: 'Сохранённая температура сопла слишком низкая.',
  timeout: 'Превышено время автоматической прочистки.',
}

export function describePrinterEvent(event: PrinterEvent): PrinterNotification {
  const messages: Record<string, [string, string, PrinterNotification['severity']]> = {
    paused: ['Печать на паузе', reasons[event.detail] ?? event.detail, 'warning'],
    clog_started: ['Прочистка сопла', 'Автоматическое восстановление подачи: нагрев и проверка филамента.', 'warning'],
    clog_attempt: ['Прочистка сопла', `Попытка ${event.detail}. Дождитесь результата.`, 'warning'],
    clog_succeeded: ['Подача восстановлена', 'Прочистка завершена, начинается возобновление печати.', 'info'],
    clog_failed: ['Прочистка не удалась', `${reasons[event.detail] ?? event.detail} Принтер остаётся на паузе, сопло охлаждается до 140 °C.`, 'error'],
    clog_aborted: ['Прочистка остановлена', 'Автоматическая прочистка прервана командой управления.', 'warning'],
    print_preparing: ['Подготовка печати', 'Выполняется стартовый цикл принтера.', 'info'],
    print_resumed: ['Печать продолжена', 'Принтер вернулся к выполнению задания.', 'info'],
    print_cancelled: ['Печать отменена', event.detail === 'spaghetti' ? 'Камера обнаружила дефект типа спагетти на трёх последовательных кадрах. Нагрев отключён.' : 'Задание остановлено, нагрев отключён.', 'warning'],
    print_complete: ['Печать завершена', 'Завершён конечный цикл принтера.', 'info'],
  }
  const [title, details, severity] = messages[event.code] ?? ['Событие принтера', `${event.code}: ${event.detail}`, 'info']
  return { id: `${event.sequence}:${event.code}`, title, details, severity }
}
