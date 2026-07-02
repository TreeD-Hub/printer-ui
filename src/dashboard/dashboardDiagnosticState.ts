import type { PrinterCommandId } from '../core/commands'
import type {
  PrinterConnectionState,
  PrinterKlippyState,
  PrinterSource,
  PrinterTransportState,
  PrinterUiContractSnapshot,
} from '../core/transport/types'

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
  action: DashboardDiagnosticAction
}

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

export function resolveDashboardDiagnostic(
  runtime: DashboardDiagnosticRuntime,
): DashboardDiagnostic | null {
  if (runtime.source === 'mock') {
    return null
  }

  if (runtime.transportState === 'offline' || runtime.transportState === 'reconnecting') {
    const isOffline = runtime.transportState === 'offline'
    return createDiagnostic(
      isOffline ? 'error' : 'warning',
      isOffline ? 'Нет связи с Moonraker' : 'Восстановление связи',
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
      'error',
      title,
      message,
      getKlippyRecoveryAction(runtime.klippyState, message),
    )
  }

  if (runtime.connection === 'degraded' || runtime.uiContractStatus === 'incompatible') {
    return createDiagnostic(
      'warning',
      'Ограниченный режим',
      runtime.uiContractMessage || runtime.runtimeMessage,
      { kind: 'refresh', label: 'Проверить повторно' },
    )
  }

  return null
}
