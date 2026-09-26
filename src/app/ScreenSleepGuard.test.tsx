import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ScreenSleepGuard } from './ScreenSleepGuard'

describe('ScreenSleepGuard', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('consumes the wake gesture before exposing printer controls', () => {
    vi.useFakeTimers()
    const onAction = vi.fn()

    render(
      <>
        <button type="button" onClick={onAction}>Опасное действие</button>
        <ScreenSleepGuard timeoutMs={1000} />
      </>,
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    const guard = screen.getByTestId('screen-sleep-guard')
    fireEvent.pointerDown(guard)
    fireEvent.pointerUp(guard)
    fireEvent.click(guard)

    expect(onAction).not.toHaveBeenCalled()
    expect(guard).toHaveClass('is-waking')

    act(() => {
      vi.advanceTimersByTime(250)
    })

    expect(screen.queryByTestId('screen-sleep-guard')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Опасное действие' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('restarts the sleep timer after user activity', () => {
    vi.useFakeTimers()
    render(<ScreenSleepGuard timeoutMs={1000} />)

    act(() => {
      vi.advanceTimersByTime(900)
    })
    fireEvent.pointerDown(window)
    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(screen.queryByTestId('screen-sleep-guard')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(screen.getByTestId('screen-sleep-guard')).toBeInTheDocument()
  })
})
