import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAutoPrinter } from './useAutoPrinter'
import { AutoPrinterClientError } from '../autoprinter/client'

const { client, createClient } = vi.hoisted(() => {
  const client = { getStatus: vi.fn(), pair: vi.fn(), control: vi.fn() }
  return { client, createClient: vi.fn(() => client) }
})
vi.mock('#runtime', () => ({ createAutoPrinterClient: createClient }))
const fresh = { enabled: true, configured: true, binding_state: 'paired', binding_epoch: 1, protocol_version: 1, configuration_version: 1, execution_enabled: true, physical_execution_enabled: false, local_pause: false, remote_pause: false, blocked_reason: null, last_sync_at: null, queue: [], queue_total: 0, queue_truncated: false, current_run_id: null, run_state: null }

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
describe('useAutoPrinter', () => {
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
})
