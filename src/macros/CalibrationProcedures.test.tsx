import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockSnapshot } from '../../mocks/runtime'
import { receivePrinterGcodeResponse } from '../core/store/printerNotifications'
import { MacrosContainer } from './MacrosContainer'
import type { PrinterCalibrationSnapshot, PrinterShaperResonanceReport } from '../core/transport/types'

vi.mock('./EddyCalibrationScreen', () => ({
  EddyCalibrationScreen: ({ initialProcedure, onBackToList }: { initialProcedure: string; onBackToList: () => void }) => <div data-testid="eddy-initial-procedure">{initialProcedure}<button type="button" onClick={onBackToList}>В папку Eddy</button></div>,
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

it('открывает разделы Eddy через папку и возвращается в неё после процедуры', () => {
  const execute = renderCatalog()
  expect(screen.getByRole('heading', { name: 'Выберите процедуру' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Винты стола/ })).not.toBeInTheDocument()
  expect(screen.getByTestId('calibration-catalog').querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(6)
  fireEvent.click(screen.getByRole('button', { name: 'Датчик Eddy' }))
  expect(screen.getByRole('heading', { name: 'Eddy' })).toBeInTheDocument()
  expect(screen.getByTestId('calibration-catalog').querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4)
  expect(execute).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Винты стола/ }))
  expect(screen.getByTestId('eddy-initial-procedure')).toHaveTextContent('screws')
  fireEvent.click(screen.getByRole('button', { name: 'В папку Eddy' }))
  expect(screen.getByRole('heading', { name: 'Eddy' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Винты стола/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
  expect(screen.getByRole('button', { name: 'Датчик Eddy' })).toBeInTheDocument()
})

it('открывает обзор Eddy из отдельной карточки калибровки', () => {
  renderCatalog()
  fireEvent.click(screen.getByRole('button', { name: 'Датчик Eddy' }))
  fireEvent.click(screen.getByRole('button', { name: /Калибровка Eddy/ }))
  expect(screen.getByTestId('eddy-initial-procedure')).toHaveTextContent('overview')
  fireEvent.click(screen.getByRole('button', { name: 'В папку Eddy' }))
  expect(screen.getByRole('heading', { name: 'Eddy' })).toBeInTheDocument()
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
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Фактическая длина, мм' }))
  const digitOne = screen.getByTestId('calibration-field-digit-1')
  fireEvent.click(digitOne)
  fireEvent.click(digitOne)
  fireEvent.click(screen.getByTestId('calibration-field-digit-0'))
  fireEvent.click(screen.getByTestId('calibration-field-submit'))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Рассчитать и применить' })))
  expect(execute).toHaveBeenLastCalledWith({ command: 'extruderRotationDistanceApply', distanceMm: 7.92 })
  expect(screen.getByText('Применяем рассчитанное значение.')).toHaveAttribute('role', 'status')
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  const updated = { ...snapshot, updatedAt: 'next-snapshot', calibration: { ...snapshot.calibration!, extruder: { rotationDistanceMm: 7.92 } } }
  view.rerender(<MacrosContainer snapshot={updated} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  await waitFor(() => expect(screen.getByText('Применено · не сохранено')).toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
  expect(screen.getByLabelText('Расчёт rotation distance')).toHaveTextContent('Расчётный результат7.9200 мм')
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
  expect(screen.getByRole('heading', { name: 'Выберите G-code' })).toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /tests\/first\/cube\.gcode/ }))
  fireEvent.click(screen.getByLabelText(/Филамент и температура/))
  fireEvent.click(screen.getByLabelText(/Я проверил G-code/))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Запустить тестовую печать' })))
  expect(execute).toHaveBeenCalledWith({ command: 'start', filename: 'tests/first/cube.gcode' })
  expect(screen.queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument()

  const otherPathActive = { ...snapshot, printJob: { ...snapshot.printJob, state: 'printing' as const, filename: '/tests/second/cube.gcode' } }
  view.rerender(<MacrosContainer snapshot={otherPathActive} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  const otherPathComplete = { ...otherPathActive, printJob: { ...otherPathActive.printJob, state: 'complete' as const, filename: 'tests/second/cube.gcode' } }
  view.rerender(<MacrosContainer snapshot={otherPathComplete} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  expect(screen.queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument()

  const selectedPathActive = { ...otherPathComplete, printJob: { ...otherPathComplete.printJob, state: 'printing' as const, filename: '/tests/first/cube.gcode' } }
  view.rerender(<MacrosContainer snapshot={selectedPathActive} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  const selectedPathComplete = { ...selectedPathActive, printJob: { ...selectedPathActive.printJob, state: 'complete' as const, filename: 'tests/first/cube.gcode' } }
  view.rerender(<MacrosContainer snapshot={selectedPathComplete} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  await waitFor(() => expect(screen.getByText('Найдите участок с ровными углами')).toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'Готово' })).toBeEnabled()
})

function shaperSnapshot() {
  const snapshot = createMockSnapshot()
  const current = calibration()
  current.config = { savePending: true, pendingSections: ['input_shaper'] }
  snapshot.calibration = current
  return snapshot
}

it.each([
  ['query negative', 'Считать ADXL', '// adxl345 values (x, y, z): -470.719200, 0.000000, 9728.196800', 'Показания акселерометра', '-470.719', '0.000', '9728.197'],
  ['query', 'Считать ADXL', '// adxl345 values (x, y, z): 470.719200, 941.438400, 9728.196800', 'Показания акселерометра', '470.719', '941.438', '9728.197'],
  ['noise', 'Измерить шум', 'Axes noise for xy-axis accelerometer: 0.123456 (x), 0.234567 (y), 0.345678 (z)', 'Шум акселерометра', '0.123', '0.235', '0.346'],
] as const)('показывает диагностику ADXL (%s) отдельно от калибровки и без сохранения', async (_kind, action, response, label, x, y, z) => {
  const execute = vi.fn().mockResolvedValue(true)
  render(<MacrosContainer snapshot={shaperSnapshot()} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: action }))
  await act(async () => {
    receivePrinterGcodeResponse(response)
    await Promise.resolve()
  })

  await waitFor(() => expect(screen.getByRole('heading', { name: 'Диагностика ADXL' })).toBeInTheDocument())
  expect(screen.getByRole('status', { name: label })).toHaveTextContent(x)
  expect(screen.getByRole('status', { name: label })).toHaveTextContent(y)
  expect(screen.getByRole('status', { name: label })).toHaveTextContent(z)
  expect(screen.queryByRole('button', { name: 'Сохранить и перезапустить' })).not.toBeInTheDocument()
  expect(screen.queryByText(/adxl345 values|axes noise/i)).not.toBeInTheDocument()
})

function shaperResponses() {
  receivePrinterGcodeResponse('Recommended shaper_type_x = mzv, shaper_freq_x = 40.0 Hz')
  receivePrinterGcodeResponse('Recommended shaper_type_y = mzv, shaper_freq_y = 40.0 Hz')
}

it('переключает результат query на новую диагностику noise без выхода в каталог', async () => {
  const execute = vi.fn().mockResolvedValue(true)
  renderCatalog(shaperSnapshot(), execute)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Считать ADXL' }))
  await act(async () => {
    receivePrinterGcodeResponse('adxl345 values (x, y, z): 0.124, -0.086, 9.812')
    await Promise.resolve()
  })
  expect(await screen.findByRole('status', { name: 'Показания акселерометра' })).toHaveTextContent('-0.086')
  fireEvent.click(screen.getByRole('button', { name: 'Измерить шум' }))
  await act(async () => {
    receivePrinterGcodeResponse('Axes noise for xyz-axis accelerometer: 0.021 (x), 0.032 (y), 0.043 (z)')
    await Promise.resolve()
  })
  const noise = await screen.findByRole('status', { name: 'Шум акселерометра' })
  expect(noise).toHaveTextContent('0.021')
  expect(noise).toHaveTextContent('0.032')
  expect(noise).toHaveTextContent('0.043')
  expect(screen.queryByRole('status', { name: 'Показания акселерометра' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Считать ADXL' })).toBeInTheDocument()
  expect(execute.mock.calls.map(([args]) => args.command)).toEqual(['accelerometerQuery', 'accelerometerMeasureNoise'])
})

it.each(['mock', 'live'] as const)('маркирует каталог, папку и процедуры по фактическому source=%s', (source) => {
  const snapshot = createMockSnapshot()
  snapshot.source = source
  renderCatalog(snapshot)
  expect(Boolean(screen.queryByText(/Симуляция/))).toBe(source === 'mock')
  fireEvent.click(screen.getByRole('button', { name: 'Датчик Eddy' }))
  expect(Boolean(screen.queryByText(/Симуляция/))).toBe(source === 'mock')
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  expect(Boolean(screen.queryByText(/Симуляция/))).toBe(source === 'mock')
})

it('подтверждает shaper save после раннего restart только после ответа RPC и точного нового snapshot', async () => {
  const snapshot = shaperSnapshot()
  let resolveSave!: (value: boolean) => void
  const execute = vi.fn()
    .mockResolvedValueOnce(true)
    .mockImplementationOnce(() => new Promise<boolean>((resolve) => { resolveSave = resolve }))
  const view = render(<MacrosContainer snapshot={snapshot} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' }))
  await act(async () => { shaperResponses(); await Promise.resolve() })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить и перезапустить' })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и перезапустить' }))
  expect(execute).toHaveBeenLastCalledWith({ command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' })

  const restart = { ...snapshot, updatedAt: 'restart-started', klippy: { state: 'shutdown' as const, message: 'restarting' } }
  view.rerender(<MacrosContainer snapshot={restart} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  const ready = { ...restart, updatedAt: 'restart-ready', klippy: { state: 'ready' as const, message: '' }, calibration: { ...currentCalibration(snapshot), config: { savePending: false, pendingSections: [] }, shaper: { typeX: 'mzv', typeY: 'mzv', freqXHz: 40, freqYHz: 40 } } }
  view.rerender(<MacrosContainer snapshot={ready} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  await act(async () => Promise.resolve())
  expect(screen.queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument()

  await act(async () => { resolveSave(true); await Promise.resolve() })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Готово' })).toBeEnabled())
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
})

function currentCalibration(snapshot: ReturnType<typeof createMockSnapshot>): PrinterCalibrationSnapshot {
  if (!snapshot.calibration) throw new Error('Calibration fixture missing')
  return snapshot.calibration
}

it.each(['Pressure Advance', 'Расход', 'Температура', 'Ретракт', 'Макс. поток'])('показывает учебную схему %s, не результат файла и не автоматический коэффициент', (title) => {
  const execute = renderCatalog()
  fireEvent.click(screen.getByRole('button', { name: /Профиль материала/ }))
  expect(within(screen.getByRole('group', { name: 'Профильная проверка материала' })).getAllByRole('button')).toHaveLength(5)
  fireEvent.click(screen.getByRole('button', { name: title }))
  const study = screen.getByRole('figure', { name: `Что оценивать: ${title}` })
  expect(study).toHaveTextContent('Схема образца')
  expect(study.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByRole('heading', { name: 'Выберите G-code' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
  expect(screen.getByRole('region', { name: 'Подробности процедуры' })).toHaveTextContent('Учебная схема, не результат печати и не геометрия G-code.')
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
  expect(execute).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Назад к тесту' }))
  expect(screen.queryByRole('figure')).not.toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Профильная проверка материала' })).toBeInTheDocument()
})

it('различает нулевые, неизвестные и boolean-показания телеметрии и не выполняет команды', () => {
  const snapshot = createMockSnapshot()
  snapshot.calibration = calibration()
  snapshot.calibration.eddy = { ...snapshot.calibration.eddy, temperatureC: 0, driveCurrent: 0, compensationEnabled: false, heightCalibrated: true }
  const execute = vi.fn().mockResolvedValue(true)
  const view = render(<MacrosContainer snapshot={snapshot} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Сервисная телеметрия/ }))
  expect(screen.getByText('0.0', { exact: false, selector: '.calibration-primary-readout strong' })).toHaveTextContent('0.0 °C')
  expect(screen.getByText('0', { selector: 'dd' })).toBeInTheDocument()
  expect(screen.getByText('Выключена')).toBeInTheDocument()
  expect(screen.getByText('Подтверждена')).toBeInTheDocument()
  snapshot.calibration.eddy = { ...snapshot.calibration.eddy, temperatureC: null, driveCurrent: null, compensationEnabled: true, heightCalibrated: false }
  view.rerender(<MacrosContainer snapshot={{ ...snapshot }} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  expect(screen.getByText('Включена')).toBeInTheDocument()
  expect(screen.getByText('Не настроена')).toBeInTheDocument()
  expect(screen.queryByText('0.0', { exact: false, selector: '.calibration-primary-readout strong' })).not.toBeInTheDocument()
  snapshot.calibration.eddy = { ...snapshot.calibration.eddy, compensationEnabled: null, heightCalibrated: null }
  view.rerender(<MacrosContainer snapshot={{ ...snapshot }} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  expect(screen.getAllByText('Нет данных').length).toBeGreaterThanOrEqual(4)
  expect(screen.queryByText(/Неизвестно.*°C/)).not.toBeInTheDocument()
  expect(execute).not.toHaveBeenCalled()
})

it('сравнивает текущие настройки шейпера с реальными рекомендациями X/Y', async () => {
  const snapshot = shaperSnapshot()
  renderCatalog(snapshot)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' }))
  await act(async () => {
    receivePrinterGcodeResponse('Recommended shaper_type_x = ei, shaper_freq_x = 45.0 Hz')
    receivePrinterGcodeResponse('Recommended shaper_type_y = mzv, shaper_freq_y = 55.0 Hz')
    await Promise.resolve()
  })
  const result = await screen.findByRole('status', { name: 'Рекомендация по шейперу' })
  expect(result).toHaveTextContent('Рекомендовано')
  expect(result).toHaveTextContent('EI45.0 Гц')
  expect(result).toHaveTextContent('Y · MZV · 55.0 Гц')
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
  expect(screen.getByLabelText('Сейчас и рекомендовано')).toHaveTextContent('mzv · 40.0 Гц')
  expect(screen.getByLabelText('Сейчас и рекомендовано')).toHaveTextContent('ei · 45.0 Гц')
  expect(screen.getByLabelText('Сейчас и рекомендовано')).toHaveTextContent('mzv · 55.0 Гц')
})

it('при непринятом измерении отдаёт место сообщению и сохраняет аварийную остановку', async () => {
  renderCatalog(shaperSnapshot(), vi.fn().mockResolvedValue(false))
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Команда не подтверждена')
  expect(document.querySelector('.motion-study')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Завершить' })).toBeDisabled()
})

it.each([
  ['false response', false],
  ['rejected response', new Error('RPC failed')],
])('не подтверждает shaper save после %s', async (_label, result) => {
  const snapshot = shaperSnapshot()
  const execute = vi.fn().mockResolvedValueOnce(true).mockImplementationOnce(() => result instanceof Error ? Promise.reject(result) : Promise.resolve(result))
  const view = render(<MacrosContainer snapshot={snapshot} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' }))
  await act(async () => { shaperResponses(); await Promise.resolve() })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить и перезапустить' })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и перезапустить' }))

  const restart = { ...snapshot, updatedAt: 'restart-started', klippy: { state: 'shutdown' as const, message: 'restarting' } }
  view.rerender(<MacrosContainer snapshot={restart} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  const ready = { ...restart, updatedAt: 'restart-ready', klippy: { state: 'ready' as const, message: '' }, calibration: { ...currentCalibration(snapshot), config: { savePending: false, pendingSections: [] }, shaper: { typeX: 'mzv', typeY: 'mzv', freqXHz: 40, freqYHz: 40 } } }
  view.rerender(<MacrosContainer snapshot={ready} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  await act(async () => Promise.resolve())
  expect(screen.queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument()
  expect(screen.getByText('Команда выполняется')).toBeInTheDocument()
})

it('после таймаута save показывает неопределённый результат и оставляет только аварийную остановку', async () => {
  const snapshot = shaperSnapshot()
  const execute = vi.fn().mockResolvedValueOnce(true).mockImplementationOnce(() => new Promise<boolean>(() => {}))
  render(<MacrosContainer snapshot={snapshot} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' }))
  await act(async () => { shaperResponses(); await Promise.resolve() })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить и перезапустить' })).toBeInTheDocument())

  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и перезапустить' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(90_000) })

  expect(screen.getByText('Нужна проверка принтера')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Завершить' })).toBeDisabled()
})

function spectrumReport(revision: string, peak = 6): PrinterShaperResonanceReport {
  const csv = `freq,psd_x,psd_y,psd_z,psd_xyz\n0,0,0,0,0\n20,1,2,3,${peak}\n60,0,0,0,0`
  return { mode: 'full', axes: { x: { revision: `${revision}-x`, csv }, y: { revision: `${revision}-y`, csv } } }
}

it('проходит ADXL → подготовка → свежие X/Y спектры, игнорирует чужие рекомендации и старый ответ повторного замера', async () => {
  let resolveOld!: (report: PrinterShaperResonanceReport) => void
  const fetch = vi.fn().mockResolvedValueOnce(spectrumReport('baseline'))
    .mockImplementationOnce(() => new Promise<PrinterShaperResonanceReport>((resolve) => { resolveOld = resolve }))
    .mockResolvedValueOnce(spectrumReport('first')).mockResolvedValueOnce(spectrumReport('second', 12))
  const execute = vi.fn().mockImplementation(async (args: { command: string }) => {
    if (args.command === 'accelerometerQuery') receivePrinterGcodeResponse('adxl345 values (x, y, z): 0.124, -0.086, 9.812')
    else { receivePrinterGcodeResponse('Recommended shaper_type_x = ei, shaper_freq_x = 51.4 Hz'); receivePrinterGcodeResponse('Recommended shaper_type_y = mzv, shaper_freq_y = 42.2 Hz') }
    return true
  })
  render(<MacrosContainer snapshot={shaperSnapshot()} pendingCommand={null} executeCommand={execute} fetchShaperResonances={fetch} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Считать ADXL' })))
  fireEvent.click(screen.getByRole('button', { name: 'К тесту резонансов' }))
  await act(async () => { receivePrinterGcodeResponse('Recommended shaper_type_y = zv, shaper_freq_y = 99.0 Hz') })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' })))
  expect(screen.getByRole('status', { name: 'Рекомендация по шейперу' })).toHaveTextContent('EI51.4 Гц')
  expect(screen.getByText('Получаем спектр…')).toBeInTheDocument()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Повторить замер' })))
  expect(await screen.findByRole('img', { name: 'Измеренный спектр резонансов X' })).toHaveTextContent('1.2e+1')
  fireEvent.click(screen.getByRole('tab', { name: 'Y' }))
  expect(screen.getByRole('img', { name: 'Измеренный спектр резонансов Y' })).toBeInTheDocument()
  expect(screen.getByRole('status', { name: 'Рекомендация по шейперу' })).toHaveTextContent('MZV42.2 Гц')
  await act(async () => { resolveOld(spectrumReport('late', 100)); receivePrinterGcodeResponse('Recommended shaper_type_y = zv, shaper_freq_y = 99.0 Hz') })
  expect(screen.getByRole('img')).toHaveTextContent('1.2e+1')
  expect(screen.getByRole('status', { name: 'Рекомендация по шейперу' })).not.toHaveTextContent('99.0')
  expect(fetch).toHaveBeenCalledTimes(4)
})

it.each(['unchanged', 'baseline failure', 'malformed'] as const)('не показывает старый или неподтверждённый спектр: %s', async (kind) => {
  const execute = vi.fn().mockImplementation(async () => { shaperResponses(); return true })
  const report = spectrumReport('old')
  const fetch = kind === 'baseline failure' ? vi.fn().mockRejectedValue(new Error('CSV export unavailable')) : vi.fn().mockResolvedValueOnce(report).mockResolvedValueOnce(kind === 'malformed' ? { ...spectrumReport('new'), axes: { x: { revision: 'new-x', csv: 'freq,value\n20,10' }, y: null } } : report)
  render(<MacrosContainer snapshot={shaperSnapshot()} pendingCommand={null} executeCommand={execute} fetchShaperResonances={fetch} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' })))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Сохранить и перезапустить' })).toBeEnabled()
  if (kind === 'unchanged') expect(screen.getByText(/Данные спектра не получены/)).toBeInTheDocument()
  else expect(screen.getByRole('alert')).toHaveTextContent(/Ошибка.*спектра/)
})

it('повторный запуск без собственных рекомендаций не принимает старые ответы', async () => {
  const execute = vi.fn().mockImplementationOnce(async () => { shaperResponses(); return true }).mockResolvedValue(true)
  renderCatalog(shaperSnapshot(), execute)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' })))
  await act(async () => { receivePrinterGcodeResponse('Recommended shaper_type_y = zv, shaper_freq_y = 99.0 Hz') })
  vi.useFakeTimers()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Повторить замер' })))
  await act(async () => { await vi.advanceTimersByTimeAsync(90_000) })
  expect(screen.queryByRole('status', { name: 'Рекомендация по шейперу' })).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('не вернул рекомендации для обеих осей')
})

it('повторно проверяет готовность после асинхронного baseline до отправки движения', async () => {
  let resolveBaseline!: (report: PrinterShaperResonanceReport) => void
  const fetch = vi.fn().mockImplementation(() => new Promise<PrinterShaperResonanceReport>((resolve) => { resolveBaseline = resolve }))
  const execute = vi.fn().mockResolvedValue(true)
  const snapshot = shaperSnapshot()
  const props = { pendingCommand: null, executeCommand: execute, fetchShaperResonances: fetch, refreshEddyState: vi.fn(), getCommandBlockReason: () => null }
  const view = render(<MacrosContainer snapshot={snapshot} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' }))
  view.rerender(<MacrosContainer snapshot={{ ...snapshot, transport: { ...snapshot.transport, state: 'offline' } }} {...props} />)
  await act(async () => { resolveBaseline(spectrumReport('baseline')) })
  expect(execute).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('Нужно подключение к готовому принтеру')
})

it.each([
  ['Pressure Advance', 'Найдите участок с ровными углами'], ['Расход', 'Сравните равномерность поверхности'], ['Температура', 'Выберите лучший участок башни'], ['Ретракт', 'Сравните нити между столбиками'], ['Макс. поток', 'Найдите начало ухудшения поверхности'],
])('завершает %s только после наблюдаемой печати и показывает задачу оценки', async (title, task) => {
  const snapshot = createMockSnapshot()
  snapshot.printFiles = [{ id: 'test', path: 'tests/material.gcode', name: 'material.gcode', directory: 'tests', printTime: '', weight: '', material: '', addedAt: '' }]
  const activity = vi.fn()
  const props = { pendingCommand: null, executeCommand: vi.fn().mockResolvedValue(true), onCalibrationActivityChange: activity, refreshEddyState: vi.fn(), getCommandBlockReason: () => null }
  const view = render(<MacrosContainer snapshot={snapshot} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Профиль материала/ }))
  fireEvent.click(screen.getByRole('button', { name: title }))
  fireEvent.click(screen.getByRole('button', { name: /tests\/material.gcode/ }))
  expect(activity).toHaveBeenLastCalledWith(false)
  expect(screen.getByRole('button', { name: 'Запустить тестовую печать' })).toBeDisabled()
  fireEvent.click(screen.getByLabelText(/Филамент и температура/))
  expect(screen.getByRole('button', { name: 'Запустить тестовую печать' })).toBeDisabled()
  fireEvent.click(screen.getByLabelText(/Я проверил G-code/))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Запустить тестовую печать' })))
  expect(activity).toHaveBeenLastCalledWith(true)
  expect(screen.queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument()
  const printing = { ...snapshot, printJob: { ...snapshot.printJob, filename: 'tests/material.gcode', state: 'printing' as const, progressPercent: 37 } }
  view.rerender(<MacrosContainer snapshot={printing} {...props} />)
  expect(screen.getByText('37', { exact: false, selector: '.calibration-primary-readout strong' })).toHaveTextContent('37 %')
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
  view.rerender(<MacrosContainer snapshot={{ ...printing, printJob: { ...printing.printJob, state: 'complete' } }} {...props} />)
  expect(await screen.findByText(task)).toBeInTheDocument()
  expect(activity).toHaveBeenLastCalledWith(true)
  expect(screen.getByText('Результат внесите в слайсер')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
  expect(activity).toHaveBeenLastCalledWith(false)
  expect(screen.getByTestId('calibration-catalog')).toBeInTheDocument()
})

it('удерживает активность ADXL → подготовка → результат → перезапуск до явного Готово', async () => {
  const snapshot = shaperSnapshot()
  const activity = vi.fn()
  const execute = vi.fn().mockImplementation(async (args: { command: string }) => {
    if (args.command === 'accelerometerQuery') receivePrinterGcodeResponse('adxl345 values (x, y, z): 0.1, 0.2, 9.8')
    if (args.command === 'shaperCalibrateFull') shaperResponses()
    return true
  })
  const props = { pendingCommand: null, executeCommand: execute, onCalibrationActivityChange: activity, refreshEddyState: vi.fn(), getCommandBlockReason: () => null }
  const view = render(<MacrosContainer snapshot={snapshot} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  expect(activity.mock.calls).toEqual([[false]])
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Считать ADXL' })))
  expect(activity).toHaveBeenLastCalledWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'К тесту резонансов' }))
  expect(activity.mock.calls).toEqual([[false], [true]])
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' })))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить и перезапустить' })))
  expect(activity).toHaveBeenLastCalledWith(true)
  view.rerender(<MacrosContainer snapshot={{ ...snapshot, klippy: { state: 'shutdown', message: 'restart' } }} {...props} />)
  view.rerender(<MacrosContainer snapshot={{ ...snapshot, updatedAt: 'ready-after-restart', calibration: { ...snapshot.calibration!, config: { savePending: false, pendingSections: [] } } }} {...props} />)
  expect(await screen.findByRole('button', { name: 'Готово' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  expect(activity).toHaveBeenLastCalledWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
  expect(activity).toHaveBeenLastCalledWith(false)
  expect(screen.queryByRole('button', { name: 'Аварийная остановка' })).not.toBeInTheDocument()
})

it.each([true, false])('завершает активность только при подтверждённой остановке (%s)', async (accepted) => {
  const activity = vi.fn()
  const execute = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(accepted)
  const props = { pendingCommand: null, executeCommand: execute, onCalibrationActivityChange: activity, refreshEddyState: vi.fn(), getCommandBlockReason: () => null }
  const view = render(<MacrosContainer snapshot={shaperSnapshot()} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' })))
  expect(activity).toHaveBeenLastCalledWith(true)
  expect(screen.getByRole('button', { name: 'Завершить' })).toBeDisabled()
  // Смена callback при обновлении snapshot не завершает активный сеанс.
  const replacement = vi.fn()
  view.rerender(<MacrosContainer snapshot={shaperSnapshot()} {...props} onCalibrationActivityChange={replacement} />)
  expect(activity).toHaveBeenLastCalledWith(true)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' })))
  if (accepted) expect(replacement).toHaveBeenLastCalledWith(false)
  else { expect(replacement).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled() }
  view.unmount()
  expect(replacement).toHaveBeenLastCalledWith(false)
})

it('освобождает активность после наблюдаемой отмены именно выбранной печати', async () => {
  const snapshot = createMockSnapshot()
  snapshot.printFiles = [{ id: 'test', path: 'tests/material.gcode', name: 'material.gcode', directory: 'tests', printTime: '', weight: '', material: '', addedAt: '' }]
  const activity = vi.fn()
  const props = { pendingCommand: null, executeCommand: vi.fn().mockResolvedValue(true), onCalibrationActivityChange: activity, refreshEddyState: vi.fn(), getCommandBlockReason: () => null }
  const view = render(<MacrosContainer snapshot={snapshot} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Профиль материала/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Расход' }))
  fireEvent.click(screen.getByRole('button', { name: /tests\/material.gcode/ }))
  fireEvent.click(screen.getByLabelText(/Филамент и температура/))
  fireEvent.click(screen.getByLabelText(/Я проверил G-code/))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Запустить тестовую печать' })))
  const printing = { ...snapshot, printJob: { ...snapshot.printJob, filename: 'tests/material.gcode', state: 'printing' as const } }
  view.rerender(<MacrosContainer snapshot={printing} {...props} />)
  expect(activity).toHaveBeenLastCalledWith(true)
  view.rerender(<MacrosContainer snapshot={{ ...printing, printJob: { ...printing.printJob, state: 'cancelled' } }} {...props} />)
  expect(await screen.findByText('Тест отменён')).toBeInTheDocument()
  expect(activity).toHaveBeenLastCalledWith(false)
})

it('оставляет остановку на результате горячей подачи и не завершает сеанс при неподтверждённой остановке', async () => {
  const activity = vi.fn()
  const execute = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  render(<MacrosContainer snapshot={shaperSnapshot()} pendingCommand={null} executeCommand={execute} onCalibrationActivityChange={activity} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Подача экструдера/ }))
  expect(screen.queryByRole('button', { name: 'Аварийная остановка' })).not.toBeInTheDocument()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Выполнить подачу' })))
  expect(screen.getByRole('button', { name: 'Рассчитать и применить' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' })))
  expect(activity).toHaveBeenLastCalledWith(true)
  expect(screen.getByRole('button', { name: 'Завершить' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' })))
  expect(activity).toHaveBeenLastCalledWith(false)
  expect(screen.queryByRole('button', { name: 'Аварийная остановка' })).not.toBeInTheDocument()
})

it('предлагает явное Завершить после запуска, сохраняя К списку только для подготовки', async () => {
  const activity = vi.fn()
  const execute = vi.fn().mockResolvedValue(true)
  render(<MacrosContainer snapshot={shaperSnapshot()} pendingCommand={null} executeCommand={execute} onCalibrationActivityChange={activity} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Подача экструдера/ }))
  expect(screen.getByRole('button', { name: 'К списку' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Завершить' })).not.toBeInTheDocument()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Выполнить подачу' })))
  expect(screen.getByRole('button', { name: 'Завершить' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Завершить' }))
  expect(activity).toHaveBeenLastCalledWith(false)
  expect(screen.getByTestId('calibration-catalog')).toBeInTheDocument()
  expect(execute).toHaveBeenCalledTimes(1)
})

it('ждёт websocket-рекомендации X и Y после раннего accepted RPC, затем читает свежий CSV', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(spectrumReport('baseline')).mockResolvedValueOnce(spectrumReport('new'))
  const execute = vi.fn().mockResolvedValue(true)
  render(<MacrosContainer snapshot={shaperSnapshot()} pendingCommand={null} executeCommand={execute} fetchShaperResonances={fetch} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' })))
  expect(execute).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Сохранить и перезапустить' })).not.toBeInTheDocument()
  await act(async () => { receivePrinterGcodeResponse('Recommended shaper_type_x = ei, shaper_freq_x = 51.4 Hz') })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('status', { name: 'Рекомендация по шейперу' })).not.toBeInTheDocument()
  await act(async () => { receivePrinterGcodeResponse('Recommended shaper_type_y = mzv, shaper_freq_y = 42.2 Hz') })
  expect(await screen.findByRole('img', { name: 'Измеренный спектр резонансов X' })).toBeInTheDocument()
  expect(screen.getByRole('status', { name: 'Рекомендация по шейперу' })).toHaveTextContent('EI51.4 Гц')
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('ограничивает ожидание второй рекомендации и не принимает ответы после deadline', async () => {
  vi.useFakeTimers()
  const activity = vi.fn()
  const fetch = vi.fn().mockResolvedValue(spectrumReport('baseline'))
  render(<MacrosContainer snapshot={shaperSnapshot()} pendingCommand={null} executeCommand={vi.fn().mockResolvedValue(true)} fetchShaperResonances={fetch} onCalibrationActivityChange={activity} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' })))
  await act(async () => { receivePrinterGcodeResponse('Recommended shaper_type_x = ei, shaper_freq_x = 51.4 Hz'); await vi.advanceTimersByTimeAsync(89_999) })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(screen.getByRole('alert')).toHaveTextContent('за 90 секунд')
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  expect(activity).toHaveBeenLastCalledWith(true)
  await act(async () => { receivePrinterGcodeResponse('Recommended shaper_type_y = mzv, shaper_freq_y = 42.2 Hz') })
  expect(screen.queryByRole('status', { name: 'Рекомендация по шейперу' })).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('отмена обрывает ожидание текущего запуска и его поздние рекомендации не попадают в следующий', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn().mockResolvedValueOnce(spectrumReport('old')).mockResolvedValueOnce(spectrumReport('new-baseline')).mockResolvedValueOnce(spectrumReport('new-result'))
  const execute = vi.fn().mockResolvedValue(true)
  render(<MacrosContainer snapshot={shaperSnapshot()} pendingCommand={null} executeCommand={execute} fetchShaperResonances={fetch} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' })))
  await act(async () => { receivePrinterGcodeResponse('Recommended shaper_type_x = zv, shaper_freq_x = 99.0 Hz') })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' })))
  await act(async () => { shaperResponses(); await vi.advanceTimersByTimeAsync(90_000) })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('status', { name: 'Рекомендация по шейперу' })).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' })))
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('status', { name: 'Рекомендация по шейперу' })).not.toBeInTheDocument()
  await act(async () => { receivePrinterGcodeResponse('Recommended shaper_type_x = ei, shaper_freq_x = 51.4 Hz'); receivePrinterGcodeResponse('Recommended shaper_type_y = mzv, shaper_freq_y = 42.2 Hz') })
  expect(screen.getByRole('status', { name: 'Рекомендация по шейперу' })).toHaveTextContent('EI51.4 Гц')
  expect(screen.getByRole('status', { name: 'Рекомендация по шейперу' })).not.toHaveTextContent('99.0')
  expect(fetch).toHaveBeenCalledTimes(3)
})
