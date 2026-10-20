import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
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
      active_package: null,
      hold: null,
      recovery_required: false,
    },
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
    manualStartBlockReason: null,
    ...overrides,
  }
}

describe('AccountPanel', () => {
  it('requests a code once on opening, without retrying after errors or cancellation', () => {
    const api = controller({
      status: { ...controller().status!, binding_state: 'unpaired', capabilities: { account_linking: true, pairing_cancel: true } },
    })
    const panel = (value: AutoPrinterController) => <StrictMode><AccountPanel controller={value} /></StrictMode>
    const view = render(panel({ ...api, availability: 'loading', stale: true }))
    expect(api.requestPairing).not.toHaveBeenCalled()
    view.rerender(panel(api))
    expect(api.requestPairing).toHaveBeenCalledTimes(1)
    view.rerender(panel({ ...api, error: 'Не удалось запросить код привязки.' }))
    view.rerender(panel(api))
    expect(api.requestPairing).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }))
    expect(api.requestPairing).toHaveBeenCalledTimes(2)
    view.rerender(panel({ ...api, pairing: { code: 'ABCD2345', expires_at: null, verification_url: 'https://treed.example/autoprinter/connect#code=ABCD2345' } }))
    expect(screen.getByRole('img', { name: 'QR-код для привязки аккаунта TreeD' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Отменить привязку' }))
    expect(api.cancelPairing).toHaveBeenCalledTimes(1)
    view.rerender(panel(api))
    expect(api.requestPairing).toHaveBeenCalledTimes(2)
  })

  it.each([
    { enabled: false },
    { configured: false },
    { unlink_pending: true },
    { connection: 'offline' },
    { capabilities: { account_linking: false } },
  ])('does not request a code when pairing is unavailable: %j', (status) => {
    const api = controller({ status: { ...controller().status!, binding_state: 'unpaired', ...status } })
    render(<AccountPanel controller={api} />)
    expect(api.requestPairing).not.toHaveBeenCalled()
  })

  it('keeps a persistent code without a deadline or rotation and offers explicit cancellation', () => {
    vi.useFakeTimers()
    const api = controller({
      status: { ...controller().status!, binding_state: 'unpaired', capabilities: { account_linking: true, pairing_cancel: true } },
      pairing: { code: 'ABCD2345', expires_at: null, verification_url: 'https://treed.example/autoprinter/connect#code=ABCD2345' },
    })
    const view = render(<AccountPanel controller={api} />)
    try {
      act(() => vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1_000))
      expect(screen.getByText('ABCD2345')).toBeInTheDocument()
      expect(screen.queryByText(/Код действует до/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Обновить код' })).not.toBeInTheDocument()
      expect(api.requestPairing).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Отменить привязку' }))
      expect(api.cancelPairing).toHaveBeenCalledTimes(1)
    } finally { view.unmount(); vi.useRealTimers() }
  })

  it('shows the website profile, falls back on image failure and hides it after revocation', () => {
    const profile = { display_name: 'Анна Волкова', avatar_url: 'https://treed.example/avatar.jpg' }
    const api = controller({ status: { ...controller().status!, owner_profile: profile, display_name: 'TreeD V2' } })
    const view = render(<AccountPanel controller={api} />)
    expect(screen.getByText(profile.display_name)).toBeInTheDocument()
    const avatar = screen.getByRole('img', { name: 'Аватар Анна Волкова' })
    expect(avatar).toHaveAttribute('src', profile.avatar_url)
    fireEvent.error(avatar)
    expect(screen.getByText('АВ')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    view.rerender(<AccountPanel controller={{ ...api, status: { ...api.status!, binding_state: 'revoked' } }} />)
    expect(screen.queryByText(profile.display_name)).not.toBeInTheDocument()
    expect(screen.queryByText('АВ')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('keeps a legacy paired printer paired and shows safe fallback names', () => {
    const api = controller({ status: { ...controller().status!, capabilities: undefined } })
    render(<AccountPanel controller={api} />)

    expect(screen.getByText('Аккаунт подключён')).toBeInTheDocument()
    expect(screen.getByText('Имя принтера не задано')).toBeInTheDocument()
    expect(screen.queryByText('Получите код, чтобы начать привязку.')).not.toBeInTheDocument()
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

    expect(screen.getByText('ABCD2345')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'QR-код для привязки аккаунта TreeD' })).toBeInTheDocument()
    expect(api.requestPairing).not.toHaveBeenCalled()
    view.unmount()

    render(<AccountPanel controller={controller({ status: unpaired, stale: true, pairing })} />)
    expect(screen.queryByRole('img', { name: 'QR-код для привязки аккаунта TreeD' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Получить код' })).not.toBeInTheDocument()
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
      expect(screen.queryByText('ABCD2345')).not.toBeInTheDocument()
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
