import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockSnapshot } from '../../mocks/runtime'
import { useMaintenanceController } from './useMaintenanceController'
import type { PrinterUsageSnapshot } from '../core/transport/types'

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
})
