import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HostUpdateOperation } from '../core/hostUpdate'
import { UpdateOperationScreen } from './UpdateOperationScreen'

const operation: HostUpdateOperation = {
  operationId: 'op-1',
  requestId: 'req-1',
  status: 'running',
  phase: 'installing',
  progress: 64,
  resultCode: null,
  message: 'Пакет устанавливается.',
  targetId: 'printer-core',
  targetTag: 'v1.2.0',
  startedAt: null,
  updatedAt: null,
  finishedAt: null,
}

describe('UpdateOperationScreen', () => {
  it('shows the real stage and reported progress', () => {
    render(<UpdateOperationScreen operation={operation} onDismiss={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Установка обновления' })).toBeInTheDocument()
    expect(screen.getByLabelText('Выполнено 64%')).toBeInTheDocument()
    expect(screen.getByText('Применяем новую версию.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'TreeD' })).toBeInTheDocument()
  })

  it('shows rollback outcome and lets the user return to settings', () => {
    const onDismiss = vi.fn()
    render(<UpdateOperationScreen
      operation={{ ...operation, status: 'rolled_back', phase: 'rolling_back', progress: null, message: 'Предыдущая версия восстановлена.' }}
      onDismiss={onDismiss}
    />)
    expect(screen.getByRole('heading', { name: 'Предыдущая версия восстановлена' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'К обновлениям' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('keeps the app blocked and focus inside until a terminal result, then restores it', () => {
    const root = document.createElement('div')
    root.id = 'root'
    const trigger = document.createElement('button')
    trigger.textContent = 'Обновить'
    const container = document.createElement('div')
    root.append(trigger, container)
    document.body.append(root)
    trigger.focus()
    const onDismiss = vi.fn()
    const view = render(<UpdateOperationScreen operation={operation} onDismiss={onDismiss} />, { container })
    expect(root.inert).toBe(true)
    expect(root.contains(screen.getByRole('dialog'))).toBe(false)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('dialog')).toHaveFocus()

    view.rerender(<UpdateOperationScreen operation={{ ...operation, status: 'error', phase: 'complete' }} onDismiss={onDismiss} />)
    expect(screen.getByRole('button', { name: 'К обновлениям' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'К обновлениям' })).toHaveFocus()
    view.unmount()
    expect(root.inert).toBe(false)
    expect(trigger).toHaveFocus()
    root.remove()
  })

  it('does not present stale percentages while reconnecting or invent an unknown progress', () => {
    const view = render(<UpdateOperationScreen operation={operation} isReconnectPending onDismiss={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Восстанавливаем связь' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
    expect(screen.queryByText('64%')).not.toBeInTheDocument()
    view.rerender(<UpdateOperationScreen operation={{ ...operation, progress: null }} onDismiss={vi.fn()} />)
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('не требует подтверждения после успешного обновления', () => {
    const onDismiss = vi.fn()
    render(<UpdateOperationScreen operation={{ ...operation, status: 'applied', phase: 'complete' }} onDismiss={onDismiss} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
