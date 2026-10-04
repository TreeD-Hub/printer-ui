import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockSnapshot } from '../../mocks/runtime'
import { receivePrinterGcodeResponse } from '../core/store/printerNotifications'
import { PidCalibrationScreen } from './PidCalibrationScreen'

afterEach(cleanup)

function open(executeCommand = vi.fn().mockResolvedValue(true), snapshot = createMockSnapshot()) {
  render(<PidCalibrationScreen snapshot={snapshot} pendingCommand={null} executeCommand={executeCommand} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} onBackToList={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Далее →' }))
  return executeCommand
}

it('не запускает нагрев во время печати', () => {
  const snapshot = createMockSnapshot()
  snapshot.printJob.state = 'printing'
  const execute = open(undefined, snapshot)
  expect(screen.getByRole('button', { name: 'Запустить калибровку' })).toBeDisabled()
  expect(execute).not.toHaveBeenCalled()
})

it('ждёт завершения команды и свежих коэффициентов, затем показывает инструкцию сохранения', async () => {
  let finish!: (ok: boolean) => void
  const execute = open(vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve })))
  fireEvent.click(screen.getByRole('button', { name: 'Запустить калибровку' }))
  expect(execute).toHaveBeenCalledWith({ command: 'consoleGcode', script: 'PID_CALIBRATE HEATER=extruder TARGET=200' })
  expect(screen.getByRole('progressbar')).toBeInTheDocument()
  act(() => receivePrinterGcodeResponse('PID parameters: pid_Kp=22.100 pid_Ki=1.200 pid_Kd=101.300'))
  expect(screen.queryByText('Коэффициенты рассчитаны')).not.toBeInTheDocument()
  finish(true)
  await waitFor(() => expect(screen.getByText('Коэффициенты рассчитаны')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Как сохранить →' }))
  expect(screen.getByText('ebb42_can.cfg')).toBeInTheDocument()
  expect(execute).toHaveBeenCalledTimes(1)
})

it('не выдаёт принятый запрос без коэффициентов за успешную калибровку', async () => {
  open()
  fireEvent.click(screen.getByRole('button', { name: 'Запустить калибровку' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('PID-коэффициенты не получены'))
  expect(screen.queryByText('Коэффициенты рассчитаны')).not.toBeInTheDocument()
})

it('не возвращает успех старого запроса после аварийной остановки', async () => {
  let finish!: (ok: boolean) => void
  open(vi.fn((args) => args.command === 'emergencyStop' ? Promise.resolve(true) : new Promise<boolean>((resolve) => { finish = resolve })))
  fireEvent.click(screen.getByRole('button', { name: 'Запустить калибровку' }))
  fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' }))
  await waitFor(() => expect(screen.getByText('Калибровка прервана')).toBeInTheDocument())
  receivePrinterGcodeResponse('PID parameters: pid_Kp=22.100 pid_Ki=1.200 pid_Kd=101.300')
  finish(true)
  await waitFor(() => expect(screen.queryByText('Коэффициенты рассчитаны')).not.toBeInTheDocument())
})
