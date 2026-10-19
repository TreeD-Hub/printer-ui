import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AutoPrinterController } from '../core/store/useAutoPrinter'
import { AccountPanel } from './AccountPanel'

function controller(overrides: Partial<AutoPrinterController> = {}): AutoPrinterController {
  return {
    status: {
      enabled: true,
      configured: true,
      binding_state: 'paired',
      binding_epoch: 1,
      protocol_version: 1,
      configuration_version: 1,
      execution_enabled: true,
      physical_execution_enabled: false,
      queue: [],
      queueAvailable: true,
      queue_total: 0,
      queue_truncated: false,
      local_pause: false,
      remote_pause: false,
      executionSnapshotAvailable: true,
      current_run_id: null,
      run_state: null,
      blocked_reason: null,
      last_sync_at: new Date().toISOString(),
      capabilities: { account_linking: true },
    },
    availability: 'available',
    stale: false,
    error: null,
    pending: null,
    lastAction: null,
    pairing: null,
    requestPairing: vi.fn(async () => undefined),
    requestUnlink: vi.fn(async () => undefined),
    control: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
    manualStartBlockReason: null,
    ...overrides,
  }
}

describe('AccountPanel', () => {
  it('keeps a legacy paired printer paired and shows safe fallback names', () => {
    const api = controller({ status: { ...controller().status!, capabilities: undefined } })
    render(<AccountPanel controller={api} />)

    expect(screen.getByText('Аккаунт подключён')).toBeInTheDocument()
    expect(screen.getByText('Имя принтера не задано')).toBeInTheDocument()
    expect(screen.queryByText('Получите временный код, чтобы начать привязку.')).not.toBeInTheDocument()
    expect(screen.getByText('Управление привязкой недоступно в этой версии Core.')).toBeInTheDocument()
  })

  it('confirms unlink before asking the existing controller to persist the request', () => {
    const api = controller({ status: { ...controller().status!, owner_profile: { display_name: 'Аккаунт' }, display_name: 'Принтер' } })
    render(<AccountPanel controller={api} />)

    fireEvent.click(screen.getByRole('button', { name: 'Отвязать' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('История и файлы сохранятся.')
    fireEvent.click(screen.getByRole('dialog').querySelector('.account-danger')!)
    expect(api.requestUnlink).toHaveBeenCalledTimes(1)
  })

  it('shows an explicit fresh code without generating one on render and hides QR when status is stale', () => {
    const pairing = {
      code: 'ABCD2345',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      verification_url: 'https://treed.example/autoprinter/connect#code=ABCD2345',
    }
    const unpaired = {
      ...controller().status!,
      binding_state: 'unpaired' as const,
      binding_epoch: 0,
      capabilities: { account_linking: true },
    }
    const api = controller({ status: unpaired, pairing })
    const view = render(<AccountPanel controller={api} />)

    expect(screen.getByText('ABCD-2345')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'QR-код для привязки аккаунта TreeD' })).toBeInTheDocument()
    expect(api.requestPairing).not.toHaveBeenCalled()
    view.unmount()

    render(<AccountPanel controller={controller({ status: unpaired, stale: true, pairing })} />)
    expect(screen.queryByRole('img', { name: 'QR-код для привязки аккаунта TreeD' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Получить код' })).toBeDisabled()
  })

  it('hides the code and QR when pairing expires without a controller update', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const api = controller({
      status: { ...controller().status!, binding_state: 'unpaired', capabilities: { account_linking: true } },
      pairing: {
        code: 'ABCD2345',
        expires_at: '2030-01-01T00:00:01Z',
        verification_url: 'https://treed.example/autoprinter/connect#code=ABCD2345',
      },
    })
    const view = render(<AccountPanel controller={api} />)
    try {
      expect(screen.getByRole('img', { name: 'QR-код для привязки аккаунта TreeD' })).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(1_000))
      expect(screen.queryByRole('img', { name: 'QR-код для привязки аккаунта TreeD' })).not.toBeInTheDocument()
      expect(screen.queryByText('ABCD-2345')).not.toBeInTheDocument()
    } finally {
      view.unmount()
      vi.useRealTimers()
    }
  })

  it('hides owner data and actions while a revoked account waits for unlink', () => {
    const api = controller({ status: { ...controller().status!, binding_state: 'revoked', owner_profile: null, unlink_pending: true } })
    render(<AccountPanel controller={api} />)

    expect(screen.getByText('Доступ отозван')).toBeInTheDocument()
    expect(screen.getByText(/Сброс ожидает/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Сбросить привязку' })).not.toBeInTheDocument()
  })
})
