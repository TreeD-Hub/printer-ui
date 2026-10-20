import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsSelectField } from './settingsWidgets'

const options = ['1 мин', '5 мин', '10 мин']

describe('сенсорный выбор настройки', () => {
  it('показывает текущий пункт и применяет выбранное значение с закрытием окна', () => {
    const changed = vi.fn()
    function Field() {
      const [value, setValue] = useState('5 мин')
      return <SettingsSelectField label="Спящий режим" value={value} options={options}
        onChange={(next) => { changed(next); setValue(next) }} />
    }
    render(<Field />)
    fireEvent.click(screen.getByRole('button', { name: 'Спящий режим 5 мин' }))
    expect(screen.getByRole('dialog', { name: 'Спящий режим' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '5 мин', selected: true })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: '10 мин' }))
    expect(changed).toHaveBeenCalledExactlyOnceWith('10 мин')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Спящий режим 10 мин' })).toBeInTheDocument()
  })

  it('отменяет выбор без изменения значения и возвращает фокус', () => {
    const changed = vi.fn()
    render(<SettingsSelectField label="Спящий режим" value="5 мин" options={options} onChange={changed} />)
    const trigger = screen.getByRole('button', { name: 'Спящий режим 5 мин' })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(changed).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('закрывает открытый список при блокировке настройки', () => {
    const changed = vi.fn()
    const { rerender } = render(<SettingsSelectField label="Спящий режим" value="5 мин" options={options} onChange={changed} />)
    fireEvent.click(screen.getByRole('button', { name: 'Спящий режим 5 мин' }))
    rerender(<SettingsSelectField label="Спящий режим" value="5 мин" options={options} onChange={changed} disabled />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Спящий режим 5 мин' })).toBeDisabled()
    expect(changed).not.toHaveBeenCalled()
  })
})
