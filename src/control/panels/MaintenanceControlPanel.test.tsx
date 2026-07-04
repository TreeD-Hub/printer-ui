import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MaintenanceControlPanel } from './MaintenanceControlPanel'
import type { MaintenanceStatus } from '../types'

function createStatus(overrides: Partial<MaintenanceStatus> = {}): MaintenanceStatus {
  return {
    runtimeHours: 437,
    cycleRuntimeHours: 126,
    hoursLeft: 874,
    intervalHours: 1000,
    isRuntimeBacked: true,
    isCycleBacked: true,
    cycleState: 'ready',
    notice: '',
    cycleNotice: '',
    lastMaintenanceAt: '2026-06-01T10:00:00.000Z',
    systemLabel: 'В норме',
    systemTone: 'ok',
    systemNotice: 'Доступные runtime-данные без предупреждений.',
    ...overrides,
  }
}

function renderPanel(
  status: MaintenanceStatus,
  onMaintenanceComplete = vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
) {
  return render(
    <MaintenanceControlPanel
      status={status}
      progressTicks={[0, 1, 2]}
      progressPercent={12.6}
      isCompletingMaintenance={false}
      completionError=""
      completionBlockReason={null}
      onMaintenanceComplete={onMaintenanceComplete}
    />,
  )
}

describe('MaintenanceControlPanel', () => {
  it('separates total runtime from the current maintenance cycle', () => {
    renderPanel(createStatus())

    expect(screen.getByText('437 ч')).toBeInTheDocument()
    expect(screen.getByText('126 ч')).toBeInTheDocument()
    expect(screen.getByText('874 ч')).toBeInTheDocument()
    expect(screen.getByText('13%')).toBeInTheDocument()
  })

  it('does not present a maintenance cycle as valid when persistence is unavailable', () => {
    renderPanel(createStatus({
      cycleRuntimeHours: 0,
      hoursLeft: 0,
      isCycleBacked: false,
      cycleState: 'unavailable',
      cycleNotice: 'История технического обслуживания недоступна.',
    }))

    expect(screen.getByText('437 ч')).toBeInTheDocument()
    expect(screen.getAllByText('История технического обслуживания недоступна.').length).toBeGreaterThan(0)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('requires confirmation before resetting the maintenance cycle', async () => {
    const onMaintenanceComplete = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
    renderPanel(createStatus(), onMaintenanceComplete)

    fireEvent.click(screen.getByTestId('maintenance-complete-button'))
    expect(screen.getByTestId('maintenance-complete-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('maintenance-complete-confirm'))

    await waitFor(() => {
      expect(onMaintenanceComplete).toHaveBeenCalledTimes(1)
      expect(screen.queryByTestId('maintenance-complete-dialog')).not.toBeInTheDocument()
    })
  })
})
