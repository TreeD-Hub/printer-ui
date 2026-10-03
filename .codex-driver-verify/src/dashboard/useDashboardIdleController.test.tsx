import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChangeEvent } from 'react'
import { useDashboardIdleController } from './useDashboardIdleController'

function changeEvent(value: string): ChangeEvent<HTMLTextAreaElement> {
  return {
    target: {
      value,
    },
  } as ChangeEvent<HTMLTextAreaElement>
}

describe('useDashboardIdleController', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('routes idle widgets to their control groups', () => {
    const onControlGroupOpen = vi.fn()
    const { result } = renderHook(() => useDashboardIdleController({
      isKeyboardOpen: false,
      onKeyboardOpen: () => undefined,
      onKeyboardClose: () => undefined,
      onControlGroupOpen,
    }))

    act(() => {
      result.current.openIdleWidgetTarget('temperature')
      result.current.openIdleWidgetTarget('maintenance')
    })

    expect(onControlGroupOpen).toHaveBeenNthCalledWith(1, 'heating')
    expect(onControlGroupOpen).toHaveBeenNthCalledWith(2, 'maintenance')
  })

  it('updates idle notes through the virtual keyboard', () => {
    const onKeyboardOpen = vi.fn()
    const onKeyboardClose = vi.fn()
    const { result, rerender } = renderHook(
      ({ isKeyboardOpen }: { isKeyboardOpen: boolean }) => useDashboardIdleController({
        isKeyboardOpen,
        onKeyboardOpen,
        onKeyboardClose,
        onControlGroupOpen: () => undefined,
      }),
      {
        initialProps: {
          isKeyboardOpen: false,
        },
      },
    )

    act(() => {
      result.current.handleIdleNotesKeyboardOpen()
    })
    expect(onKeyboardOpen).toHaveBeenCalledTimes(1)

    rerender({ isKeyboardOpen: true })
    act(() => {
      result.current.handleIdleNotesChange(changeEvent('Layer check'))
    })
    expect(result.current.idleNotesText).toBe('Layer check')

    act(() => {
      result.current.handleIdleNotesVirtualKey('space')
    })
    expect(result.current.idleNotesText).toBe('Layer check ')

    act(() => {
      result.current.handleIdleNotesVirtualKey('backspace')
    })
    expect(result.current.idleNotesText).toBe('Layer check')

    act(() => {
      result.current.handleIdleNotesVirtualKey('close')
    })
    expect(onKeyboardClose).toHaveBeenCalledTimes(1)
  })

  it('restores edited idle notes after remount', () => {
    const { result, unmount } = renderHook(() => useDashboardIdleController({
      isKeyboardOpen: false,
      onKeyboardOpen: () => undefined,
      onKeyboardClose: () => undefined,
      onControlGroupOpen: () => undefined,
    }))

    act(() => {
      result.current.handleIdleNotesChange(changeEvent('First layer: OK'))
    })
    unmount()

    const { result: nextResult } = renderHook(() => useDashboardIdleController({
      isKeyboardOpen: false,
      onKeyboardOpen: () => undefined,
      onKeyboardClose: () => undefined,
      onControlGroupOpen: () => undefined,
    }))

    expect(nextResult.current.idleNotesText).toBe('First layer: OK')
  })
})
