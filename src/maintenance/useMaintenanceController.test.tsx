import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useMaintenanceController } from './useMaintenanceController'

describe('useMaintenanceController', () => {
  it('exposes maintenance as not runtime-backed until host data exists', () => {
    const { result } = renderHook(() => useMaintenanceController())

    expect(result.current.status.isRuntimeBacked).toBe(false)
    expect(result.current.status.notice).toBe('Данные ТО пока не подключены к runtime.')
    expect(result.current.progressPercent).toBe(0)
  })

  it('owns maintenance checklist state outside App', () => {
    const { result } = renderHook(() => useMaintenanceController())
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
