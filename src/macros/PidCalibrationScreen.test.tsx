import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockSnapshot } from '../../mocks/runtime'
import { receivePrinterGcodeResponse } from '../core/store/printerNotifications'
import { PidCalibrationScreen } from './PidCalibrationScreen'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

function open(executeCommand = vi.fn().mockResolvedValue(true), snapshot = createMockSnapshot()) {
  snapshot.modelFanPercent = 0
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

it('ждёт завершения команды и свежих коэффициентов, затем предлагает сохранить', async () => {
  let finish!: (ok: boolean) => void
  const execute = open(vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve })))
  fireEvent.click(screen.getByRole('button', { name: 'Запустить калибровку' }))
  expect(execute).toHaveBeenCalledWith({ command: 'consoleGcode', script: 'PID_CALIBRATE HEATER=extruder TARGET=200' })
  expect(screen.getByRole('img', { name: /График температуры сопла/ })).toBeInTheDocument()
  act(() => receivePrinterGcodeResponse('PID parameters: pid_Kp=22.100 pid_Ki=1.200 pid_Kd=101.300'))
  expect(screen.queryByText('Коэффициенты рассчитаны')).not.toBeInTheDocument()
  finish(true)
  await waitFor(() => expect(screen.getByText('Коэффициенты рассчитаны')).toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled()
  expect(execute).toHaveBeenCalledTimes(1)
})

async function resultScreen() {
  const snapshot = createMockSnapshot()
  snapshot.modelFanPercent = 0
  const executeCommand = vi.fn(async () => {
    receivePrinterGcodeResponse('PID parameters: pid_Kp=22.100 pid_Ki=1.200 pid_Kd=101.300')
    return true
  })
  const props = { snapshot, pendingCommand: null, executeCommand, refreshEddyState: vi.fn(), getCommandBlockReason: () => null, onBackToList: vi.fn() }
  const view = render(<PidCalibrationScreen {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Далее →' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Запустить калибровку' })))
  return { props, view, executeCommand }
}

it('сохраняет через printer-core и ждёт перезапуска Klipper до успеха', async () => {
  const { props, view, executeCommand } = await resultScreen()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })))
  expect(executeCommand).toHaveBeenLastCalledWith({ command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' })
  expect(screen.getByText('Сохраняем результат')).toBeInTheDocument()
  expect(screen.queryByText('PID сохранён')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Сохранение…' })).toBeDisabled()
  view.rerender(<PidCalibrationScreen {...props} snapshot={{ ...props.snapshot, klippy: { ...props.snapshot.klippy, state: 'startup' } }} />)
  expect(screen.queryByText('PID сохранён')).not.toBeInTheDocument()
  view.rerender(<PidCalibrationScreen {...props} />)
  expect(screen.getByText('PID сохранён')).toBeInTheDocument()
  expect(executeCommand).toHaveBeenCalledTimes(2)
})

it('сохраняет коэффициенты на экране при ошибке сохранения', async () => {
  const { executeCommand } = await resultScreen()
  executeCommand.mockResolvedValueOnce(false)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })))
  expect(screen.getByRole('alert')).toHaveTextContent('Сохранение не подтверждено')
  expect(screen.getByText('Kp 22.100 · Ki 1.200 · Kd 101.300')).toBeInTheDocument()
  expect(screen.queryByText('PID сохранён')).not.toBeInTheDocument()
})

it('не выдаёт отсутствие перезапуска за подтверждённое сохранение', async () => {
  vi.useFakeTimers()
  const { executeCommand } = await resultScreen()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' })))
  act(() => vi.advanceTimersByTime(90_000))
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось подтвердить сохранение')
  expect(screen.queryByText('PID сохранён')).not.toBeInTheDocument()
  expect(executeCommand).toHaveBeenCalledTimes(2)
})

it.each(['printing', 'paused'] as const)('блокирует сохранение при состоянии %s', async (state) => {
  const { props, view, executeCommand } = await resultScreen()
  view.rerender(<PidCalibrationScreen {...props} snapshot={{ ...props.snapshot, printJob: { ...props.snapshot.printJob, state } }} />)
  expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
  expect(executeCommand).toHaveBeenCalledTimes(1)
})

it('считает циклы по смене цели, показывает время и теряет счёт при разрыве связи', () => {
  vi.useFakeTimers()
  const snapshot = createMockSnapshot()
  snapshot.modelFanPercent = 0
  snapshot.thermalTargets.nozzle = 200
  const props = { snapshot, pendingCommand: null, executeCommand: vi.fn(() => new Promise<boolean>(() => {})), refreshEddyState: vi.fn(), getCommandBlockReason: () => null, onBackToList: vi.fn() }
  const view = render(<PidCalibrationScreen {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Далее →' }))
  fireEvent.click(screen.getByRole('button', { name: 'Запустить калибровку' }))
  expect(screen.getByText('1 / 6')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(65_000))
  expect(screen.getByText('01:05')).toBeInTheDocument()
  view.rerender(<PidCalibrationScreen {...props} snapshot={{ ...snapshot, thermalTargets: { ...snapshot.thermalTargets, nozzle: 195 } }} />)
  expect(screen.getByRole('status')).toHaveTextContent('Остывание')
  view.rerender(<PidCalibrationScreen {...props} />)
  expect(screen.getByText('2 / 6')).toBeInTheDocument()
  view.rerender(<PidCalibrationScreen {...props} snapshot={{ ...snapshot, updatedAt: 'next' }} />)
  expect(screen.getByText('2 / 6')).toBeInTheDocument()
  view.rerender(<PidCalibrationScreen {...props} snapshot={{ ...snapshot, transport: { ...snapshot.transport, state: 'offline' } }} />)
  expect(screen.getByText('— / 6')).toBeInTheDocument()
  view.rerender(<PidCalibrationScreen {...props} />)
  expect(screen.getByText('— / 6')).toBeInTheDocument()
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
  expect(screen.getAllByRole('button', { name: 'К списку' }).every((button) => !button.hasAttribute('disabled'))).toBe(true)
  receivePrinterGcodeResponse('PID parameters: pid_Kp=22.100 pid_Ki=1.200 pid_Kd=101.300')
  finish(true)
  await waitFor(() => expect(screen.queryByText('Коэффициенты рассчитаны')).not.toBeInTheDocument())
})

it('вводит свою температуру тач-клавиатурой и отправляет её в PID', async () => {
  const snapshot = createMockSnapshot()
  snapshot.modelFanPercent = 0
  const executeCommand = vi.fn().mockResolvedValue(true)
  render(<PidCalibrationScreen snapshot={snapshot} pendingCommand={null} executeCommand={executeCommand} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} onBackToList={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Своя температура' }))
  fireEvent.click(screen.getByRole('button', { name: 'Цифра 2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Цифра 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Цифра 5' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ввод' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Далее →' }))
  fireEvent.click(screen.getByRole('button', { name: 'Запустить калибровку' }))
  await waitFor(() => expect(executeCommand).toHaveBeenCalledWith({ command: 'consoleGcode', script: 'PID_CALIBRATE HEATER=extruder TARGET=215' }))
})

it.each([
  ['Сопло', '280'], ['Стол', '120'], ['Сопло', '0'], ['Сопло', ''], ['Сопло', '1e2'],
])('не применяет недопустимую температуру: %s %s', (heater, value) => {
  const snapshot = createMockSnapshot()
  const executeCommand = vi.fn()
  render(<PidCalibrationScreen snapshot={snapshot} pendingCommand={null} executeCommand={executeCommand} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} onBackToList={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`${heater}.*сейчас`) }))
  fireEvent.click(screen.getByRole('button', { name: 'Своя температура' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Температура калибровки, °C' }), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Ввод' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  expect(executeCommand).not.toHaveBeenCalled()
})

it('устанавливает 100% обдув перед PID и ждёт подтверждения команды вентилятора', async () => {
  let finishFan!: (ok: boolean) => void
  const execute = open(vi.fn((args) => args.command === 'setFanPercent' ? new Promise<boolean>((resolve) => { finishFan = resolve }) : Promise.resolve(true)))
  fireEvent.click(screen.getByRole('checkbox', { name: /Включить обдув/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Запустить калибровку' }))
  expect(execute).toHaveBeenCalledTimes(1)
  expect(execute).toHaveBeenCalledWith({ command: 'setFanPercent', percent: 100 })
  await act(async () => finishFan(true))
  expect(execute.mock.calls[1][0]).toEqual({ command: 'consoleGcode', script: 'PID_CALIBRATE HEATER=extruder TARGET=200' })
})

it('не запускает PID при ошибке установки обдува', async () => {
  const execute = open(vi.fn().mockResolvedValue(false))
  fireEvent.click(screen.getByRole('checkbox', { name: /Включить обдув/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Запустить калибровку' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('PID-калибровка не запущена'))
  expect(execute).toHaveBeenCalledTimes(1)
  expect(screen.queryByTestId('pid-temperature-chart')).not.toBeInTheDocument()
})

it('выключает обдув командой 0%, когда галочка снята', async () => {
  const snapshot = createMockSnapshot()
  snapshot.modelFanPercent = 100
  const executeCommand = vi.fn().mockResolvedValue(true)
  render(<PidCalibrationScreen snapshot={snapshot} pendingCommand={null} executeCommand={executeCommand} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} onBackToList={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Далее →' }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Включить обдув/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Запустить калибровку' }))
  await waitFor(() => expect(executeCommand).toHaveBeenCalledWith({ command: 'setFanPercent', percent: 0 }))
})

it('строит график по показаниям принтера и не добавляет точки при потере связи', () => {
  let now = 1_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const snapshot = createMockSnapshot()
  snapshot.modelFanPercent = 0
  const props = { snapshot, pendingCommand: null, executeCommand: vi.fn(() => new Promise<boolean>(() => {})), refreshEddyState: vi.fn(), getCommandBlockReason: () => null, onBackToList: vi.fn() }
  const view = render(<PidCalibrationScreen {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Далее →' }))
  fireEvent.click(screen.getByRole('button', { name: 'Запустить калибровку' }))
  const initialPoints = screen.getByTestId('chart-current-nozzle').getAttribute('points')
  now += 1_000
  const next = { ...snapshot, extruderTemp: snapshot.extruderTemp + 5, updatedAt: 'new-sample' }
  view.rerender(<PidCalibrationScreen {...props} snapshot={next} />)
  const nextPoints = screen.getByTestId('chart-current-nozzle').getAttribute('points')
  expect(nextPoints).not.toBe(initialPoints)
  expect(nextPoints?.trim().split(' ')).toHaveLength(2)
  now += 1_000
  view.rerender(<PidCalibrationScreen {...props} snapshot={{ ...next, extruderTemp: next.extruderTemp + 20, transport: { ...next.transport, state: 'offline' } }} />)
  expect(screen.getByTestId('chart-current-nozzle')).toHaveAttribute('points', nextPoints)
  expect(screen.queryByText('Время ожидания')).not.toBeInTheDocument()
})
