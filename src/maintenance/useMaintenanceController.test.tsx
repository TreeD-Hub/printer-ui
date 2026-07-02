import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockSnapshot } from '../../mocks/runtime'
import { useMaintenanceController } from './useMaintenanceController'
import type { PrinterUsageSnapshot } from '../core/transport/types'
import { createLoadingMoonrakerSystemStatus, normalizeMoonrakerSystemStatus } from '../settings/systemStatus'

const UNAVAILABLE_USAGE: PrinterUsageSnapshot = {
  totalPrintTimeSec: null,
  totalJobTimeSec: null,
  totalJobs: null,
  totalFilamentUsedMm: null,
  longestPrintSec: null,
  updatedAt: null,
  state: 'unavailable',
  message: 'Moonraker history totals еще не загружены.',
}

describe('useMaintenanceController', () => {
  it('exposes maintenance as not runtime-backed until host data exists', () => {
    const { result } = renderHook(() => useMaintenanceController({
      usage: UNAVAILABLE_USAGE,
      printJob: createMockSnapshot().printJob,
      systemStatus: createLoadingMoonrakerSystemStatus(),
    }))

    expect(result.current.status.isRuntimeBacked).toBe(false)
    expect(result.current.status.notice).toBe('Moonraker history totals еще не загружены.')
    expect(result.current.progressPercent).toBe(0)
  })

  it('calculates runtime from Moonraker usage and active print duration', () => {
    const printJob = {
      ...createMockSnapshot().printJob,
      isActive: true,
      printDurationSec: 30 * 60,
    }
    const { result } = renderHook(() => useMaintenanceController({
      usage: {
        ...UNAVAILABLE_USAGE,
        totalPrintTimeSec: 437 * 60 * 60,
        state: 'ready',
        message: null,
      },
      printJob,
      systemStatus: createLoadingMoonrakerSystemStatus(),
    }))

    expect(result.current.status.isRuntimeBacked).toBe(true)
    expect(result.current.status.runtimeHours).toBe(437.5)
    expect(result.current.status.hoursLeft).toBe(563)
    expect(result.current.progressPercent).toBe(43.75)
  })

  it('owns maintenance checklist state outside App', () => {
    const { result } = renderHook(() => useMaintenanceController({
      usage: UNAVAILABLE_USAGE,
      printJob: createMockSnapshot().printJob,
      systemStatus: createLoadingMoonrakerSystemStatus(),
    }))
    const firstItemId = result.current.checklistItems[0].id

    act(() => {
      result.current.handleChecklistItemChange(firstItemId, true)
    })

    expect(result.current.checklistState[firstItemId]).toBe(true)

    act(() => {
      result.current.handleChecklistComplete()
    })

    expect(result.current.checklistItems.every((item) => result.current.checklistState[item.id])).toBe(true)
  })

  it('exposes the normalized live system warning without replacing usage data', () => {
    const { result } = renderHook(() => useMaintenanceController({
      usage: {
        ...UNAVAILABLE_USAGE,
        totalPrintTimeSec: 437 * 60 * 60,
        state: 'ready',
        message: null,
      },
      printJob: createMockSnapshot().printJob,
      systemStatus: normalizeMoonrakerSystemStatus({
        systemInfo: {
          system_info: {
            hostname: 'printer-v2',
            service_state: {
              moonraker: { active_state: 'failed', sub_state: 'failed' },
            },
          },
        },
      }),
    }))

    expect(result.current.status.runtimeHours).toBe(437)
    expect(result.current.status.systemLabel).toBe('Внимание')
    expect(result.current.status.systemTone).toBe('warning')
    expect(result.current.status.systemNotice).toBe('Сервис moonraker: failed / failed.')
  })
})
