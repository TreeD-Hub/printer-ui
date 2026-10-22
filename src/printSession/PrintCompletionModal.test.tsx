import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PrintCompletionModal, type PrintCompletionModalProps } from './PrintCompletionModal'

function props(overrides: Partial<PrintCompletionModalProps> = {}): PrintCompletionModalProps {
  return {
    filename: 'parts/bracket.gcode', printDurationSec: 6000, filamentUsedMm: 7340, weight: '22 г',
    rating: null, ratingStatus: '', ratingError: null,
    isRatingBusy: false, isRatingAvailable: true, onRate: vi.fn(), onRetryRating: vi.fn(),
    restartBlockReason: null, restartError: null, isPrintBusy: false, onRestart: vi.fn(), onClose: vi.fn(),
    ...overrides,
  }
}

describe('PrintCompletionModal', () => {
  it('получает имя окна, безопасный фокус и закрытие по Escape', () => {
    const data = props()
    render(<PrintCompletionModal {...data} />)
    expect(screen.getByRole('dialog', { name: 'Печать завершена' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus()
    expect(screen.getByText(data.filename)).toHaveAttribute('title', data.filename)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(data.onClose).toHaveBeenCalledOnce()
  })

  it('сохраняет фокус внутри окна при Tab и Shift+Tab', () => {
    render(<PrintCompletionModal {...props()} />)
    const dialog = screen.getByRole('dialog')
    const querySelectorAll = dialog.querySelectorAll.bind(dialog)
    // jsdom выдаёт группы comma-selector не в порядке DOM.
    vi.spyOn(dialog, 'querySelectorAll').mockImplementation((selector) =>
      querySelectorAll(selector.includes(',') ? `:is(${selector})` : selector),
    )
    fireEvent.click(screen.getByRole('checkbox'))
    const restart = screen.getByRole('button', { name: 'Печатать снова' })
    restart.focus()
    fireEvent.keyDown(restart, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Хорошо' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Хорошо' }), { key: 'Tab', shiftKey: true })
    expect(restart).toHaveFocus()
  })

  it('передаёт оценку, показывает выбор текстом и aria-pressed', () => {
    const data = props({ rating: 'bad' })
    render(<PrintCompletionModal {...data} />)
    expect(screen.getByRole('button', { name: 'Плохо' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Хорошо' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Хорошо' }))
    expect(data.onRate).toHaveBeenCalledWith('good')
  })

  it('не запускает повтор без подтверждения свободного стола', () => {
    const data = props()
    render(<PrintCompletionModal {...data} />)
    const restart = screen.getByRole('button', { name: 'Печатать снова' })
    expect(restart).toBeDisabled()
    fireEvent.click(restart)
    expect(data.onRestart).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Деталь снята со стола' }))
    expect(restart).toBeEnabled()
    fireEvent.click(restart)
    expect(data.onRestart).toHaveBeenCalledOnce()
  })

  it('показывает причину блокировки и ошибку команды рядом с повтором', () => {
    const data = props({ restartBlockReason: 'Нет связи с принтером.' })
    const { rerender } = render(<PrintCompletionModal {...data} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByText('Нет связи с принтером.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Печатать снова' })).toBeDisabled()
    rerender(<PrintCompletionModal {...data} restartBlockReason={null} restartError="Файл удалён." />)
    expect(screen.getByText('Файл удалён.')).toBeVisible()
  })

  it('при сохранении блокирует close, Escape, rating и повтор', () => {
    const data = props({ rating: 'good', isRatingBusy: true, ratingStatus: 'Сохраняем оценку…' })
    render(<PrintCompletionModal {...data} />)
    expect(screen.getByText('Сохраняем оценку…')).toBeVisible()
    for (const name of ['Закрыть', 'Хорошо', 'Плохо', 'Печатать снова']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(data.onClose).not.toHaveBeenCalled()
  })

  it('при отсутствии записи оценка недоступна, закрытие и повтор печати доступны', () => {
    const data = props({ isRatingAvailable: false, ratingError: 'Оценка недоступна: запись этой печати не найдена.' })
    render(<PrintCompletionModal {...data} />)
    expect(screen.getByRole('button', { name: 'Хорошо' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Плохо' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(data.onRetryRating).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Печатать снова' })).toBeEnabled()
  })

  it('ошибка оценки сохраняет выбор, а flow передаёт блокировку несохранённого результата', () => {
    const data = props({ rating: 'bad', ratingError: 'Не удалось сохранить оценку.', restartBlockReason: 'Сохраните выбранную оценку перед повтором.' })
    render(<PrintCompletionModal {...data} />)
    expect(screen.getByRole('button', { name: 'Плохо' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Не удалось сохранить оценку.')).toBeVisible()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Печатать снова' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(data.onRetryRating).toHaveBeenCalledOnce()
  })

  it('при занятом принтере блокирует подтверждение и запуск', () => {
    render(<PrintCompletionModal {...props({ isPrintBusy: true })} />)
    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Печатать снова' })).toBeDisabled()
    expect(screen.getByText('Принтер выполняет другую команду.')).toBeVisible()
  })
})
