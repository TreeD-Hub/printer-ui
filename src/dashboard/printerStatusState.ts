import type { PrinterSnapshot } from '../core/transport/types'

export type PrinterDisplaySeverity = 'normal' | 'info' | 'warning' | 'error'

export type PrinterDisplayStatusInput = Pick<PrinterSnapshot, 'connection' | 'message' | 'state'> & {
  printJob: Pick<PrinterSnapshot['printJob'], 'message' | 'state'>
}

export type PrinterDisplayNotification = {
  id: string
  title: string
  details: string
  severity: Exclude<PrinterDisplaySeverity, 'normal'>
}

export type PrinterDisplayStatus = {
  label: string
  details: string
  severity: PrinterDisplaySeverity
  notification: PrinterDisplayNotification | null
}

const PRINT_STATE_LABELS: Record<string, { label: string; severity: PrinterDisplaySeverity; notify?: boolean }> = {
  standby: { label: 'Ожидание печати', severity: 'normal' },
  ready: { label: 'Ожидание печати', severity: 'normal' },
  idle: { label: 'Ожидание печати', severity: 'normal' },
  startup: { label: 'Запуск системы', severity: 'info' },
  starting: { label: 'Запуск системы', severity: 'info' },
  printing: { label: 'Печать', severity: 'info' },
  paused: { label: 'Пауза', severity: 'warning' },
  complete: { label: 'Печать завершена', severity: 'info', notify: true },
  cancelled: { label: 'Печать отменена', severity: 'warning', notify: true },
  canceled: { label: 'Печать отменена', severity: 'warning', notify: true },
  error: { label: 'Ошибка печати', severity: 'error', notify: true },
  shutdown: { label: 'Аварийная остановка Klipper', severity: 'error', notify: true },
}

function normalizeRuntimeText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.find((value) => value !== undefined && value.trim().length > 0)?.trim() ?? ''
}

function buildNotification(
  label: string,
  details: string,
  severity: PrinterDisplayNotification['severity'],
): PrinterDisplayNotification {
  const normalizedDetails = details || label

  return {
    id: `${severity}:${label}:${normalizedDetails}`.toLowerCase(),
    title: label,
    details: normalizedDetails,
    severity,
  }
}

function resolveMessageStatus(message: string): Pick<PrinterDisplayStatus, 'label' | 'severity'> | null {
  const normalized = normalizeRuntimeText(message)

  if (!normalized) {
    return null
  }

  if (normalized.includes('mcu') && normalized.includes('shutdown')) {
    return { label: 'Ошибка MCU', severity: 'error' }
  }

  if (normalized.includes('lost communication') || normalized.includes('timer too close')) {
    return { label: 'Потеря связи с MCU', severity: 'error' }
  }

  if (normalized.includes('klippy') && (normalized.includes('disconnect') || normalized.includes('not connected'))) {
    return { label: 'Нет связи с Klipper', severity: 'error' }
  }

  if (normalized.includes('config') && normalized.includes('error')) {
    return { label: 'Ошибка конфигурации Klipper', severity: 'error' }
  }

  if (normalized.includes('heater') || normalized.includes('thermal')) {
    if (normalized.includes('error') || normalized.includes('shutdown') || normalized.includes('fault')) {
      return { label: 'Ошибка нагрева', severity: 'error' }
    }
  }

  if (normalized.includes('can') && (normalized.includes('error') || normalized.includes('timeout'))) {
    return { label: 'Ошибка CAN-шины', severity: 'error' }
  }

  if (normalized.includes('error') || normalized.includes('failed') || normalized.includes('exception')) {
    return { label: 'Ошибка принтера', severity: 'error' }
  }

  return null
}

export function resolvePrinterDisplayStatus(snapshot: PrinterDisplayStatusInput): PrinterDisplayStatus {
  const message = firstNonEmpty(snapshot.printJob.message, snapshot.message)
  const messageStatus = resolveMessageStatus(message)

  if (snapshot.connection === 'offline') {
    const label = 'Нет связи с Moonraker'
    return {
      label,
      details: message || 'Moonraker недоступен.',
      severity: 'error',
      notification: buildNotification(label, message || 'Moonraker недоступен.', 'error'),
    }
  }

  if (snapshot.connection === 'reconnecting') {
    const label = 'Восстановление связи'
    return {
      label,
      details: message || 'Повторное подключение к Moonraker.',
      severity: 'warning',
      notification: buildNotification(label, message || 'Повторное подключение к Moonraker.', 'warning'),
    }
  }

  if (snapshot.connection === 'connecting') {
    return {
      label: 'Запуск системы',
      details: message || 'Подключение к Moonraker.',
      severity: 'info',
      notification: null,
    }
  }

  if (snapshot.connection === 'shutdown') {
    const label = messageStatus?.label ?? 'Аварийная остановка Klipper'
    return {
      label,
      details: message || 'Klipper остановлен.',
      severity: 'error',
      notification: buildNotification(label, message || 'Klipper остановлен.', 'error'),
    }
  }

  if (messageStatus !== null) {
    const notificationSeverity = messageStatus.severity === 'normal' ? null : messageStatus.severity

    return {
      label: messageStatus.label,
      details: message,
      severity: messageStatus.severity,
      notification: notificationSeverity === null
        ? null
        : buildNotification(messageStatus.label, message, notificationSeverity),
    }
  }

  if (snapshot.connection === 'degraded') {
    const label = 'Ограниченный режим связи'
    return {
      label,
      details: message || 'Moonraker отвечает, но часть данных недоступна.',
      severity: 'warning',
      notification: buildNotification(label, message || 'Moonraker отвечает, но часть данных недоступна.', 'warning'),
    }
  }

  const printState = normalizeRuntimeText(snapshot.printJob.state)
  const runtimeState = normalizeRuntimeText(snapshot.state)
  const stateMeta = PRINT_STATE_LABELS[printState] ?? PRINT_STATE_LABELS[runtimeState]

  if (stateMeta !== undefined) {
    const notificationSeverity = stateMeta.notify === true && stateMeta.severity !== 'normal'
      ? stateMeta.severity
      : null

    return {
      label: stateMeta.label,
      details: message,
      severity: stateMeta.severity,
      notification: notificationSeverity === null
        ? null
        : buildNotification(stateMeta.label, message || stateMeta.label, notificationSeverity),
    }
  }

  return {
    label: 'Состояние неизвестно',
    details: message,
    severity: 'warning',
    notification: buildNotification('Состояние неизвестно', message || snapshot.state || 'Нет данных о состоянии.', 'warning'),
  }
}
