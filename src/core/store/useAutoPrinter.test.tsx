import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAutoPrinter } from './useAutoPrinter'
import { AutoPrinterClientError } from '../autoprinter/client'

const { client, createClient } = vi.hoisted(() => {
  const client = { getStatus: vi.fn(), pair: vi.fn(), cancelPairing: vi.fn(), unlinkAccount: vi.fn(), control: vi.fn() }
  return { client, createClient: vi.fn(() => client) }
})
vi.mock('#runtime', () => ({ createAutoPrinterClient: createClient }))
const fresh = { enabled: true, configured: true, binding_state: 'paired', binding_epoch: 1, protocol_version: 1, configuration_version: 1, execution_enabled: true, physical_execution_enabled: false, local_pause: false, remote_pause: false, blocked_reason: null, last_sync_at: null, queue: [], queue_total: 0, queue_truncated: false, current_run_id: null, run_state: null, capabilities: { account_linking: true } }

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
describe('useAutoPrinter', () => {
  it('restores a persistent code, avoids reissuing it and retains it when cancellation fails', async () => {
    const pairing = { code: 'ABCD2345', expires_at: null, verification_url: 'https://treed.example/autoprinter/connect#code=ABCD2345' }
    client.getStatus.mockResolvedValue({ ...fresh, binding_state: 'unpaired', pairing, capabilities: { account_linking: true, pairing_cancel: true } })
    const { result, unmount } = renderHook(() => useAutoPrinter(true))
    await waitFor(() => expect(result.current.pairing).toEqual(pairing))
    await act(async () => { await result.current.requestPairing() })
    expect(client.pair).not.toHaveBeenCalled()
    client.cancelPairing.mockRejectedValueOnce(new Error('offline'))
    await act(async () => { await result.current.cancelPairing() })
    expect(result.current.pairing).toEqual(pairing)
    expect(result.current.error).toMatch(/Не удалось отменить/)
    client.cancelPairing.mockResolvedValueOnce(undefined)
    await act(async () => { await result.current.cancelPairing() })
    expect(result.current.pairing).toBeNull()
    expect(result.current.error).toBeNull()
    unmount()
  })

  it('polls one client and refuses to replay an unconfirmed control', async () => {
    client.getStatus.mockResolvedValue(fresh)
    client.control.mockRejectedValue(new Error('network'))
    const { result, unmount } = renderHook(() => useAutoPrinter(true))
    await waitFor(() => expect(result.current.availability).toBe('available'))
    expect(createClient).toHaveBeenCalledTimes(1)
    await act(async () => { await result.current.control('pause_queue') })
    expect(client.control).toHaveBeenCalledTimes(1)
    expect(result.current.lastAction?.state).toBe('uncertain')
    unmount()
  })

  it('sends a distinct package cancellation with a fresh action id and does not replay it', async () => {
    const packageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    client.getStatus.mockResolvedValue({ ...fresh,
      active_package: { package_id: packageId, version: 1, manifest_hash: 'a'.repeat(64), state: 'active', run_count: 1, remaining_count: 2 },
      hold: null, recovery_required: false,
      capabilities: { offline_packages_v1: true },
    })
    client.control.mockResolvedValue({ type: 'cancel_package', command_id: null, state: 'executed', result: { scope: 'remaining_queued_runs', cancelled_run_ids: [] } })
    const { result, unmount } = renderHook(() => useAutoPrinter(true))
    await waitFor(() => expect(result.current.availability).toBe('available'))
    await act(async () => { await result.current.cancelRemaining() })
    expect(client.control).toHaveBeenCalledOnce()
    expect(client.control).toHaveBeenCalledWith(expect.objectContaining({ type: 'cancel_package', package_id: packageId, action_id: expect.any(String) }))
    expect(result.current.lastAction).toMatchObject({ type: 'cancel_package', state: 'executed' })
    unmount()
  })

  it('deduplicates scheduled and explicit status reads while a request is pending', async () => {
    vi.useFakeTimers()
    let resolveStatus!: (value: typeof fresh) => void
    client.getStatus.mockReturnValue(new Promise((resolve) => { resolveStatus = resolve }))
    const { result, unmount } = renderHook(() => useAutoPrinter(true))
    await act(async () => { await Promise.resolve() })
    await act(async () => { void result.current.refresh(); vi.advanceTimersByTime(10_000); await Promise.resolve() })
    expect(client.getStatus).toHaveBeenCalledTimes(1)
    await act(async () => { resolveStatus(fresh); await Promise.resolve() })
    expect(result.current.availability).toBe('available')
    unmount()
  })

  it('aborts a pre-action status read and refreshes after the receipt', async () => {
    let calls = 0
    let preActionSignal: AbortSignal | undefined
    client.getStatus.mockImplementation((signal?: AbortSignal) => {
      calls++
      if (calls === 1 || calls > 2) return Promise.resolve(fresh)
      preActionSignal = signal
      return new Promise<never>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
    })
    client.control.mockResolvedValue({ type: 'pause_queue', command_id: null, state: 'executed', result: {} })
    const { result, unmount } = renderHook(() => useAutoPrinter(true))
    await waitFor(() => expect(result.current.availability).toBe('available'))
    void result.current.refresh()
    await act(async () => { await result.current.control('pause_queue') })
    expect(preActionSignal?.aborted).toBe(true)
    expect(calls).toBe(3)
    expect(result.current.lastAction?.state).toBe('executed')
    unmount()
  })

  it('blocks start when a cached unsupported response becomes stale', async () => {
    vi.useFakeTimers()
    client.getStatus.mockRejectedValue(new AutoPrinterClientError('unsupported', 'unsupported'))
    const { result, unmount } = renderHook(() => useAutoPrinter(true))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(result.current.availability).toBe('unsupported')
    expect(result.current.manualStartBlockReason).toBeNull()
    client.getStatus.mockImplementation((signal?: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    await act(async () => { vi.advanceTimersByTime(30_000) })
    expect(result.current.stale).toBe(true)
    expect(result.current.manualStartBlockReason).not.toBeNull()
    unmount()
  })

  it('accepts an offline remote unlink intent only from fresh local status and gates starts', async () => {
    client.getStatus.mockResolvedValueOnce({ ...fresh, connection: 'offline' }).mockResolvedValueOnce({ ...fresh, connection: 'offline', binding_state: 'unpaired', unlink_pending: false })
    client.unlinkAccount.mockResolvedValue({ ...fresh, connection: 'offline', unlink_pending: true })
    const { result, unmount } = renderHook(() => useAutoPrinter(true))
    await waitFor(() => expect(result.current.availability).toBe('available'))
    await act(async () => { await result.current.requestUnlink() })
    expect(client.unlinkAccount).toHaveBeenCalledTimes(1)
    expect(result.current.status?.binding_state).toBe('unpaired')
    expect(result.current.status?.unlink_pending).toBe(true)
    expect(result.current.manualStartBlockReason).toMatch(/отвязк/i)
    unmount()
  })

  it('keeps the accepted unlink guard when a poll regresses to an older unpaired epoch', async () => {
    client.getStatus.mockResolvedValueOnce(fresh).mockResolvedValueOnce({ ...fresh, binding_state: 'unpaired', binding_epoch: 0 })
    client.unlinkAccount.mockResolvedValue({ ...fresh, unlink_pending: true })
    const { result, unmount } = renderHook(() => useAutoPrinter(true))
    await waitFor(() => expect(result.current.availability).toBe('available'))

    await act(async () => { await result.current.requestUnlink() })

    expect(result.current.status?.binding_state).toBe('paired')
    expect(result.current.status?.unlink_pending).toBe(true)
    expect(result.current.stale).toBe(true)
    expect(result.current.error).toMatch(/устаревшее состояние привязки/i)
    expect(result.current.manualStartBlockReason).not.toBeNull()
    unmount()
  })

  it('keeps the accepted unlink guard when an unpaired poll omits its binding epoch', async () => {
    const unpairedWithoutEpoch = { ...fresh, binding_state: 'unpaired' }
    Reflect.deleteProperty(unpairedWithoutEpoch, 'binding_epoch')
    client.getStatus.mockResolvedValueOnce(fresh).mockResolvedValueOnce(unpairedWithoutEpoch)
    client.unlinkAccount.mockResolvedValue({ ...fresh, unlink_pending: true })
    const { result, unmount } = renderHook(() => useAutoPrinter(true))
    await waitFor(() => expect(result.current.availability).toBe('available'))

    await act(async () => { await result.current.requestUnlink() })

    expect(result.current.status?.binding_state).toBe('paired')
    expect(result.current.status?.unlink_pending).toBe(true)
    expect(result.current.stale).toBe(true)
    expect(result.current.error).toMatch(/устаревшее состояние привязки/i)
    expect(result.current.manualStartBlockReason).not.toBeNull()
    unmount()
  })

  it('does not request unlink when account capability is unknown or local status is stale', async () => {
    client.getStatus.mockResolvedValue({ ...fresh, capabilities: undefined })
    const first = renderHook(() => useAutoPrinter(true))
    await waitFor(() => expect(first.result.current.availability).toBe('available'))
    await act(async () => { await first.result.current.requestUnlink() })
    expect(client.unlinkAccount).not.toHaveBeenCalled()
    first.unmount()

    client.getStatus.mockRejectedValue(new Error('offline'))
    const second = renderHook(() => useAutoPrinter(true))
    await waitFor(() => expect(second.result.current.stale).toBe(true))
    await act(async () => { await second.result.current.requestUnlink() })
    expect(client.unlinkAccount).not.toHaveBeenCalled()
    second.unmount()
  })

  it('keeps local pause and cancel available while blocking queue controls during unlink', async () => {
    client.getStatus.mockResolvedValue({ ...fresh, current_run_id: 'run-1', run_state: 'printing', unlink_pending: true })
    client.control
      .mockResolvedValueOnce({ type: 'pause_current_print', command_id: null, state: 'uncertain', result: {} })
      .mockResolvedValueOnce({ type: 'cancel_current_print', command_id: null, state: 'uncertain', result: {} })
    const { result, unmount } = renderHook(() => useAutoPrinter(true))
    await waitFor(() => expect(result.current.availability).toBe('available'))

    await act(async () => { await result.current.control('pause_current_print') })
    expect(client.control).toHaveBeenCalledWith(expect.objectContaining({ type: 'pause_current_print' }))
    await act(async () => { await result.current.control('cancel_current_print') })
    expect(client.control).toHaveBeenCalledWith(expect.objectContaining({ type: 'cancel_current_print' }))
    client.control.mockClear()

    await act(async () => { await result.current.control('pause_queue') })
    expect(client.control).not.toHaveBeenCalled()
    unmount()
  })

  it('rejects an unpaired unlink receipt unless it advances the current binding epoch', async () => {
    client.getStatus.mockResolvedValue(fresh)
    client.unlinkAccount.mockResolvedValue({ ...fresh, binding_state: 'unpaired', unlink_pending: false })
    const { result, unmount } = renderHook(() => useAutoPrinter(true))
    await waitFor(() => expect(result.current.availability).toBe('available'))

    await act(async () => { await result.current.requestUnlink() })

    expect(result.current.status?.binding_state).toBe('paired')
    expect(result.current.status?.unlink_pending).not.toBe(true)
    expect(result.current.error).toMatch(/другой привязки/i)
    unmount()
  })
})
