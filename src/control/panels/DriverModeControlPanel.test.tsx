import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DriverModeControlPanel, type DriverControlsProps } from './DriverModeControlPanel'

function fixture(): DriverControlsProps {
 return {
  mode: {supported: true, mode: 'normal', state: 'ready', availableModes: ['normal', 'quiet'], needsRestart: false, message: null},
  pendingCommands: {}, getCommandBlockReason: () => null, getLastCommandError: () => '',
  onApply: vi.fn().mockResolvedValue(true), onRestart: vi.fn().mockResolvedValue(true),
 }
}
describe('Подтверждение режима драйверов', () => {
 it('отмена не посылает команду', () => {
  const controls = fixture()
  render(<DriverModeControlPanel controls={controls} kind="drivers" />)
  fireEvent.click(screen.getByRole('button', {name: 'Тихий'}))
  fireEvent.click(screen.getByRole('button', {name: 'Отмена'}))
  expect(controls.onApply).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
 })
 it('ждёт состояния принтера после принятия команды', async () => {
  const controls = fixture()
  controls.pendingCommands = { motion: 'setDriverMode' }
  const view = render(<DriverModeControlPanel controls={{...controls, pendingCommands: {}}} kind="drivers" />)
  fireEvent.click(screen.getByRole('button', {name: 'Тихий'}))
  view.rerender(<DriverModeControlPanel controls={controls} kind="drivers" />)
  view.rerender(<DriverModeControlPanel controls={{...controls, pendingCommands: {}}} kind="drivers" />)
  fireEvent.click(screen.getByRole('button', {name: 'Применить'}))
  await waitFor(() => expect(controls.onApply).toHaveBeenCalledWith('setDriverMode', 'quiet'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  view.rerender(<DriverModeControlPanel controls={{...controls, pendingCommands: {}, mode: {...controls.mode!, mode: 'quiet'}}} kind="drivers" />)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
 })
 it('не применяет непроверенный тихий обдув', () => {
  const controls = fixture()
  controls.fanMode = {...controls.mode!, availableModes: ['normal'], message: 'Нужна аппаратная приёмка'}
  render(<DriverModeControlPanel controls={controls} kind="fan" />)
  fireEvent.click(screen.getByRole('button', {name: 'Тихий'}))
  expect(screen.getByRole('button', {name: 'Применить'})).toBeDisabled()
  expect(controls.onApply).not.toHaveBeenCalled()
 })
 it('предлагает перезапуск только при подтверждённом отказе core', async () => {
  const controls = fixture()
  controls.mode = {...controls.mode!, mode: null, state: 'fault', needsRestart: true}
  render(<DriverModeControlPanel controls={controls} kind="drivers" />)
  fireEvent.click(screen.getByRole('button', {name: 'Тихий'}))
  expect(screen.getByRole('button', {name: 'Перезапустить Klipper'})).toBeInTheDocument()
  expect(controls.onRestart).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', {name: 'Перезапустить Klipper'}))
  await waitFor(() => expect(controls.onRestart).toHaveBeenCalledOnce())
 })
 it('оставляет ошибку применения в окне без перезапуска', async () => {
  const controls = fixture()
  controls.onApply = vi.fn().mockResolvedValue(false)
  controls.getLastCommandError = () => 'SPI failure'
  render(<DriverModeControlPanel controls={controls} kind="drivers" />)
  fireEvent.click(screen.getByRole('button', {name: 'Тихий'}))
  fireEvent.click(screen.getByRole('button', {name: 'Применить'}))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('SPI failure'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(controls.onRestart).not.toHaveBeenCalled()
 })
 it('таймаут не перезапускает принтер', async () => {
  vi.useFakeTimers()
  try {
   const controls = fixture()
   render(<DriverModeControlPanel controls={controls} kind="drivers" />)
   fireEvent.click(screen.getByRole('button', {name: 'Тихий'}))
   await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Применить'})) })
   act(() => vi.advanceTimersByTime(13000))
   expect(screen.getByRole('alert')).toHaveTextContent('Подтверждение режима не получено')
   expect(controls.onRestart).not.toHaveBeenCalled()
  } finally { vi.useRealTimers() }
 })
 it('отдельный переключатель обдува отправляет только его команду', async () => {
  const controls = fixture()
  controls.fanMode = {...controls.mode!}
  render(<DriverModeControlPanel controls={controls} kind="fan" />)
  fireEvent.click(screen.getByRole('button', {name: 'Тихий'}))
  fireEvent.click(screen.getByRole('button', {name: 'Применить'}))
  await waitFor(() => expect(controls.onApply).toHaveBeenCalledWith('setDriverFanMode', 'quiet'))
  expect(controls.mode?.mode).toBe('normal')
 })
 it('сохраняет окно при потере snapshot и запрещает применение по старым данным', () => {
  const controls = fixture()
  const view = render(<DriverModeControlPanel controls={controls} kind="drivers" />)
  fireEvent.click(screen.getByRole('button', {name: 'Тихий'}))
  view.rerender(<DriverModeControlPanel controls={{...controls, mode: undefined}} kind="drivers" />)
  expect(screen.getByRole('dialog')).toHaveTextContent('тихий режим')
  expect(screen.getByRole('button', {name: 'Применить'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button', {name: 'Применить'}))
  expect(controls.onApply).not.toHaveBeenCalled()
  expect(controls.onRestart).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', {name: 'Отмена'}))
  expect(screen.queryByRole('dialog')).toBeNull()
 })
})
