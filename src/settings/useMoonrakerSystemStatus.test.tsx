import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLoadingMoonrakerSystemStatus, type MoonrakerSystemStatus } from './systemStatus'
import { useMoonrakerSystemStatus } from './useMoonrakerSystemStatus'

const systemStatusMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}))

vi.mock('#runtime', () => ({
  runtimeMode: 'live',
}))

vi.mock('./systemStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./systemStatus')>()
  return {
    ...actual,
    fetchMoonrakerSystemStatus: systemStatusMocks.fetch,
  }
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

describe('useMoonrakerSystemStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    systemStatusMocks.fetch.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('skips polling ticks while the previous status request is still running', async () => {
    const firstRequest = createDeferred<MoonrakerSystemStatus>()
    systemStatusMocks.fetch
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValue(createLoadingMoonrakerSystemStatus())

    const hook = renderHook(() => useMoonrakerSystemStatus({ pollIntervalMs: 1_000 }))

    expect(systemStatusMocks.fetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(systemStatusMocks.fetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      firstRequest.resolve(createLoadingMoonrakerSystemStatus())
      await firstRequest.promise
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999)
    })
    expect(systemStatusMocks.fetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(systemStatusMocks.fetch).toHaveBeenCalledTimes(2)

    hook.unmount()
  })
})
