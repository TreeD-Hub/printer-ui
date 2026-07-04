import type { PrinterCommandId } from '../core/commands'
import type {
  PrinterConnectionState,
  PrinterKlippyState,
  PrinterSource,
  PrinterTransportState,
  PrinterUiContractSnapshot,
} from '../core/transport/types'
import {
  isSystemCanDeviceHealthy,
  isSystemServiceHealthRelevant,
  type MoonrakerSystemStatus,
  type SystemServiceStatus,
} from '../settings/systemStatus'

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
  | {
      kind: 'openSystem'
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
  systemStatus?: MoonrakerSystemStatus
}

export type PrinterHealthSnapshot = {
  id: string
  severity: 'warning' | 'error' | 'fatal'
  title: string
  message: string
  action: DashboardDiagnosticAction
}

export type DashboardDiagnostic = PrinterHealthSnapshot

const MAX_MESSAGE_LENGTH = 320

function compactMessage(value: string | null | undefined, fallback: string): string {
  const normalized = value?.replace(/\s+/g, ' ').trim() || fallback
  return normalized.length <= MAX_MESSAGE_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_MESSAGE_LENGTH - 1).trimEnd()}…`
}

function createDiagnostic(
  severity: DashboardDiagnostic['severity'],
  title: string,
  message: string,
  action: DashboardDiagnosticAction,
): DashboardDiagnostic {
  const normalizedMessage = compactMessage(message, title)
  const actionKey = action.kind === 'command' ? action.command : action.kind

  return {
    id: `${severity}|${title}|${normalizedMessage}|${actionKey}`.toLowerCase(),
    severity,
    title,
    message: normalizedMessage,
    action,
  }
}

function getKlippyRecoveryAction(
  state: PrinterKlippyState,
  message: string,
): Extract<DashboardDiagnosticAction, { kind: 'command' }> {
  if (state === 'shutdown' || message.toUpperCase().includes('FIRMWARE_RESTART')) {
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

function serviceStateMessage(service: SystemServiceStatus): string {
  return [service.activeState, service.subState].filter(Boolean).join(' / ') || 'нет данных'
}

function findUnhealthyService(
  status: MoonrakerSystemStatus,
  name?: string,
): SystemServiceStatus | undefined {
  return status.services.find((service) => isSystemServiceHealthRelevant(service) && !service.healthy && (
    name === undefined || service.name.toLowerCase() === name.toLowerCase()
  ))
}

export function resolveDashboardDiagnostic(
  runtime: DashboardDiagnosticRuntime,
): DashboardDiagnostic | null {
  if (runtime.source === 'mock') {
    return null
  }

  if (runtime.transportState === 'offline') {
    return createDiagnostic(
      'fatal',
      'Нет связи с Moonraker',
      runtime.transportMessage || runtime.runtimeMessage,
      { kind: 'refresh', label: 'Повторить подключение' },
    )
  }

  if (
    runtime.connection === 'shutdown' ||
    ['error', 'shutdown', 'disconnected'].includes(runtime.klippyState)
  ) {
    const title = runtime.klippyState === 'disconnected'
      ? 'Нет связи с Klipper'
      : runtime.klippyState === 'error'
        ? 'Ошибка Klipper'
        : 'Klipper остановлен'
    const message = runtime.klippyMessage || runtime.runtimeMessage

    return createDiagnostic(
      'fatal',
      title,
      message,
      getKlippyRecoveryAction(runtime.klippyState, message),
    )
  }

  if (runtime.uiContractStatus === 'incompatible') {
    return createDiagnostic(
      'error',
      'Несовместимый UI-контракт',
      runtime.uiContractMessage || runtime.runtimeMessage,
      { kind: 'refresh', label: 'Проверить повторно' },
    )
  }

  const systemStatus = runtime.systemStatus
  if (systemStatus !== undefined && systemStatus.loadState !== 'loading') {
    if (systemStatus.loadState === 'unavailable') {
      return createDiagnostic(
        'error',
        'Системная диагностика недоступна',
        systemStatus.errors[0] ?? 'Moonraker не вернул данные диагностики.',
        { kind: 'refresh', label: 'Повторить подключение' },
      )
    }

    const failedKlipperService = findUnhealthyService(systemStatus, 'klipper')
    if (failedKlipperService !== undefined) {
      return createDiagnostic(
        'error',
        'Сервис Klipper недоступен',
        `Сервис Klipper: ${serviceStateMessage(failedKlipperService)}.`,
        { kind: 'command', command: 'restartKlipper', label: 'Перезапустить Klipper' },
      )
    }

    const failedMoonrakerService = findUnhealthyService(systemStatus, 'moonraker')
    if (failedMoonrakerService !== undefined) {
      return createDiagnostic(
        'error',
        'Сервис Moonraker недоступен',
        `Сервис Moonraker: ${serviceStateMessage(failedMoonrakerService)}.`,
        { kind: 'command', command: 'restartMoonraker', label: 'Перезапустить Moonraker' },
      )
    }

    const failedComponent = systemStatus.software.failedComponents[0]
    if (failedComponent !== undefined) {
      return createDiagnostic(
        'error',
        'Ошибка Moonraker',
        `Компонент Moonraker не запущен: ${failedComponent}.`,
        { kind: 'command', command: 'restartMoonraker', label: 'Перезапустить Moonraker' },
      )
    }
  }

  if (runtime.transportState === 'reconnecting') {
    return createDiagnostic(
      'warning',
      'Восстановление связи',
      runtime.transportMessage || runtime.runtimeMessage,
      { kind: 'refresh', label: 'Повторить подключение' },
    )
  }

  if (systemStatus !== undefined && systemStatus.loadState !== 'loading') {
    if (systemStatus.loadState === 'partial' && systemStatus.errors.length > 0) {
      return createDiagnostic(
        'warning',
        'Часть диагностики недоступна',
        systemStatus.errors[0],
        { kind: 'openSystem', label: 'Открыть «Систему»' },
      )
    }

    const moonrakerWarning = systemStatus.software.warnings[0]
    if (moonrakerWarning !== undefined) {
      return createDiagnostic(
        'warning',
        'Предупреждение Moonraker',
        moonrakerWarning,
        { kind: 'openSystem', label: 'Открыть «Систему»' },
      )
    }

    const throttledFlag = systemStatus.host.throttledFlags[0]
    if (throttledFlag !== undefined) {
      return createDiagnostic(
        'warning',
        'Ограничение производительности',
        `Host: ${throttledFlag}.`,
        { kind: 'openSystem', label: 'Открыть «Систему»' },
      )
    }

    const unhealthyService = findUnhealthyService(systemStatus)
    if (unhealthyService !== undefined) {
      const isCameraService = unhealthyService.name.toLowerCase() === 'crowsnest'
      return createDiagnostic(
        'warning',
        isCameraService ? 'Камера недоступна' : `Сервис ${unhealthyService.name} недоступен`,
        `Сервис ${unhealthyService.name}: ${serviceStateMessage(unhealthyService)}.`,
        { kind: 'openSystem', label: 'Открыть «Систему»' },
      )
    }

    const unhealthyCanDevice = systemStatus.canDevices.find((device) => !isSystemCanDeviceHealthy(device))
    if (unhealthyCanDevice !== undefined) {
      return createDiagnostic(
        'warning',
        'Ошибка CAN',
        `CAN ${unhealthyCanDevice.label}: ${unhealthyCanDevice.busState ?? 'ошибки обмена'}.`,
        { kind: 'openSystem', label: 'Открыть «Систему»' },
      )
    }

    if (systemStatus.health === 'error' || systemStatus.health === 'warning') {
      return createDiagnostic(
        systemStatus.health,
        systemStatus.health === 'error' ? 'Ошибка системы' : 'Предупреждение системы',
        systemStatus.errors[0] ?? 'Системная диагностика требует внимания.',
        { kind: 'openSystem', label: 'Открыть «Систему»' },
      )
    }
  }

  if (runtime.connection === 'degraded') {
    return createDiagnostic(
      'warning',
      'Ограниченный режим',
      runtime.uiContractMessage || runtime.runtimeMessage,
      { kind: 'refresh', label: 'Проверить повторно' },
    )
  }

  return null
}
