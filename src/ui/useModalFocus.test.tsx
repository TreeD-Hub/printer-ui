import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { useModalFocus } from './useModalFocus'

afterEach(cleanup)

function TestDialog({ open, nested = false, onClose }: { open: boolean; nested?: boolean; onClose?: () => void }) {
  const ref = useModalFocus<HTMLDivElement>(open, onClose)
  return open ? (
    <div ref={ref} role="dialog" aria-label={nested ? 'Вложенное окно' : 'Основное окно'}>
      <button aria-label={nested ? 'Закрыть вложенное окно' : 'Закрыть окно'}>Закрыть</button>
      <button disabled>Недоступно</button>
      <button hidden>Скрыто</button>
      <button>Подтвердить</button>
    </div>
  ) : null
}

describe('useModalFocus', () => {
  it('закрывает окно по Escape без вызова подтверждающего действия', () => {
    const onClose = vi.fn()
    render(<TestDialog open onClose={onClose} />)
    fireEvent.keyDown(screen.getByLabelText('Закрыть окно'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
  it('выбирает безопасную кнопку закрытия и возвращает фокус инициатору', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const { rerender } = render(<TestDialog open />)
    expect(screen.getByLabelText('Закрыть окно')).toHaveFocus()
    rerender(<TestDialog open={false} />)
    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  it('замыкает Tab и Shift+Tab, пропуская скрытые и недоступные элементы', () => {
    render(<TestDialog open />)
    const close = screen.getByLabelText('Закрыть окно')
    const confirm = screen.getByRole('button', { name: 'Подтвердить' })
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(confirm).toHaveFocus()
    fireEvent.keyDown(confirm, { key: 'Tab' })
    expect(close).toHaveFocus()
  })

  it('защищает фокус верхнего окна и восстанавливает нижнее после закрытия', () => {
    function Stack({ nestedOpen }: { nestedOpen: boolean }) {
      return <><TestDialog open /><TestDialog open={nestedOpen} nested /></>
    }
    const { rerender } = render(<Stack nestedOpen={false} />)
    const parentClose = screen.getByLabelText('Закрыть окно')
    rerender(<Stack nestedOpen />)
    const childClose = screen.getByLabelText('Закрыть вложенное окно')
    parentClose.focus()
    expect(childClose).toHaveFocus()
    rerender(<Stack nestedOpen={false} />)
    expect(parentClose).toHaveFocus()
  })
})
