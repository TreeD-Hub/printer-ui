import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AutoPrinterStatus } from '@treed/printer-logic/autoprinter'
import type { AutoPrinterController } from '../core/store/useAutoPrinter'
import { AutoPrinterPanel } from './AutoPrinterPanel'

const status: AutoPrinterStatus = {
  enabled: true,
  configured: true,
  binding_state: 'paired',
  binding_epoch: 1,
  protocol_version: 1,
  configuration_version: 1,
  execution_enabled: true,
  physical_execution_enabled: true,
  queue: [
    { run_id: '11111111-1111-4111-8111-111111111111', position: 1, state: 'printing', series_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', copies_per_run: 1 },
    { run_id: '22222222-2222-4222-8222-222222222222', position: 2, state: 'queued', series_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', copies_per_run: 2 },
  ],
  queueAvailable: true,
  queue_total: 2,
  queue_truncated: false,
  executionSnapshotAvailable: true,
  local_pause: false,
  remote_pause: false,
  current_run_id: '11111111-1111-4111-8111-111111111111',
  run_state: 'printing',
  blocked_reason: null,
  last_sync_at: new Date().toISOString(),
  capabilities: { queue: true, pairing: false, bed_check: false, bed_check_diagnostic: true },
  connection: 'online',
  active_package: null,
  hold: null,
  recovery_required: false,
}

function controller(overrides: Partial<AutoPrinterController> = {}): AutoPrinterController {
  return {
    status,
    availability: 'available',
    stale: false,
    error: null,
    pending: null,
    lastAction: null,
    pairing: null,
    requestPairing: vi.fn(async () => undefined),
    cancelPairing: vi.fn(async () => undefined),
    requestUnlink: vi.fn(async () => undefined),
    control: vi.fn(async () => undefined),
    cancelRemaining: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
    manualStartBlockReason: 'Управление очередью AutoPrinter активно',
    ...overrides,
  }
}

describe('AutoPrinterPanel', () => {
  it('shows the actual current stage and sends queue pause as its own action', () => {
    const api = controller()
    render(<AutoPrinterPanel controller={api} moonrakerConnected onOpenDashboard={vi.fn()} />)

    expect(screen.getByText('Печать')).toBeInTheDocument()
    expect(screen.getByText(/Запуск 11111111-/)).toBeInTheDocument()
    expect(screen.queryByText(/владелец/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Приостановить очередь' }))
    expect(api.control).toHaveBeenCalledWith('pause_queue')
  })

  it('does not render an empty queue or enable actions for an unsupported core', () => {
    render(<AutoPrinterPanel controller={controller({ status: null, availability: 'unsupported' })} moonrakerConnected onOpenDashboard={vi.fn()} />)

    expect(screen.getByText('Эта версия системы не поддерживает AutoPrinter.')).toBeInTheDocument()
    expect(screen.queryByText('В очереди нет запусков.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Приостановить очередь' })).toBeDisabled()
  })

  it('keeps cancelling remaining package runs and resuming a held series as separate local actions', () => {
    const api = controller({ status: {
      ...status,
      active_package: { package_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: 4, manifest_hash: 'a'.repeat(64), state: 'active', run_count: 2, remaining_count: 3 },
      hold: { reason: 'ai_detection', created_at: new Date().toISOString(), context: {} },
      recovery_required: true,
      capabilities: { ...status.capabilities, offline_packages_v1: true },
    } })
    render(<AutoPrinterPanel controller={api} moonrakerConnected onOpenDashboard={vi.fn()} />)

    expect(screen.getByText(/Требуется восстановление очереди/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Отменить оставшиеся задания' }))
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить серию' }))
    expect(api.cancelRemaining).toHaveBeenCalledOnce()
    expect(api.control).toHaveBeenCalledWith('resume_queue')
  })

  it('requires a live Moonraker connection and remaining runs before package cancellation', () => {
    const api = controller({ status: {
      ...status,
      active_package: { package_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: 4, manifest_hash: 'a'.repeat(64), state: 'active', run_count: 2, remaining_count: 3 },
      hold: null, recovery_required: false,
      capabilities: { ...status.capabilities, offline_packages_v1: true },
    } })
    const { rerender } = render(<AutoPrinterPanel controller={api} moonrakerConnected={false} onOpenDashboard={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Отменить оставшиеся задания' })).toBeDisabled()
    rerender(<AutoPrinterPanel controller={controller({ status: {
      ...status,
      active_package: { package_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: 4, manifest_hash: 'a'.repeat(64), state: 'active', run_count: 5, remaining_count: 0 },
      hold: null, recovery_required: false,
      capabilities: { ...status.capabilities, offline_packages_v1: true },
    } })} moonrakerConnected onOpenDashboard={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Отменить оставшиеся задания' })).toBeDisabled()
  })

  it('stops showing a qualified empty bed when its check expires without a status update', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const api = controller({ status: {
      ...status,
      capabilities: { ...status.capabilities, bed_check: true },
      bed_check: { live_qualified: true, last_check: { state: 'empty', reason: null, checked_at: '2030-01-01T00:00:00Z' } },
    } })
    const view = render(<AutoPrinterPanel controller={api} moonrakerConnected onOpenDashboard={vi.fn()} />)
    try {
      expect(screen.getByText('Стол свободен · квалифицировано')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(31_000))
      expect(screen.queryByText('Стол свободен · квалифицировано')).not.toBeInTheDocument()
      expect(screen.getByText('Состояние стола неизвестно')).toBeInTheDocument()
    } finally {
      view.unmount()
      vi.useRealTimers()
    }
  })

  it('calls the bed empty only with a qualified, fresh empty check', () => {
    const freshCheck = new Date().toISOString()
    const qualifiedEmpty: NonNullable<AutoPrinterStatus['bed_check']> = {
      live_qualified: true,
      last_check: { state: 'empty', reason: null, checked_at: freshCheck },
    }
    const cases: Array<[string, AutoPrinterStatus['bed_check'], boolean?]> = [
      ['occupied', { live_qualified: true, last_check: { state: 'occupied', reason: null, checked_at: freshCheck } }],
      ['unknown', { live_qualified: true, last_check: { state: 'unknown', reason: 'sensor_error', checked_at: freshCheck } }],
      ['unavailable', { live_qualified: true, last_check: { state: 'unavailable', reason: 'not_checked', checked_at: null } }],
      ['missing check', { live_qualified: true }],
      ['expired check', { live_qualified: true, last_check: { state: 'empty', reason: null, checked_at: new Date(Date.now() - 31_000).toISOString() } }],
      ['future check', { live_qualified: true, last_check: { state: 'empty', reason: null, checked_at: new Date(Date.now() + 1_000).toISOString() } }],
      ['unqualified empty', { live_qualified: false, last_check: { state: 'empty', reason: null, checked_at: freshCheck } }],
    ]

    const validRender = render(<AutoPrinterPanel controller={controller({ status: { ...status, capabilities: { ...status.capabilities, bed_check: true }, bed_check: qualifiedEmpty } })} moonrakerConnected onOpenDashboard={vi.fn()} />)
    expect(screen.getByText('Стол свободен · квалифицировано')).toBeInTheDocument()
    validRender.unmount()

    for (const [name, bedCheck] of cases) {
      const api = controller({ status: { ...status, capabilities: { ...status.capabilities, bed_check: true }, bed_check: bedCheck } })
      const { unmount } = render(<AutoPrinterPanel controller={api} moonrakerConnected onOpenDashboard={vi.fn()} />)
      expect(screen.queryByText('Стол свободен · квалифицировано'), name).not.toBeInTheDocument()
      unmount()
    }

    const staleApi = controller({ stale: true, status: { ...status, capabilities: { ...status.capabilities, bed_check: true }, bed_check: qualifiedEmpty } })
    render(<AutoPrinterPanel controller={staleApi} moonrakerConnected onOpenDashboard={vi.fn()} />)
    expect(screen.queryByText('Стол свободен · квалифицировано')).not.toBeInTheDocument()
  })
})
