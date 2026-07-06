import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSystemCommandRecovery } from './useSystemCommandRecovery'

describe('useSystemCommandRecovery', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs a bounded refresh loop and blocks only another system transition', async () => {
    vi.useFakeTimers()
    const executeCommand = vi.fn().mockResolvedValue(true)
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useSystemCommandRecovery({ executeCommand, refresh }))

    await act(async () => {
      await result.current.executeCommand({ command: 'firmwareRestart' })
    })

    expect(result.current.transitionCommand).toBe('firmwareRestart')
    await act(async () => {
      vi.advanceTimersByTime(0)
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    await expect(result.current.executeCommand({ command: 'restartMoonraker' })).resolves.toBe(false)
    await expect(result.current.executeCommand({ command: 'emergencyStop' })).resolves.toBe(true)
    expect(executeCommand).toHaveBeenCalledTimes(2)

    await act(async () => {
      vi.advanceTimersByTime(12_000)
    })
    expect(refresh).toHaveBeenCalledTimes(5)
    expect(result.current.transitionCommand).toBeNull()
  })

  it('does not poll the stale snapshot after UI restart or host power commands', async () => {
    vi.useFakeTimers()
    const executeCommand = vi.fn().mockResolvedValue(true)
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useSystemCommandRecovery({ executeCommand, refresh }))

    await act(async () => {
      await result.current.executeCommand({ command: 'restartUi' })
      vi.advanceTimersByTime(12_000)
    })

    expect(refresh).not.toHaveBeenCalled()
    expect(result.current.transitionCommand).toBeNull()
  })
})
