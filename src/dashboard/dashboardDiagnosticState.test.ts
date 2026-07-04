import { describe, expect, it } from 'vitest'
import { createLoadingMoonrakerSystemStatus, type MoonrakerSystemStatus } from '../settings/systemStatus'
import {
  resolveDashboardDiagnostic,
  type DashboardDiagnosticRuntime,
} from './dashboardDiagnosticState'

function createRuntime(overrides: Partial<DashboardDiagnosticRuntime> = {}): DashboardDiagnosticRuntime {
  return {
    source: 'live',
    connection: 'online',
    transportState: 'online',
    transportMessage: null,
    klippyState: 'ready',
    klippyMessage: '',
    runtimeMessage: '',
    uiContractStatus: 'compatible',
    uiContractMessage: null,
    ...overrides,
  }
}

function createSystemStatus(overrides: Partial<MoonrakerSystemStatus> = {}): MoonrakerSystemStatus {
  return {
    ...createLoadingMoonrakerSystemStatus(),
    loadState: 'ready',
    health: 'ok',
    updatedAt: '2026-07-02T12:00:00.000Z',
    ...overrides,
  }
}

describe('resolveDashboardDiagnostic', () => {
  it('classifies a Klipper shutdown as fatal and keeps firmware recovery', () => {
    expect(resolveDashboardDiagnostic(createRuntime({
      connection: 'shutdown',
      klippyState: 'shutdown',
      klippyMessage: 'Run FIRMWARE_RESTART after fixing the issue',
    }))).toMatchObject({
      severity: 'fatal',
      title: 'Klipper остановлен',
      action: { kind: 'command', command: 'firmwareRestart' },
    })
  })

  it('keeps a Klipper fatal state above reconnecting transport', () => {
    expect(resolveDashboardDiagnostic(createRuntime({
      connection: 'reconnecting',
      transportState: 'reconnecting',
      klippyState: 'shutdown',
      klippyMessage: 'MCU shutdown',
    }))).toMatchObject({
      severity: 'fatal',
      title: 'Klipper остановлен',
    })
  })

  it('keeps an offline transport above a system warning', () => {
    const systemStatus = createSystemStatus({
      health: 'warning',
      software: {
        ...createSystemStatus().software,
        warnings: ['Optional component is unavailable'],
      },
    })

    expect(resolveDashboardDiagnostic({
      ...createRuntime({
        connection: 'offline',
        transportState: 'offline',
        transportMessage: 'WebSocket closed',
      }),
      systemStatus,
    })).toMatchObject({
      severity: 'fatal',
      title: 'Нет связи с Moonraker',
      message: 'WebSocket closed',
      action: { kind: 'refresh' },
    })
  })

  it('maps a failed Moonraker component to restartMoonraker', () => {
    const base = createSystemStatus()
    const systemStatus = createSystemStatus({
      health: 'error',
      software: {
        ...base.software,
        failedComponents: ['database'],
      },
    })

    expect(resolveDashboardDiagnostic({
      ...createRuntime(),
      systemStatus,
    })).toMatchObject({
      severity: 'error',
      title: 'Ошибка Moonraker',
      message: 'Компонент Moonraker не запущен: database.',
      action: { kind: 'command', command: 'restartMoonraker' },
    })
  })

  it('keeps a system error above reconnecting transport', () => {
    const base = createSystemStatus()
    const systemStatus = createSystemStatus({
      health: 'error',
      software: {
        ...base.software,
        failedComponents: ['database'],
      },
    })

    expect(resolveDashboardDiagnostic({
      ...createRuntime({
        connection: 'reconnecting',
        transportState: 'reconnecting',
      }),
      systemStatus,
    })).toMatchObject({
      severity: 'error',
      title: 'Ошибка Moonraker',
    })
  })

  it('reports a failed crowsnest service as a camera warning', () => {
    const systemStatus = createSystemStatus({
      health: 'warning',
      services: [{
        name: 'crowsnest',
        activeState: 'failed',
        subState: 'failed',
        healthy: false,
      }],
    })

    expect(resolveDashboardDiagnostic({
      ...createRuntime(),
      systemStatus,
    })).toMatchObject({
      severity: 'warning',
      title: 'Камера недоступна',
      action: { kind: 'openSystem' },
    })
  })

  it('skips inactive KlipperScreen when selecting the dashboard service warning', () => {
    const systemStatus = createSystemStatus({
      health: 'warning',
      services: [
        {
          name: 'KlipperScreen',
          activeState: 'inactive',
          subState: 'dead',
          healthy: false,
        },
        {
          name: 'crowsnest',
          activeState: 'failed',
          subState: 'failed',
          healthy: false,
        },
      ],
    })

    expect(resolveDashboardDiagnostic({
      ...createRuntime(),
      systemStatus,
    })).toMatchObject({
      severity: 'warning',
      title: 'Камера недоступна',
      action: { kind: 'openSystem' },
    })
  })

  it('reports CAN errors as a warning with system details action', () => {
    const systemStatus = createSystemStatus({
      health: 'warning',
      canDevices: [{
        objectName: 'canbus_stats EBBCan',
        label: 'EBBCan',
        busState: 'warn',
        rxErrors: 2,
        txErrors: 0,
        retries: 3,
      }],
    })

    expect(resolveDashboardDiagnostic({
      ...createRuntime(),
      systemStatus,
    })).toMatchObject({
      severity: 'warning',
      title: 'Ошибка CAN',
      message: 'CAN EBBCan: warn.',
      action: { kind: 'openSystem' },
    })
  })

  it('reports a partial diagnostic request without hiding it behind degraded mode', () => {
    const systemStatus = createSystemStatus({
      loadState: 'partial',
      health: 'warning',
      errors: ['Процессы: HTTP 503'],
    })

    expect(resolveDashboardDiagnostic({
      ...createRuntime({ connection: 'degraded' }),
      systemStatus,
    })).toMatchObject({
      severity: 'warning',
      title: 'Часть диагностики недоступна',
      message: 'Процессы: HTTP 503',
      action: { kind: 'openSystem' },
    })
  })
})
