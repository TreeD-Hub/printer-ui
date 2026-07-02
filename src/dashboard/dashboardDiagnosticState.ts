import type { PrinterCommandId } from '../core/commands'
import type {
  PrinterConnectionState,
  PrinterKlippyState,
  PrinterSource,
  PrinterTransportState,
  PrinterUiContractSnapshot,
} from '../core/transport/types'
import type { MoonrakerSystemStatus } from '../settings/systemStatus'

export type DashboardRecoveryCommand = Extract<
  PrinterCommandId,
  'restartKlipper' | 'firmwareRestart' | 'restartMoonraker'
>

export type DashboardDiagnosticAction =
  | {
      kind: 'refresh'
      label: string
    }
  | {
      kind: 'command'
      command: DashboardRecoveryCommand
      label: string
    }

export type DashboardDiagnosticRuntime = {
  source: PrinterSource
  connection: PrinterConnectionState
  transportState: PrinterTransportState
  transportMessage: string | null
  klippyState: PrinterKlippyState
  klippyMessage: string
  runtimeMessage: string
  uiContractStatus: PrinterUiContractSnapshot['status']
  uiContractMessage: string | null
}

export type DashboardDiagnostic = {
  id: string
  severity: 'warning' | 'error'
  title: string
  message: string
  details: string[]
  action: DashboardDiagnosticAction
}

const MAX_MESSAGE_LENGTH = 320

function singleLine(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function compactMessage(value: string | null | undefined, fallback: string): string {
  const normalized = singleLine(value) || fallback
  return normalized.length <= MAX_MESSAGE_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_MESSAGE_LENGTH - 1).trimEnd()}…`
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const normalized = singleLine(value)
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function buildVersionDetails(status: MoonrakerSystemStatus): string[] {
  const details: string[] = []
  const { software } = status

  if (software.klipperVersion !== null) {
    details.push(`Klipper: ${software.klipperVersion}`)
  }

  if (software.moonrakerVersion !== null || software.moonrakerApiVersion !== null) {
    const version = software.moonrakerVersion ?? 'версия неизвестна'
    const api = software.moonrakerApiVersion === null ? '' : ` · API ${software.moonrakerApiVersion}`
    details.push(`Moonraker: ${version}${api}`)
  }

  return details
}

function createDiagnostic(
  severity: DashboardDiagnostic['severity'],
  title: string,
  message: string,
  details: string[],
  action: DashboardDiagnosticAction,
): DashboardDiagnostic {
  const normalizedDetails = uniqueStrings(details).slice(0, 6)
  const actionKey = action.kind === 'command' ? action.command : action.kind
  const id = [severity, title, message, actionKey, ...normalizedDetails]
    .join('|')
    .toLowerCase()

  return {
    id,
    severity,
    title,
    message: compactMessage(message, title),
    details: normalizedDetails,
    action,
  }
}

function getKlippyTitle(state: PrinterKlippyState, message: string): string {
  const normalized = message.toLowerCase()

  if (normalized.includes('lost communication') || normalized.includes('timer too close')) {
    return 'Потеря связи с MCU'
  }
  if (normalized.includes('config') && (normalized.includes('error') || normalized.includes('not valid'))) {
    return 'Ошибка конфигурации Klipper'
  }
  if (normalized.includes('heater') || normalized.includes('thermal')) {
    return 'Ошибка нагрева'
  }
  if (normalized.includes('can') && (normalized.includes('error') || normalized.includes('timeout'))) {
    return 'Ошибка CAN-шины'
  }
  if (state === 'disconnected') {
    return 'Нет связи с Klipper'
  }
  if (state === 'shutdown') {
    return 'Klipper остановлен'
  }
  return 'Ошибка Klipper'
}

function getKlippyRecoveryAction(
  state: PrinterKlippyState,
  message: string,
): Extract<DashboardDiagnosticAction, { kind: 'command' }> {
  const normalized = message.toUpperCase()

  if (normalized.includes('FIRMWARE_RESTART') || state === 'shutdown') {
    return {
      kind: 'command',
      command: 'firmwareRestart',
      label: 'Перезапустить прошивку',
    }
  }

  return {
    kind: 'command',
    command: 'restartKlipper',
    label: 'Перезапустить Klipper',
  }
}

function getCoreServiceFailure(status: MoonrakerSystemStatus) {
  return status.services.find((service) => {
    const name = service.name.toLowerCase()
    return !service.healthy && (name === 'klipper' || name === 'moonraker')
  })
}

export function resolveDashboardDiagnostic(
  runtime: DashboardDiagnosticRuntime,
  systemStatus: MoonrakerSystemStatus,
): DashboardDiagnostic | null {
  if (runtime.source === 'mock') {
    return null
  }

  const versionDetails = buildVersionDetails(systemStatus)

  if (runtime.transportState === 'offline' || runtime.transportState === 'reconnecting') {
    const isOffline = runtime.transportState === 'offline'
    const title = isOffline ? 'Нет связи с Moonraker' : 'Восстановление связи'
    const message = compactMessage(
      runtime.transportMessage || runtime.runtimeMessage,
      isOffline ? 'Moonraker недоступен.' : 'Повторное подключение к Moonraker.',
    )

    return createDiagnostic(
      isOffline ? 'error' : 'warning',
      title,
      message,
      versionDetails,
      { kind: 'refresh', label: 'Повторить подключение' },
    )
  }

  if (['error', 'shutdown', 'disconnected'].includes(runtime.klippyState)) {
    const message = compactMessage(
      systemStatus.software.stateMessage || runtime.klippyMessage || runtime.runtimeMessage,
      runtime.klippyState === 'disconnected' ? 'Klipper недоступен.' : 'Klipper остановлен.',
    )

    return createDiagnostic(
      'error',
      getKlippyTitle(runtime.klippyState, message),
      message,
      versionDetails,
      getKlippyRecoveryAction(runtime.klippyState, message),
    )
  }

  if (systemStatus.software.failedComponents.length > 0) {
    const failedComponents = systemStatus.software.failedComponents
    return createDiagnostic(
      'error',
      'Компоненты Moonraker не загрузились',
      `Не запущены: ${failedComponents.join(', ')}.`,
      [
        ...versionDetails,
        ...failedComponents.map((component) => `Компонент: ${component}`),
      ],
      {
        kind: 'command',
        command: 'restartMoonraker',
        label: 'Перезапустить Moonraker',
      },
    )
  }

  if (runtime.connection === 'degraded' || runtime.uiContractStatus === 'incompatible') {
    return createDiagnostic(
      'warning',
      'Ограниченный режим',
      compactMessage(
        runtime.uiContractMessage || runtime.runtimeMessage,
        'Moonraker отвечает, но часть функций принтера недоступна.',
      ),
      versionDetails,
      { kind: 'refresh', label: 'Проверить повторно' },
    )
  }

  if (systemStatus.software.warnings.length > 0) {
    const [firstWarning, ...otherWarnings] = systemStatus.software.warnings
    return createDiagnostic(
      'warning',
      'Предупреждение Moonraker',
      compactMessage(firstWarning, 'Moonraker сообщил предупреждение.'),
      [...versionDetails, ...otherWarnings.map((warning) => `Moonraker: ${warning}`)],
      { kind: 'refresh', label: 'Обновить диагностику' },
    )
  }

  const coreServiceFailure = getCoreServiceFailure(systemStatus)
  if (coreServiceFailure !== undefined) {
    const isMoonraker = coreServiceFailure.name.toLowerCase() === 'moonraker'
    return createDiagnostic(
      'error',
      `Служба ${coreServiceFailure.name} не работает`,
      compactMessage(
        [coreServiceFailure.activeState, coreServiceFailure.subState].filter(Boolean).join(' / '),
        'Системная служба остановлена.',
      ),
      versionDetails,
      {
        kind: 'command',
        command: isMoonraker ? 'restartMoonraker' : 'restartKlipper',
        label: isMoonraker ? 'Перезапустить Moonraker' : 'Перезапустить Klipper',
      },
    )
  }

  if (systemStatus.errors.length > 0 || systemStatus.loadState === 'unavailable') {
    return createDiagnostic(
      'warning',
      'Диагностика доступна частично',
      compactMessage(systemStatus.errors[0], 'Не удалось получить данные диагностики.'),
      [...versionDetails, ...systemStatus.errors.slice(1)],
      { kind: 'refresh', label: 'Повторить проверку' },
    )
  }

  if (systemStatus.host.throttledFlags.length > 0) {
    const [firstFlag, ...otherFlags] = systemStatus.host.throttledFlags
    return createDiagnostic(
      'warning',
      'Ограничение производительности',
      compactMessage(firstFlag, 'Хост сообщает об ограничении производительности.'),
      [...versionDetails, ...otherFlags.map((flag) => `Host: ${flag}`)],
      { kind: 'refresh', label: 'Обновить диагностику' },
    )
  }

  return null
}
