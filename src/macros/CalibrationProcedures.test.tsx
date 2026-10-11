import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockSnapshot } from '../../mocks/runtime'
import { receivePrinterGcodeResponse } from '../core/store/printerNotifications'
import { MacrosContainer } from './MacrosContainer'
import type { PrinterCalibrationSnapshot } from '../core/transport/types'

vi.mock('./EddyCalibrationScreen', () => ({
  EddyCalibrationScreen: ({ initialProcedure }: { initialProcedure: string }) => <div data-testid="eddy-initial-procedure">{initialProcedure}</div>,
}))

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

function calibration(): PrinterCalibrationSnapshot {
  return {
    manualProbe: { active: false, zMm: null, zMinimumMm: null, zMaximumMm: null },
    eddy: { available: true, heightCalibrated: null, driveCurrent: null, temperatureC: null, temperaturePoints: null, temperatureSeriesActive: null, compensationEnabled: null, inTemperatureCalibration: false, estimatedExpansionMm: null, xOffsetMm: 0, yOffsetMm: 0, zOffsetMm: 0 },
    config: { savePending: false, pendingSections: [] },
    mesh: { profile: null, min: null, max: null, probedMatrix: [], meshMatrix: [], savedProfiles: {} },
    screws: { error: null, maxDeviationMm: null, results: [] },
    shaper: { typeX: 'mzv', typeY: 'mzv', freqXHz: 40, freqYHz: 40 },
    extruder: { rotationDistanceMm: 7.2 },
  }
}

function renderCatalog(snapshot = createMockSnapshot(), executeCommand = vi.fn().mockResolvedValue(true)) {
  render(<MacrosContainer snapshot={snapshot} pendingCommand={null} executeCommand={executeCommand} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  return executeCommand
}

it('показывает каталог и передаёт выбранную процедуру Eddy в экран', () => {
  renderCatalog()
  expect(screen.getByRole('heading', { name: 'Выберите процедуру' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Винты стола/ }))
  expect(screen.getByTestId('eddy-initial-procedure')).toHaveTextContent('screws')
})

it('открывает обзор Eddy из отдельной карточки калибровки', () => {
  renderCatalog()
  fireEvent.click(screen.getByRole('button', { name: /Калибровка Eddy/ }))
  expect(screen.getByTestId('eddy-initial-procedure')).toHaveTextContent('overview')
})

it('не запускает экструдерную подачу при отсутствующем calibration snapshot', () => {
  const execute = vi.fn().mockResolvedValue(true)
  const snapshot = createMockSnapshot()
  snapshot.calibration = undefined
  renderCatalog(snapshot, execute)
  fireEvent.click(screen.getByRole('button', { name: /Подача экструдера/ }))
  expect(screen.getByRole('button', { name: 'Выполнить подачу' })).toBeDisabled()
  expect(screen.getAllByRole('status').some((status) => status.textContent?.includes('недоступны в снимке'))).toBe(true)
  expect(execute).not.toHaveBeenCalled()
})

it('отправляет ограниченную подачу, рассчитывает rotation distance и ждёт effective snapshot до успеха', async () => {
  const snapshot = createMockSnapshot()
  snapshot.capabilities.calibrationCommands = {
    temperatureAccept: false, temperatureComplete: false, abort: false, probeAccuracy: false, setOffsets: false,
    zOffsetAdjust: false, zOffsetSave: false, extruderCalibrationExtrude: true, extruderRotationDistance: true,
    accelerometerQuery: false, accelerometerMeasureNoise: false, adxlConfigured: false, meshScan: false,
  }
  snapshot.calibration = calibration()
  const execute = vi.fn().mockResolvedValue(true)
  const view = render(<MacrosContainer snapshot={snapshot} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Подача экструдера/ }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Выполнить подачу' })))
  expect(execute).toHaveBeenCalledWith({ command: 'extruderCalibrationExtrude', lengthMm: 100, speedMmPerSec: 2, targetCelsius: 200 })
  fireEvent.click(screen.getByRole('button', { name: 'Фактическая длина, мм' }))
  const digitOne = screen.getByTestId('calibration-field-digit-1')
  fireEvent.click(digitOne)
  fireEvent.click(digitOne)
  fireEvent.click(screen.getByTestId('calibration-field-digit-0'))
  fireEvent.click(screen.getByTestId('calibration-field-submit'))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Рассчитать и применить' })))
  expect(execute).toHaveBeenLastCalledWith({ command: 'extruderRotationDistanceApply', distanceMm: 7.92 })
  expect(screen.getAllByRole('status').some((status) => status.textContent?.includes('Применение принято'))).toBe(true)
  const updated = { ...snapshot, updatedAt: 'next-snapshot', calibration: { ...snapshot.calibration!, extruder: { rotationDistanceMm: 7.92 } } }
  view.rerender(<MacrosContainer snapshot={updated} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Сессионное значение подтверждено'))
  expect(screen.getByText('Расчётный результат: 7.9200 мм.')).toBeInTheDocument()
})

it('связывает завершение material test с наблюдавшимся точным путём, не с устаревшим complete или basename', async () => {
  const snapshot = createMockSnapshot()
  snapshot.printFiles = [
    { id: 'file-a', path: 'tests/first/cube.gcode', name: 'cube.gcode', directory: 'tests/first', printTime: '', weight: '', material: '', addedAt: '' },
    { id: 'file-b', path: 'tests/second/cube.gcode', name: 'cube.gcode', directory: 'tests/second', printTime: '', weight: '', material: '', addedAt: '' },
  ]
  snapshot.printJob = { ...snapshot.printJob, state: 'complete', filename: 'tests/first/cube.gcode' }
  const execute = vi.fn().mockResolvedValue(true)
  const view = render(<MacrosContainer snapshot={snapshot} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Профиль материала/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Pressure Advance' }))
  fireEvent.change(screen.getByLabelText('Тестовый файл'), { target: { value: 'tests/first/cube.gcode' } })
  fireEvent.click(screen.getByLabelText(/Филамент и температура/))
  fireEvent.click(screen.getByLabelText(/Я проверил файл/))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Запустить тестовую печать' })))
  expect(execute).toHaveBeenCalledWith({ command: 'start', filename: 'tests/first/cube.gcode' })
  expect(screen.queryByText(/Наблюдавшаяся печать выбранного файла завершена/)).not.toBeInTheDocument()

  const otherPathActive = { ...snapshot, printJob: { ...snapshot.printJob, state: 'printing' as const, filename: '/tests/second/cube.gcode' } }
  view.rerender(<MacrosContainer snapshot={otherPathActive} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  const otherPathComplete = { ...otherPathActive, printJob: { ...otherPathActive.printJob, state: 'complete' as const, filename: 'tests/second/cube.gcode' } }
  view.rerender(<MacrosContainer snapshot={otherPathComplete} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  expect(screen.queryByText(/Наблюдавшаяся печать выбранного файла завершена/)).not.toBeInTheDocument()

  const selectedPathActive = { ...otherPathComplete, printJob: { ...otherPathComplete.printJob, state: 'printing' as const, filename: '/tests/first/cube.gcode' } }
  view.rerender(<MacrosContainer snapshot={selectedPathActive} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  const selectedPathComplete = { ...selectedPathActive, printJob: { ...selectedPathActive.printJob, state: 'complete' as const, filename: 'tests/first/cube.gcode' } }
  view.rerender(<MacrosContainer snapshot={selectedPathComplete} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  await waitFor(() => expect(screen.getByText(/Наблюдавшаяся печать выбранного файла завершена/)).toBeInTheDocument())
})

function shaperSnapshot() {
  const snapshot = createMockSnapshot()
  const current = calibration()
  current.config = { savePending: true, pendingSections: ['input_shaper'] }
  snapshot.calibration = current
  return snapshot
}

function shaperResponses() {
  receivePrinterGcodeResponse('Recommended shaper_type_x = mzv, shaper_freq_x = 40.0 Hz')
  receivePrinterGcodeResponse('Recommended shaper_type_y = mzv, shaper_freq_y = 40.0 Hz')
}

it('подтверждает shaper save после раннего restart только после ответа RPC и точного нового snapshot', async () => {
  const snapshot = shaperSnapshot()
  let resolveSave!: (value: boolean) => void
  const execute = vi.fn()
    .mockResolvedValueOnce(true)
    .mockImplementationOnce(() => new Promise<boolean>((resolve) => { resolveSave = resolve }))
  const view = render(<MacrosContainer snapshot={snapshot} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Запустить полный тест' }))
  await act(async () => { shaperResponses(); await Promise.resolve() })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить и перезапустить' })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и перезапустить' }))
  expect(execute).toHaveBeenLastCalledWith({ command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' })

  const restart = { ...snapshot, updatedAt: 'restart-started', klippy: { state: 'shutdown' as const, message: 'restarting' } }
  view.rerender(<MacrosContainer snapshot={restart} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  const ready = { ...restart, updatedAt: 'restart-ready', klippy: { state: 'ready' as const, message: '' }, calibration: { ...currentCalibration(snapshot), config: { savePending: false, pendingSections: [] }, shaper: { typeX: 'mzv', typeY: 'mzv', freqXHz: 40, freqYHz: 40 } } }
  view.rerender(<MacrosContainer snapshot={ready} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  await act(async () => Promise.resolve())
  expect(screen.queryByText('Новые значения X/Y загружены после перезапуска.')).not.toBeInTheDocument()

  await act(async () => { resolveSave(true); await Promise.resolve() })
  await waitFor(() => expect(screen.getByText('Новые значения X/Y загружены после перезапуска.')).toBeInTheDocument())
})

function currentCalibration(snapshot: ReturnType<typeof createMockSnapshot>): PrinterCalibrationSnapshot {
  if (!snapshot.calibration) throw new Error('Calibration fixture missing')
  return snapshot.calibration
}

it.each([
  ['false response', false],
  ['rejected response', new Error('RPC failed')],
])('не подтверждает shaper save после %s', async (_label, result) => {
  const snapshot = shaperSnapshot()
  const execute = vi.fn().mockResolvedValueOnce(true).mockImplementationOnce(() => result instanceof Error ? Promise.reject(result) : Promise.resolve(result))
  const view = render(<MacrosContainer snapshot={snapshot} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Запустить полный тест' }))
  await act(async () => { shaperResponses(); await Promise.resolve() })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить и перезапустить' })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и перезапустить' }))

  const restart = { ...snapshot, updatedAt: 'restart-started', klippy: { state: 'shutdown' as const, message: 'restarting' } }
  view.rerender(<MacrosContainer snapshot={restart} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  const ready = { ...restart, updatedAt: 'restart-ready', klippy: { state: 'ready' as const, message: '' }, calibration: { ...currentCalibration(snapshot), config: { savePending: false, pendingSections: [] }, shaper: { typeX: 'mzv', typeY: 'mzv', freqXHz: 40, freqYHz: 40 } } }
  view.rerender(<MacrosContainer snapshot={ready} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  await act(async () => Promise.resolve())
  expect(screen.queryByText('Новые значения X/Y загружены после перезапуска.')).not.toBeInTheDocument()
  expect(screen.getByText('Команда выполняется')).toBeInTheDocument()
})

it('после таймаута save показывает неопределённый результат и оставляет только аварийную остановку', async () => {
  const snapshot = shaperSnapshot()
  const execute = vi.fn().mockResolvedValueOnce(true).mockImplementationOnce(() => new Promise<boolean>(() => {}))
  render(<MacrosContainer snapshot={snapshot} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Запустить полный тест' }))
  await act(async () => { shaperResponses(); await Promise.resolve() })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить и перезапустить' })).toBeInTheDocument())

  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и перезапустить' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(90_000) })

  expect(screen.getByText('Нужна проверка принтера')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'К списку' }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
})
