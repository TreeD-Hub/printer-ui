import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockSnapshot } from '../../mocks/runtime'
import { receivePrinterGcodeResponse } from '../core/store/printerNotifications'
import { MacrosContainer } from './MacrosContainer'
import type { PrinterCalibrationSnapshot, PrinterShaperResonanceReport } from '../core/transport/types'

vi.mock('./EddyCalibrationScreen', () => ({
  EddyCalibrationScreen: ({ initialProcedure, onBackToList }: { initialProcedure: string; onBackToList: () => void }) => <div data-testid="eddy-initial-procedure">{initialProcedure}<button type="button" onClick={onBackToList}>К списку</button></div>,
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

function renderCatalog(snapshot = createMockSnapshot(), executeCommand = vi.fn().mockResolvedValue(true), onCalibrationViewChange = vi.fn()) {
  render(<MacrosContainer snapshot={snapshot} pendingCommand={null} executeCommand={executeCommand} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} onCalibrationViewChange={onCalibrationViewChange} />)
  return executeCommand
}

it('открывает разделы Eddy через папку и возвращается в неё после процедуры', () => {
  const execute = renderCatalog()
  expect(screen.queryByRole('heading', { name: 'Выберите процедуру' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Ручная калибровка стола/ })).not.toBeInTheDocument()
  expect(screen.getByTestId('calibration-catalog').querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: 'Датчик Eddy' }))
  expect(screen.getByRole('heading', { name: 'Eddy' })).toBeInTheDocument()
  expect(screen.getByTestId('calibration-catalog').querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3)
  expect(execute).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Ручная калибровка стола/ }))
  expect(screen.getByTestId('eddy-initial-procedure')).toHaveTextContent('screws')
  fireEvent.click(screen.getByRole('button', { name: 'К списку' }))
  expect(screen.getByRole('heading', { name: 'Eddy' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Ручная калибровка стола/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
  expect(screen.getByRole('button', { name: 'Датчик Eddy' })).toBeInTheDocument()
})

it('включает полноэкранный режим при открытии Eddy и шейпера, но не при открытии PID', () => {
  const onViewChange = vi.fn()
  renderCatalog(createMockSnapshot(), vi.fn().mockResolvedValue(true), onViewChange)
  fireEvent.click(screen.getByRole('button', { name: /PID-калибровка/ }))
  expect(onViewChange).not.toHaveBeenCalled()
  cleanup()
  renderCatalog(createMockSnapshot(), vi.fn().mockResolvedValue(true), onViewChange)
  fireEvent.click(screen.getByRole('button', { name: 'Датчик Eddy' }))
  expect(onViewChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Калибровка датчика автоуровня/ }))
  expect(onViewChange).toHaveBeenLastCalledWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'К списку' }))
  expect(onViewChange).toHaveBeenLastCalledWith(false)
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  expect(onViewChange).toHaveBeenLastCalledWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'К списку' }))
  expect(onViewChange).toHaveBeenLastCalledWith(false)
})

it('открывает обзор Eddy из отдельной карточки папки', () => {
  renderCatalog()
  fireEvent.click(screen.getByRole('button', { name: 'Датчик Eddy' }))
  fireEvent.click(screen.getByRole('button', { name: /Калибровка датчика автоуровня/ }))
  expect(screen.getByTestId('eddy-initial-procedure')).toHaveTextContent('overview')
  fireEvent.click(screen.getByRole('button', { name: 'К списку' }))
  expect(screen.getByRole('heading', { name: 'Eddy' })).toBeInTheDocument()
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
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
  fireEvent.click(screen.getByRole('button', { name: action }))
  await act(async () => {
    receivePrinterGcodeResponse(response)
    await Promise.resolve()
  })

  await waitFor(() => expect(screen.getByRole('region', { name: 'Подробности процедуры' })).toBeInTheDocument())
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
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
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
  expect(screen.getByRole('button', { name: 'К тесту резонансов' })).toHaveClass('is-primary')
  fireEvent.click(screen.getByRole('button', { name: 'К тесту резонансов' }))
  expect(screen.getByRole('button', { name: 'Измерить резонансы' })).toHaveClass('is-primary')
  expect(screen.getByRole('button', { name: 'Подробнее' })).toHaveAttribute('aria-expanded', 'false')
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

it('подтверждает shaper save после restart/disconnect только после ответа RPC и точного нового snapshot', async () => {
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
  expect(document.querySelector('.calibration-procedure-visual')).toBeInTheDocument()
  expect(screen.getByRole('status', { name: 'Рекомендация по шейперу' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Сохранение…' })).toBeDisabled()

  const restart = { ...snapshot, updatedAt: 'restart-disconnected', klippy: { state: 'disconnected' as const, message: 'restart' } }
  view.rerender(<MacrosContainer snapshot={restart} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  const startup = { ...restart, updatedAt: 'restart-startup', klippy: { state: 'startup' as const, message: '' } }
  view.rerender(<MacrosContainer snapshot={startup} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  const offline = { ...startup, updatedAt: 'restart-offline', transport: { ...snapshot.transport, state: 'offline' as const } }
  view.rerender(<MacrosContainer snapshot={offline} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  expect(screen.getByRole('button', { name: 'Сохранение…' })).toBeDisabled()
  const ready = { ...offline, updatedAt: 'restart-ready', transport: { ...snapshot.transport, state: 'online' as const }, klippy: { state: 'ready' as const, message: '' }, calibration: { ...currentCalibration(snapshot), config: { savePending: false, pendingSections: [] }, shaper: { typeX: 'mzv', typeY: 'mzv', freqXHz: 40, freqYHz: 40 } } }
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
  fireEvent.click(screen.getByRole('tab', { name: 'Y' }))
  expect(screen.getByRole('status', { name: 'Рекомендация по шейперу' })).toHaveTextContent('Рекомендовано · YMZV55.0 Гц')
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
  expect(screen.getByLabelText('Сейчас и рекомендовано')).toHaveTextContent('mzv · 40.0 Гц')
  expect(screen.getByLabelText('Сейчас и рекомендовано')).toHaveTextContent('ei · 45.0 Гц')
  expect(screen.getByLabelText('Сейчас и рекомендовано')).toHaveTextContent('mzv · 55.0 Гц')
})

it('блокирует сохранение, пока принтер не передал частоту второй оси', async () => {
  const snapshot = shaperSnapshot()
  const props = { snapshot, pendingCommand: null, executeCommand: vi.fn().mockResolvedValue(true), refreshEddyState: vi.fn(), getCommandBlockReason: () => null }
  const view = render(<MacrosContainer {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' }))
  await act(async () => { shaperResponses(); await Promise.resolve() })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить и перезапустить' })).toBeInTheDocument())

  const incomplete = { ...snapshot, calibration: { ...currentCalibration(snapshot), shaper: { ...currentCalibration(snapshot).shaper, freqYHz: null } } }
  view.rerender(<MacrosContainer {...props} snapshot={incomplete} />)
  expect(screen.getByRole('button', { name: 'Сохранить и перезапустить' })).toBeDisabled()
  expect(screen.getByText('Принтер ещё не передал настройки обеих осей. Дождитесь обновления данных.')).toBeInTheDocument()
})

it('при непринятом измерении отдаёт место сообщению и сохраняет аварийную остановку', async () => {
  renderCatalog(shaperSnapshot(), vi.fn().mockResolvedValue(false))
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Команда не подтверждена')
  expect(document.querySelector('.motion-study')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ожидаем завершения' })).toBeDisabled()
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

  const restart = { ...snapshot, updatedAt: 'restart-started', klippy: { state: 'disconnected' as const, message: 'restarting' } }
  view.rerender(<MacrosContainer snapshot={restart} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  const ready = { ...restart, updatedAt: 'restart-ready', klippy: { state: 'ready' as const, message: '' }, calibration: { ...currentCalibration(snapshot), config: { savePending: false, pendingSections: [] }, shaper: { typeX: 'mzv', typeY: 'mzv', freqXHz: 40, freqYHz: 40 } } }
  view.rerender(<MacrosContainer snapshot={ready} pendingCommand={null} executeCommand={execute} refreshEddyState={vi.fn()} getCommandBlockReason={() => null} />)
  await act(async () => Promise.resolve())
  expect(screen.queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument()
  const expectedError = result instanceof Error ? 'RPC failed' : 'Команда не подтверждена'
  expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes(expectedError))).toBe(true)
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

  expect(screen.getByRole('alert')).toHaveTextContent('Состояние принтера неизвестно')
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ожидаем завершения' })).toBeDisabled()
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
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
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
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Считать ADXL' })))
  expect(activity).toHaveBeenLastCalledWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'К тесту резонансов' }))
  expect(activity.mock.calls).toEqual([[false], [true]])
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' })))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить и перезапустить' })))
  expect(activity).toHaveBeenLastCalledWith(true)
  view.rerender(<MacrosContainer snapshot={{ ...snapshot, klippy: { state: 'disconnected', message: 'restart' } }} {...props} />)
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
  const viewChange = vi.fn()
  const execute = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(accepted)
  const props = { pendingCommand: null, executeCommand: execute, onCalibrationActivityChange: activity, onCalibrationViewChange: viewChange, refreshEddyState: vi.fn(), getCommandBlockReason: () => null }
  const view = render(<MacrosContainer snapshot={shaperSnapshot()} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' })))
  expect(activity).toHaveBeenLastCalledWith(true)
  expect(screen.getByRole('button', { name: 'Ожидаем завершения' })).toBeDisabled()
  // Смена callback при обновлении snapshot не завершает активный сеанс.
  const replacement = vi.fn()
  view.rerender(<MacrosContainer snapshot={shaperSnapshot()} {...props} onCalibrationActivityChange={replacement} />)
  expect(activity).toHaveBeenLastCalledWith(true)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' })))
  if (accepted) {
    expect(replacement).toHaveBeenLastCalledWith(false)
    expect(screen.getByTestId('calibration-catalog')).toBeInTheDocument()
    expect(viewChange.mock.calls).toEqual([[true], [false]])
  }
  else { expect(replacement).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled() }
  view.unmount()
  expect(replacement).toHaveBeenLastCalledWith(false)
})

it.each([
  ['shutdown', true],
  ['error', false],
] as const)('закрывает незавершённый shaper при Klippy %s и игнорирует поздний RPC', async (state, lateResult) => {
  const snapshot = shaperSnapshot()
  const activity = vi.fn()
  const onViewChange = vi.fn()
  let finish!: (ok: boolean) => void
  const execute = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
  const props = { pendingCommand: null, executeCommand: execute, onCalibrationActivityChange: activity, onCalibrationViewChange: onViewChange, refreshEddyState: vi.fn(), getCommandBlockReason: () => null }
  const view = render(<MacrosContainer snapshot={snapshot} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' }))
  await waitFor(() => expect(execute).toHaveBeenCalledWith({ command: 'shaperCalibrateFull', save: false }))

  view.rerender(<MacrosContainer snapshot={{ ...snapshot, updatedAt: `terminal-${state}`, klippy: { state, message: state } }} {...props} />)
  expect(screen.getByTestId('calibration-catalog')).toBeInTheDocument()
  expect(activity).toHaveBeenLastCalledWith(false)
  await act(async () => { shaperResponses(); finish(lateResult); await Promise.resolve() })
  expect(screen.queryByRole('status', { name: 'Рекомендация по шейперу' })).not.toBeInTheDocument()
  expect(execute).toHaveBeenCalledTimes(1)

  expect(onViewChange.mock.calls).toEqual([[true], [false]])
  expect(execute).toHaveBeenCalledTimes(1)
})

it('завершает pending shaper save при подтверждённом shutdown и игнорирует поздний ответ', async () => {
  const snapshot = shaperSnapshot()
  const activity = vi.fn()
  let finishSave!: (ok: boolean) => void
  const execute = vi.fn().mockResolvedValueOnce(true).mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishSave = resolve }))
  const props = { pendingCommand: null, executeCommand: execute, onCalibrationActivityChange: activity, refreshEddyState: vi.fn(), getCommandBlockReason: () => null }
  const view = render(<MacrosContainer snapshot={snapshot} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' }))
  await act(async () => { shaperResponses(); await Promise.resolve() })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить и перезапустить' })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и перезапустить' }))
  expect(screen.getByRole('button', { name: 'Сохранение…' })).toBeDisabled()

  view.rerender(<MacrosContainer snapshot={{ ...snapshot, klippy: { state: 'shutdown', message: 'halted' } }} {...props} />)
  expect(screen.getByTestId('calibration-catalog')).toBeInTheDocument()
  expect(activity).toHaveBeenLastCalledWith(false)
  await act(async () => { finishSave(true); await Promise.resolve() })
  expect(screen.queryByRole('status', { name: 'Рекомендация по шейперу' })).not.toBeInTheDocument()
  expect(execute).toHaveBeenCalledTimes(2)
})

it('выходит в каталог, если Klippy shutdown приходит раньше ответа emergencyStop', async () => {
  const snapshot = shaperSnapshot()
  const activity = vi.fn()
  const onViewChange = vi.fn()
  let finishStart!: (ok: boolean) => void
  let finishStop!: (ok: boolean) => void
  const execute = vi.fn()
    .mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishStart = resolve }))
    .mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishStop = resolve }))
  const props = { pendingCommand: null, executeCommand: execute, onCalibrationActivityChange: activity, onCalibrationViewChange: onViewChange, refreshEddyState: vi.fn(), getCommandBlockReason: () => null }
  const view = render(<MacrosContainer snapshot={snapshot} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' }))
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' }))
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(2))

  view.rerender(<MacrosContainer snapshot={{ ...snapshot, klippy: { state: 'shutdown', message: 'halted' } }} {...props} />)
  expect(screen.getByTestId('calibration-catalog')).toBeInTheDocument()
  expect(onViewChange.mock.calls).toEqual([[true], [false]])
  await act(async () => { finishStart(true); finishStop(true); await Promise.resolve() })
  expect(onViewChange.mock.calls).toEqual([[true], [false]])
  expect(activity).toHaveBeenLastCalledWith(false)
  expect(execute).toHaveBeenCalledTimes(2)
})

it('отменяет исходный shaper baseline после terminal state даже если принтер успел вернуться в ready', async () => {
  const snapshot = shaperSnapshot()
  const execute = vi.fn().mockResolvedValue(true)
  const onViewChange = vi.fn()
  let finishBaseline!: (report: PrinterShaperResonanceReport) => void
  const fetch = vi.fn(() => new Promise<PrinterShaperResonanceReport>((resolve) => { finishBaseline = resolve }))
  const props = { pendingCommand: null, executeCommand: execute, fetchShaperResonances: fetch, onCalibrationViewChange: onViewChange, refreshEddyState: vi.fn(), getCommandBlockReason: () => null }
  const view = render(<MacrosContainer snapshot={snapshot} {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' }))
  expect(fetch).toHaveBeenCalledTimes(1)
  view.rerender(<MacrosContainer snapshot={{ ...snapshot, klippy: { state: 'shutdown', message: 'halted' } }} {...props} />)
  expect(screen.getByTestId('calibration-catalog')).toBeInTheDocument()
  expect(onViewChange.mock.calls).toEqual([[true], [false]])

  view.rerender(<MacrosContainer snapshot={{ ...snapshot, updatedAt: 'ready-again', klippy: { state: 'ready', message: '' } }} {...props} />)
  await act(async () => { finishBaseline(spectrumReport('late-baseline')); await Promise.resolve() })
  expect(execute).not.toHaveBeenCalled()
  expect(onViewChange.mock.calls).toEqual([[true], [false]])
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
  expect(screen.getByTestId('calibration-catalog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Шейпер и ADXL/ }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить резонансы' })))
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('status', { name: 'Рекомендация по шейперу' })).not.toBeInTheDocument()
  await act(async () => { receivePrinterGcodeResponse('Recommended shaper_type_x = ei, shaper_freq_x = 51.4 Hz'); receivePrinterGcodeResponse('Recommended shaper_type_y = mzv, shaper_freq_y = 42.2 Hz') })
  expect(screen.getByRole('status', { name: 'Рекомендация по шейперу' })).toHaveTextContent('EI51.4 Гц')
  expect(screen.getByRole('status', { name: 'Рекомендация по шейперу' })).not.toHaveTextContent('99.0')
  expect(fetch).toHaveBeenCalledTimes(3)
})
