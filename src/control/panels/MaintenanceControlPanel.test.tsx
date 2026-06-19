import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MaintenanceControlPanel } from './MaintenanceControlPanel'

const CHECKLIST_ITEMS = [
  { id: 'belts', label: 'Проверка ремней' },
  { id: 'fans', label: 'Проверка обдува' },
] as const

describe('MaintenanceControlPanel', () => {
  it('marks maintenance values as unavailable when runtime data is not connected', () => {
    render(
      <MaintenanceControlPanel
        status={{
          runtimeHours: 874,
          hoursLeft: 126,
          intervalHours: 1000,
          isRuntimeBacked: false,
          notice: 'Данные ТО пока не подключены к runtime.',
        }}
        historyItems={[]}
        checklistItems={CHECKLIST_ITEMS}
        progressTicks={[0, 1, 2]}
        progressPercent={0}
        checklistState={{}}
        isChecklistComplete={false}
        onChecklistItemChange={vi.fn()}
        onChecklistComplete={vi.fn()}
      />,
    )

    expect(screen.getByText('Данные ТО пока не подключены к runtime.')).toBeInTheDocument()
    expect(screen.queryByText('874 ч')).not.toBeInTheDocument()
    expect(screen.queryByText('126 ч')).not.toBeInTheDocument()
  })

  it('keeps the checklist interactive', () => {
    const onChecklistItemChange = vi.fn()

    render(
      <MaintenanceControlPanel
        status={{
          runtimeHours: 0,
          hoursLeft: 0,
          intervalHours: 1000,
          isRuntimeBacked: false,
          notice: 'Данные ТО пока не подключены к runtime.',
        }}
        historyItems={[]}
        checklistItems={CHECKLIST_ITEMS}
        progressTicks={[0, 1, 2]}
        progressPercent={0}
        checklistState={{}}
        isChecklistComplete={false}
        onChecklistItemChange={onChecklistItemChange}
        onChecklistComplete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getAllByRole('checkbox')[0])

    expect(onChecklistItemChange).toHaveBeenCalledWith('belts', true)
  })
})
