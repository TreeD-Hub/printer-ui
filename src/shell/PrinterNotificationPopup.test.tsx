import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismissPrinterNotification, getPrinterNotifications, receivePrinterEvent } from '../core/store/printerNotifications'
import { PrinterNotificationPopup } from './PrinterNotificationPopup'
import { useTopStatusController } from './useTopStatusController'

afterEach(() => {
  cleanup()
  dismissPrinterNotification()
})

describe('попап уведомлений принтера', () => {
  it('использует позицию окна уведомлений и сохраняет событие после закрытия', () => {
    receivePrinterEvent({ sequence: 1, code: 'print_complete', detail: '' })
    const entry = getPrinterNotifications().popup
    const readTopPopupPosition = vi.fn(() => ({ top: 90, left: 154, arrowLeft: 180 }))
    render(<PrinterNotificationPopup enabled activeScreen="dashboard" readTopPopupPosition={readTopPopupPosition} />)

    expect(readTopPopupPosition).toHaveBeenCalledWith('notifications')
    expect(screen.getByRole('alertdialog')).toHaveStyle({ top: '90px', left: '154px' })
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(getPrinterNotifications().history).toContain(entry)
  })

  it('открытие истории закрывает попап, не удаляя запись', () => {
    receivePrinterEvent({ sequence: 2, code: 'clog_failed', detail: 'timeout' })
    const entry = getPrinterNotifications().popup
    const { result } = renderHook(() => useTopStatusController({
      screenShellRef: { current: null },
      activeScreen: 'dashboard',
      currentPrinterNotificationId: entry?.id ?? null,
      isBusy: false,
      executeCommand: async () => true,
      getCommandBlockReason: () => null,
      requiresCommandConfirmation: () => false,
      transitionPowerCommand: null,
    }))

    act(() => result.current.openTopPopup('notifications'))
    expect(result.current.activeTopPopup).toBe('notifications')
    expect(getPrinterNotifications().popup).toBeNull()
    expect(getPrinterNotifications().history).toContain(entry)
    act(() => result.current.closeTopPopup())
    expect(getPrinterNotifications().popup).toBeNull()
  })
})
