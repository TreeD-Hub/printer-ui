import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockSnapshot } from '../../mocks/runtime'
import { receivePrinterGcodeResponse } from '../core/store/printerNotifications'
import type { ExecuteCommandArgs } from '../core/commands'
import type { PrinterCalibrationSnapshot } from '../core/transport/types'
import { EddyCalibrationScreen } from './EddyCalibrationScreen'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

it.each([['Rapid', 'rapid_scan'], ['Точки', 'automatic'], ['Обычный', 'scan']])('передаёт режим сканирования %s и блокирует переключение во время команды', async (label, method) => {
  const snapshot = readySnapshot()
  snapshot.capabilities.calibrationCommands!.meshScanMethods = true
  const { executeCommand, view, props } = renderScreen({ initialProcedure: 'mesh', snapshot })
  fireEvent.click(screen.getByRole('button', { name: label, exact: true }))
  expect(screen.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить карту стола' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyScanMesh', save: false, method })
  view.rerender(<EddyCalibrationScreen {...props} pendingCommand="eddyScanMesh" />)
  expect(screen.getByRole('button', { name: label, exact: true })).toBeDisabled()
})

it('скрывает режимы сканирования без поддержки core', () => {
  renderScreen({ initialProcedure: 'mesh' })
  expect(screen.queryByRole('group', { name: 'Режим сканирования' })).not.toBeInTheDocument()
})

it('на карте убирает обычную строку статуса, но сохраняет причину блокировки', () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.mesh.probedMatrix = [[0, 0.01], [0.02, 0.03]]
  const { view, props } = renderScreen({ initialProcedure: 'mesh', snapshot })
  expect(view.container.querySelector('.eddy-status')).toBeNull()
  expect(view.container.querySelector('.eddy-workflow--mesh-expanded')).not.toBeNull()
  view.rerender(<EddyCalibrationScreen {...props} getCommandBlockReason={(command) => command === 'eddyScanMesh' ? 'Датчик недоступен' : null} />)
  expect(screen.getByText('Датчик недоступен')).toBeInTheDocument()
  expect(view.container.querySelector('.eddy-workflow--mesh-expanded')).toBeNull()
})

function calibrationSnapshot(): PrinterCalibrationSnapshot {
  return {
    manualProbe: { active: false, zMm: null, zMinimumMm: null, zMaximumMm: null },
    eddy: {
      available: true,
      heightCalibrated: null,
      driveCurrent: null,
      temperatureC: null,
      temperaturePoints: 0,
      temperatureSeriesActive: false,
      compensationEnabled: null,
      inTemperatureCalibration: false,
      estimatedExpansionMm: null,
      xOffsetMm: 0,
      yOffsetMm: 0,
      zOffsetMm: 0,
    },
    config: { savePending: false, pendingSections: [] },
    mesh: { profile: null, min: null, max: null, probedMatrix: [], meshMatrix: [], savedProfiles: {} },
    screws: { error: null, maxDeviationMm: null, results: [] },
    shaper: { typeX: null, typeY: null, freqXHz: null, freqYHz: null },
    extruder: { rotationDistanceMm: null },
  }
}

function readySnapshot() {
  const snapshot = createMockSnapshot()
  snapshot.homedAxes = 'xyz'
  snapshot.capabilities.eddy = true
  snapshot.capabilities.serviceCommands = true
  snapshot.capabilities.calibrationCommands = {
    temperatureAccept: true,
    temperatureComplete: true,
    abort: true,
    probeAccuracy: true,
    zOffsetAdjust: true,
    zOffsetSave: true,
    extruderCalibrationExtrude: true,
    extruderRotationDistance: true,
    accelerometerQuery: true,
    accelerometerMeasureNoise: true,
    adxlConfigured: true,
    meshScan: true,
  }
  snapshot.calibration = calibrationSnapshot()
  snapshot.v2.eddy.calibration.activeStep = 'not_started'
  snapshot.v2.eddy.calibration.operatorPrompt = 'none'
  return snapshot
}

function renderScreen({
  initialProcedure = 'overview',
  snapshot = readySnapshot(),
  executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>().mockResolvedValue(true),
  refreshEddyState = vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  getCommandBlockReason = () => null,
  onCalibrationActivityChange,
}: {
  initialProcedure?: 'overview' | 'screws' | 'mesh' | 'firstLayer' | 'accuracy' | 'temperature' | 'height' | 'driveCurrent' | 'z0' | 'offsets'
  snapshot?: ReturnType<typeof readySnapshot>
  executeCommand?: (args: ExecuteCommandArgs) => Promise<boolean>
  refreshEddyState?: () => Promise<boolean>
  getCommandBlockReason?: (command: string) => string | null
  onCalibrationActivityChange?: (active: boolean) => void
} = {}) {
  const props = { snapshot, pendingCommand: null, executeCommand, refreshEddyState, getCommandBlockReason, onCalibrationActivityChange, onBackToList: vi.fn(), initialProcedure }
  const view = render(<EddyCalibrationScreen {...props} />)
  return { props, view, executeCommand }
}

it('обзор не использует старые флаги, если состояние калибровки недоступно', () => {
  const snapshot = readySnapshot()
  snapshot.calibration = undefined
  snapshot.v2.eddy.calibration.requiredDone = true
  renderScreen({ snapshot })
  expect(screen.getByRole('button', { name: /Ток катушки/ })).toHaveTextContent('Не настроено')
  expect(screen.queryByText('обязательные шаги готовы')).not.toBeInTheDocument()
})

it('обзор оставляет восемь процедур и отдельную основную кнопку в правой колонке', () => {
  renderScreen()
  const overview = screen.getByRole('region', { name: 'Фактическое состояние калибровок' })
  const cards = overview.querySelectorAll('.eddy-overview-card')
  expect(cards).toHaveLength(8)
  expect(overview.querySelectorAll('.eddy-card-state')).toHaveLength(8)
  expect(overview.querySelector('.eddy-card-value')).toBeNull()
  expect(screen.getByRole('button', { name: /Ток катушки/ })).toHaveTextContent('Не настроено')
  expect(screen.queryByText('XY-смещение')).not.toBeInTheDocument()
  const footer = document.querySelector('.eddy-footer')!
  expect(footer.querySelectorAll('button.is-primary')).toHaveLength(1)
  expect(footer.querySelector('.eddy-footer-primary > button')).toHaveClass('is-primary')
})

it('оставляет одну основную кнопку справа, а вторичные действия — в центре', () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.temperatureSeriesActive = true
  snapshot.calibration!.eddy.temperaturePoints = 3
  snapshot.v2.eddy.calibration.operatorPrompt = 'temperature_points'
  renderScreen({ initialProcedure: 'temperature', snapshot })
  const footer = document.querySelector('.eddy-footer')!
  const primarySlot = footer.querySelector('.eddy-footer-primary')!
  expect(primarySlot.querySelectorAll('button')).toHaveLength(1)
  expect(primarySlot.querySelector('button')).toHaveClass('is-primary')
  expect(footer.querySelector('.eddy-footer-secondary')?.querySelectorAll('button')).toHaveLength(2)
})

it('открытие подробностей не меняет footer и не перемещает основную кнопку', () => {
  renderScreen({ initialProcedure: 'driveCurrent' })
  const footer = document.querySelector('.eddy-footer')!
  const primary = footer.querySelector('.eddy-footer-primary > .eddy-command > button')!
  expect(primary).toHaveClass('is-primary')
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
  expect(document.querySelector('.eddy-footer')).toBe(footer)
  expect(footer.querySelector('.eddy-footer-primary > .eddy-command > button')).toBe(primary)
  expect(primary).toHaveClass('is-primary')
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть' }))
  expect(footer.querySelector('.eddy-footer-primary > .eddy-command > button')).toBe(primary)
})

it('высота показывает один заголовок, шесть TESTZ и меняет схему только по подтверждённому Z', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.manualProbe = { active: true, zMm: 1, zMinimumMm: 0, zMaximumMm: 2 }
  const { props, view, executeCommand } = renderScreen({ initialProcedure: 'height', snapshot })
  expect(screen.getAllByRole('heading', { name: 'Высота по бумаге' })).toHaveLength(1)
  expect(screen.getByRole('img')).toHaveAttribute('data-delta', '0')
  expect(view.container.querySelectorAll('.eddy-testz button')).toHaveLength(6)
  expect(Array.from(view.container.querySelectorAll('.eddy-testz button'), (button) => button.textContent)).toEqual(['-1 мм', '-0.1 мм', '-0.05 мм', '+1 мм', '+0.1 мм', '+0.05 мм'])
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '+0.1 мм' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyTestZ', deltaMm: 0.1 })
  expect(screen.getByRole('img')).toHaveAttribute('data-delta', '0')
  const changed = { ...snapshot, calibration: { ...snapshot.calibration!, manualProbe: { ...snapshot.calibration!.manualProbe, zMm: 1.1 } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={changed} />)
  expect(Number(screen.getByRole('img').getAttribute('data-delta'))).toBeCloseTo(0.1)
  view.rerender(<EddyCalibrationScreen {...props} snapshot={{ ...changed, calibration: { ...changed.calibration, manualProbe: { ...changed.calibration.manualProbe, active: false } } }} />)
  view.rerender(<EddyCalibrationScreen {...props} snapshot={{ ...changed, calibration: { ...changed.calibration, manualProbe: { ...changed.calibration.manualProbe, zMm: 5 } } }} />)
  expect(screen.getByRole('img')).toHaveAttribute('data-delta', '0')
})

it('выбор строки и столбца карты сохраняется при переключении таблицы', () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.mesh.probedMatrix = [[0.1, null], [0.2, 0.3]]
  renderScreen({ initialProcedure: 'mesh', snapshot })
  fireEvent.click(screen.getByRole('button', { name: 'Значения' }))
  fireEvent.click(screen.getByRole('button', { name: 'Следующая строка' }))
  fireEvent.click(screen.getByRole('button', { name: 'Следующий столбец' }))
  expect(screen.getByText('Выбранная точка Z 0.300 мм')).toBeInTheDocument()
  expect(screen.getByRole('table')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '3D-карта' }))
  fireEvent.click(screen.getByRole('button', { name: 'Значения' }))
  expect(screen.getByText('Выбранная точка Z 0.300 мм')).toBeInTheDocument()
})

it.each([[[0.1, null], [0.2, 0.3]], [[0.1, 0.2], [0.3]]])('не разрешает запись неполной карты после принятого сканирования', async (...rows) => {
  const snapshot = readySnapshot()
  snapshot.calibration!.mesh.probedMatrix = rows
  renderScreen({ initialProcedure: 'mesh', snapshot })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить карту стола' })))
  expect(screen.queryByRole('button', { name: 'Сохранить карту и перезапустить' })).not.toBeInTheDocument()
})

it.each(['manual', 'temperature'] as const)('обзор оставляет отмену и аварийную остановку при активной сессии %s', (session) => {
  const snapshot = readySnapshot()
  if (session === 'manual') snapshot.calibration!.manualProbe.active = true
  else snapshot.calibration!.eddy.temperatureSeriesActive = true
  renderScreen({ snapshot })
  expect(screen.getByRole('button', { name: 'К списку' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Отменить текущий этап' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
})

it('температурный график справа показывает три реальных ряда и сохраняет превью слева', () => {
  vi.useFakeTimers()
  const timestamp = Date.parse('2026-10-11T20:00:00Z')
  vi.setSystemTime(timestamp)
  const snapshot = readySnapshot()
  snapshot.extruderTemp = 100
  snapshot.bedTemp = 50
  snapshot.thermalTargets = { ...snapshot.thermalTargets, nozzle: 210, bed: 60 }
  snapshot.calibration!.eddy.temperatureC = 24
  const { props, view } = renderScreen({ initialProcedure: 'temperature', snapshot })
  expect(view.container.querySelector('.eddy-instrument > .eddy-subject')).toHaveTextContent('Схема температурной компенсации')
  expect(screen.getByRole('region', { name: 'График температурной калибровки' }).closest('.eddy-instrument-controls')).not.toBeNull()
  expect(view.container.querySelector('.eddy-workflow')).toHaveClass('eddy-workflow--tall-controls')
  expect(screen.getByTestId('eddy-temperature-chart').querySelector('svg')).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet')
  expect(screen.getByTestId('eddy-temperature-chart').querySelector('svg')).toHaveAttribute('viewBox', '0 0 520 280')
  expect(screen.getByTestId('chart-current-nozzle')).toHaveClass('is-orange')
  expect(screen.getByTestId('chart-current-bed')).toHaveClass('is-green')
  expect(screen.getByTestId('chart-current-eddy')).toHaveClass('is-neutral')
  expect(screen.getByTestId('chart-target-nozzle')).toBeInTheDocument()
  expect(screen.getByTestId('chart-target-bed')).toBeInTheDocument()
  expect(screen.queryByTestId('chart-target-eddy')).not.toBeInTheDocument()
  vi.setSystemTime(timestamp + 1000)
  const changed = { ...snapshot, updatedAt: 'temperature-history', extruderTemp: 110, bedTemp: 55, calibration: { ...snapshot.calibration!, eddy: { ...snapshot.calibration!.eddy, temperatureC: 26 } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={changed} />)
  expect(screen.getByTestId('chart-current-eddy').getAttribute('points')?.split(' ')).toHaveLength(2)
  vi.setSystemTime(timestamp + 2000)
  view.rerender(<EddyCalibrationScreen {...props} snapshot={{ ...changed, updatedAt: 'eddy-unavailable', calibration: { ...changed.calibration, eddy: { ...changed.calibration.eddy, temperatureC: null } } }} />)
  expect(screen.getByTestId('chart-current-eddy').getAttribute('points')?.split(' ')).toHaveLength(2)
  expect(screen.getByText('Eddy').parentElement).toHaveTextContent('—')
})

it('принимает температурную точку отдельно от завершения серии и блокирует выход из активной сессии', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.inTemperatureCalibration = true
  snapshot.calibration!.eddy.temperatureSeriesActive = true
  snapshot.calibration!.manualProbe = { active: true, zMm: 0.12, zMinimumMm: -0.2, zMaximumMm: 0.5 }
  snapshot.v2.eddy.calibration.operatorPrompt = 'temperature_points'
  const { executeCommand } = renderScreen({ initialProcedure: 'temperature', snapshot })
  expect(screen.getByRole('button', { name: 'К списку' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'К обзору' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'График температурной калибровки' })).not.toBeInTheDocument()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '-0.05 мм' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyTestZ', deltaMm: -0.05 })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подтвердить зазор' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyTemperatureAccept' })
  expect(executeCommand).not.toHaveBeenCalledWith({ command: 'eddyTemperatureComplete' })
  expect(screen.getByText('0.120 мм')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Завершить серию и сохранить' })).not.toBeInTheDocument()
})

it('не сохраняет температурную серию, если capability завершения не объявлена', () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.temperatureSeriesActive = true
  snapshot.calibration!.eddy.temperaturePoints = 3
  snapshot.calibration!.config = { savePending: true, pendingSections: ['temperature_probe btt_eddy'] }
  snapshot.capabilities.calibrationCommands!.temperatureComplete = false
  const { executeCommand } = renderScreen({ initialProcedure: 'temperature', snapshot })
  expect(screen.queryByRole('button', { name: 'Завершить серию и сохранить' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Подтвердить зазор' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Серия остановлена' })).toBeDisabled()
  expect(executeCommand).not.toHaveBeenCalled()
})

it('показывает понятное ожидание температуры, сохраняя блокировку неподтверждённого manual_probe', () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.temperatureSeriesActive = true
  snapshot.calibration!.eddy.inTemperatureCalibration = true
  snapshot.v2.eddy.calibration.operatorPrompt = 'temperature_points'
  const reason = 'Принять точку температуры Eddy: активная температурная точка manual_probe не подтверждена.'
  renderScreen({ initialProcedure: 'temperature', snapshot, getCommandBlockReason: (command) => command === 'eddyTemperatureAccept' ? reason : null })

  expect(screen.getByRole('button', { name: 'Ожидаем бумажный замер…' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Подтвердить зазор' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '-0.05 мм' })).not.toBeInTheDocument()
  expect(document.querySelector('.eddy-status')).toHaveTextContent('Принтер готовит точку измерения. Дождитесь готовности.')
  expect(screen.queryByText('Дождитесь готовности принтера к измерению.')).not.toBeInTheDocument()
  expect(screen.queryByText('Сплошная — температура; пунктир — цель.')).not.toBeInTheDocument()
})

it('сохраняет температурную серию автоматически один раз после готовой кривой', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.temperatureSeriesActive = true
  snapshot.calibration!.eddy.temperaturePoints = 3
  snapshot.calibration!.config = { savePending: true, pendingSections: ['temperature_probe btt_eddy'] }
  const { props, view, executeCommand } = renderScreen({ initialProcedure: 'temperature', snapshot })
  await act(async () => {})
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyTemperatureComplete' })
  view.rerender(<EddyCalibrationScreen {...props} snapshot={{ ...snapshot, updatedAt: 'same-curve' }} />)
  expect(executeCommand).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: 'Завершить серию и сохранить' })).not.toBeInTheDocument()
})

it.each(['нагрев', 'замер', 'нет кривой', 'другая секция', 'мало точек', 'связи нет'] as const)('не сохраняет температурную серию преждевременно: %s', async (state) => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.temperatureSeriesActive = true
  snapshot.calibration!.eddy.temperaturePoints = 3
  snapshot.calibration!.config = { savePending: true, pendingSections: ['temperature_probe btt_eddy'] }
  if (state === 'нагрев') snapshot.calibration!.eddy.inTemperatureCalibration = true
  if (state === 'замер') snapshot.calibration!.manualProbe.active = true
  if (state === 'нет кривой') snapshot.calibration!.config = { savePending: false, pendingSections: [] }
  if (state === 'другая секция') snapshot.calibration!.config.pendingSections = ['input_shaper']
  if (state === 'мало точек') snapshot.calibration!.eddy.temperaturePoints = 2
  if (state === 'связи нет') snapshot.klippy.state = 'disconnected'
  const { executeCommand } = renderScreen({ initialProcedure: 'temperature', snapshot })
  await act(async () => {})
  expect(executeCommand).not.toHaveBeenCalled()
  if (state === 'нет кривой') expect(screen.getByRole('alert')).toHaveTextContent('Klipper не сформировал температурную кривую.')
})

it('не повторяет автосохранение температурной серии после неподтверждённой команды', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.temperatureSeriesActive = true
  snapshot.calibration!.eddy.temperaturePoints = 3
  snapshot.calibration!.config = { savePending: true, pendingSections: ['temperature_probe btt_eddy'] }
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>().mockResolvedValue(false)
  const { props, view } = renderScreen({ initialProcedure: 'temperature', snapshot, executeCommand })
  await act(async () => {})
  view.rerender(<EddyCalibrationScreen {...props} snapshot={{ ...snapshot, updatedAt: 'after-failed-save' }} />)
  await act(async () => {})
  expect(executeCommand).toHaveBeenCalledTimes(1)
  expect(screen.getByText(/Принтер не подтвердил выполнение команды/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'К списку' })).toBeDisabled()
  expect(screen.queryByRole('heading', { name: 'Z0' })).not.toBeInTheDocument()
})

it('не подтверждает сохранение температурной серии без установленного temperatureDone', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.temperatureSeriesActive = true
  snapshot.calibration!.eddy.temperaturePoints = 3
  snapshot.calibration!.config = { savePending: true, pendingSections: ['temperature_probe btt_eddy'] }
  const { props, view, executeCommand } = renderScreen({ initialProcedure: 'temperature', snapshot })
  await act(async () => {})
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyTemperatureComplete' })
  const restarting = { ...snapshot, klippy: { ...snapshot.klippy, state: 'startup' as const } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={restarting} />)
  const readyWithoutSavedFlag = {
    ...restarting,
    klippy: { ...restarting.klippy, state: 'ready' as const },
    calibration: { ...snapshot.calibration!, config: { savePending: false, pendingSections: [] }, eddy: { ...snapshot.calibration!.eddy, inTemperatureCalibration: false, temperatureSeriesActive: false } },
    v2: { ...snapshot.v2, eddy: { ...snapshot.v2.eddy, calibration: { ...snapshot.v2.eddy.calibration, temperatureDone: false } } },
  }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={readyWithoutSavedFlag} />)
  expect(screen.queryByText('Настройки сохранены.')).not.toBeInTheDocument()
  expect(screen.getByText('Ожидаем сохранения и перезапуска принтера.')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'График температурной калибровки' })).toBeInTheDocument()
  const confirmed = { ...readyWithoutSavedFlag, updatedAt: 'temperature-ready', v2: { ...readyWithoutSavedFlag.v2, eddy: { ...readyWithoutSavedFlag.v2.eddy, calibration: { ...readyWithoutSavedFlag.v2.eddy.calibration, temperatureDone: true, activeStep: 'z0' as const } } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={confirmed} />)
  expect(screen.getByRole('heading', { name: 'Z0' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Проверить Z0' })).toBeEnabled()
  expect(executeCommand).toHaveBeenCalledTimes(1)
})

it('показывает PROBE_ACCURACY только после настоящего ответа Klipper', async () => {
  const { executeCommand } = renderScreen({ initialProcedure: 'accuracy' })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить повторяемость' })))
  expect(screen.getByText('Ожидаем ответ Klipper…')).toBeInTheDocument()
  act(() => receivePrinterGcodeResponse('probe accuracy: probe at X: 10.000 Y: 10.000 Z: 0.100: range 0.012, average 0.040, median 0.040, standard deviation 0.004'))
  expect(screen.getByText('0.012 мм')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Готово' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
  expect(screen.getByText('Среднее 0.040 мм')).toBeInTheDocument()
  expect(screen.getByText('σ 0.004 мм')).toBeInTheDocument()
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyProbeAccuracy' })
})

it('показывает причину блокировки рядом с недоступной командой', () => {
  renderScreen({ initialProcedure: 'accuracy', getCommandBlockReason: () => 'Дождитесь готовности принтера.' })
  expect(screen.getByRole('button', { name: 'Проверить повторяемость' })).toBeDisabled()
  expect(screen.getByText('Дождитесь готовности принтера.')).toBeInTheDocument()
})

it('запрашивает отдельное подтверждение перед аварийной остановкой', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.manualProbe.active = true
  const { executeCommand } = renderScreen({ initialProcedure: 'height', snapshot })
  fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' }))
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  expect(executeCommand).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подтвердить остановку' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'emergencyStop' })
})

it('отменяет ручную проверку только штатным Eddy ABORT и ждёт фактического сброса manualProbe', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.manualProbe.active = true
  const { props, view, executeCommand } = renderScreen({ initialProcedure: 'height', snapshot })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Отменить ручное измерение' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyAbort' })
  expect(screen.getByRole('button', { name: 'К списку' })).toBeDisabled()
  const idle = { ...snapshot, calibration: { ...snapshot.calibration!, manualProbe: { ...snapshot.calibration!.manualProbe, active: false } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={idle} />)
  expect(screen.getByRole('button', { name: 'К списку' })).toBeEnabled()
})

it('пускает аварийную остановку поверх незавершённой команды и игнорирует её поздний успех', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.manualProbe.active = true
  let resolveHeightCommand!: (accepted: boolean) => void
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>((args) => args.command === 'eddyPrimaryAcceptSave'
    ? new Promise((resolve) => { resolveHeightCommand = resolve })
    : Promise.resolve(true))
  const { executeCommand: command } = renderScreen({ initialProcedure: 'height', snapshot, executeCommand })
  fireEvent.click(screen.getByRole('button', { name: 'Принять высоту и сохранить' }))
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подтвердить остановку' })))
  expect(command).toHaveBeenCalledWith({ command: 'emergencyStop' })
  await act(async () => resolveHeightCommand(true))
  expect(screen.queryByText(/Ждём перезапуск, готовность Klipper/)).not.toBeInTheDocument()
  expect(screen.queryByText('Настройки сохранены.')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'К списку' })).toBeDisabled()
})

it('оставляет сохранение заблокированным после неопределённого timeout и игнорирует поздний ответ', async () => {
  vi.useFakeTimers()
  const snapshot = readySnapshot()
  snapshot.calibration!.manualProbe.active = true
  let resolveCommand!: (accepted: boolean) => void
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>(() => new Promise((resolve) => { resolveCommand = resolve }))
  renderScreen({ initialProcedure: 'height', snapshot, executeCommand })
  fireEvent.click(screen.getByRole('button', { name: 'Принять высоту и сохранить' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(90_000) })
  expect(screen.getByRole('alert')).toHaveTextContent('Операция остаётся неопределённой')
  expect(screen.getByRole('button', { name: 'К списку' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'К обзору' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  await act(async () => resolveCommand(true))
  expect(screen.getByRole('button', { name: 'К списку' })).toBeDisabled()
  expect(screen.queryByText('Настройки сохранены.')).not.toBeInTheDocument()
})

it('блокирует повтор и выход после deferred RPC false, не вызывая refresh и сохраняя emergency-stop', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.mesh.probedMatrix = [[0.1, 0.2], [0.3, 0.4]]
  let resolveCommand!: (accepted: boolean) => void
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>(() => new Promise((resolve) => { resolveCommand = resolve }))
  const refreshEddyState = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
  renderScreen({ initialProcedure: 'mesh', snapshot, executeCommand, refreshEddyState })
  fireEvent.click(screen.getByRole('button', { name: 'Измерить карту стола' }))
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  await act(async () => resolveCommand(false))
  expect(refreshEddyState).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('Итог неизвестен')
  expect(screen.getByRole('button', { name: 'Измерить карту стола' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'К обзору' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'К списку' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
})

it('оставляет блокировку и emergency-stop при rejected подготовительной команде', async () => {
  const snapshot = readySnapshot()
  snapshot.homedAxes = ''
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>().mockRejectedValue(new Error('Связь прервана'))
  renderScreen({ initialProcedure: 'height', snapshot, executeCommand })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подготовить оси' })))
  expect(screen.getByRole('alert')).toHaveTextContent('Итог неизвестен')
  expect(screen.getByRole('button', { name: 'Подготовить оси' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'К списку' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
})

it('снимает неопределённость только после принятого emergency-stop, refresh и безопасного снимка', async () => {
  const snapshot = readySnapshot()
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>(async (args) => args.command === 'eddyScanMesh' ? false : true)
  const { props, view, executeCommand: command } = renderScreen({ initialProcedure: 'mesh', snapshot, executeCommand })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить карту стола' })))
  const uncertainWithManualSession = {
    ...snapshot,
    calibration: { ...snapshot.calibration!, manualProbe: { ...snapshot.calibration!.manualProbe, active: true } },
  }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={uncertainWithManualSession} />)
  fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подтвердить остановку' })))
  expect(command).toHaveBeenCalledWith({ command: 'emergencyStop' })
  expect(screen.getByRole('button', { name: 'К списку' })).toBeDisabled()

  const recovered = {
    ...uncertainWithManualSession,
    calibration: { ...uncertainWithManualSession.calibration, manualProbe: { ...uncertainWithManualSession.calibration.manualProbe, active: false } },
  }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={recovered} />)
  expect(screen.getByText(/Аварийная остановка подтверждена/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'К списку' })).toBeEnabled()
})

it('не снимает блокировку после неподтверждённого emergency-stop', async () => {
  const snapshot = readySnapshot()
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>().mockResolvedValue(false)
  renderScreen({ initialProcedure: 'mesh', snapshot, executeCommand })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить карту стола' })))
  fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подтвердить остановку' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'emergencyStop' })
  expect(screen.getByRole('button', { name: 'К списку' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
})

it('показывает код тока только в подробностях, без физических единиц', () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.driveCurrent = 7
  renderScreen({ initialProcedure: 'driveCurrent', snapshot })
  expect(screen.queryByText('Код тока')).not.toBeInTheDocument()
  expect(screen.getByText('Остудите сопло и стол. Проверьте крепление датчика.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
  expect(screen.getByText(/Регистр 0–31 · без единиц измерения/)).toBeInTheDocument()
  expect(screen.getByText('Код тока')).toBeInTheDocument()
  expect(screen.getByText('7')).toBeInTheDocument()
  expect(screen.queryByText(/мА/)).not.toBeInTheDocument()
})

it('сохраняет Z-offset только после изменения и при ранее подтверждённой высотной калибровке', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.heightCalibrated = true
  const { executeCommand } = renderScreen({ initialProcedure: 'offsets', snapshot })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '+ 0,05 мм' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyZOffsetAdjust', deltaMm: 0.05 })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить смещение Z' })))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить и перезапустить' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyZOffsetSave' })
})

it('сопоставляет тест первого слоя по полному пути и открывает babystep только для наблюдавшегося файла', async () => {
  const snapshot = readySnapshot()
  snapshot.printFiles = [{ id: 'first-layer', path: 'tests/bed.gcode', name: 'bed.gcode', directory: 'tests', printTime: '', weight: '', material: '', addedAt: '' }]
  const { props, view, executeCommand } = renderScreen({ initialProcedure: 'firstLayer', snapshot })
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать bed.gcode, каталог tests' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Запустить тест первого слоя' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'start', filename: 'tests/bed.gcode' })

  const duplicateBasename = { ...snapshot, printJob: { ...snapshot.printJob, state: 'printing' as const, filename: 'production/bed.gcode' } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={duplicateBasename} />)
  expect(screen.queryByRole('button', { name: 'Babystep плюс 0.025' })).not.toBeInTheDocument()

  const printing = { ...snapshot, printJob: { ...snapshot.printJob, state: 'printing' as const, filename: 'tests/bed.gcode' } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={printing} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Babystep плюс 0.025' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'adjustZOffset', deltaMm: 0.025 })
})

it('старое completed-состояние не помечает тест первого слоя завершённым без наблюдавшегося запуска', () => {
  const snapshot = readySnapshot()
  snapshot.printJob = { ...snapshot.printJob, state: 'complete', filename: 'tests/bed.gcode' }
  renderScreen({ initialProcedure: 'firstLayer', snapshot })
  expect(screen.getByText('Последняя печать')).toBeInTheDocument()
  expect(screen.queryByText('Тест завершён')).not.toBeInTheDocument()
})

it('не предлагает завершение первого слоя без собственного завершённого запуска', () => {
  const snapshot = readySnapshot()
  snapshot.printFiles = []
  const onCalibrationActivityChange = vi.fn<(active: boolean) => void>()
  const { view, executeCommand } = renderScreen({ initialProcedure: 'firstLayer', snapshot, onCalibrationActivityChange })
  expect(screen.getByRole('button', { name: 'Выберите G-code' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument()
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(false)
  expect(executeCommand).not.toHaveBeenCalled()
  view.unmount()

  snapshot.printJob = { ...snapshot.printJob, state: 'printing', filename: 'tests/bed.gcode' }
  renderScreen({ initialProcedure: 'firstLayer', snapshot })
  expect(screen.getByRole('button', { name: 'Печать выполняется' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument()
})

it('показывает координаты Z0 отдельно и подтверждает успех после обновления этапа без ожидания перезапуска', async () => {
  const snapshot = readySnapshot()
  snapshot.v2.eddy.calibration.z0Done = false
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>(async () => {
    receivePrinterGcodeResponse('Eddy Z0: probe=(125.0,128.5) tool=(125.0,158.5) offset=(0.0,-30.0)')
    return true
  })
  const { props, view } = renderScreen({ initialProcedure: 'z0', snapshot, executeCommand })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить Z0' })))
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
  expect(screen.getByText(/Датчик \(125.0,128.5\)/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Далее: винты стола' })).not.toBeInTheDocument()
  const confirmed = { ...snapshot, v2: { ...snapshot.v2, eddy: { ...snapshot.v2.eddy, calibration: { ...snapshot.v2.eddy.calibration, z0Done: true, activeStep: 'screws' as const, operatorPrompt: 'verify_z0' as const } } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={confirmed} />)
  expect(screen.getByRole('button', { name: 'Далее: винты стола' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Далее: винты стола' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить винты' })))
  expect(screen.getByRole('button', { name: 'Завершить' })).toBeEnabled()
})

it('не подтверждает Z0 по координатному RESPOND и неуспешной команде', async () => {
  const snapshot = readySnapshot()
  snapshot.v2.eddy.calibration.z0Done = false
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>(async () => {
    receivePrinterGcodeResponse('Eddy Z0: probe=(125.0,128.5) tool=(125.0,158.5) offset=(0.0,-30.0)')
    return false
  })
  const { props, view } = renderScreen({ initialProcedure: 'z0', snapshot, executeCommand })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить Z0' })))
  expect(screen.getByRole('alert')).toHaveTextContent('Итог неизвестен')
  expect(screen.queryByRole('button', { name: 'Далее: винты стола' })).not.toBeInTheDocument()
  const reported = { ...snapshot, v2: { ...snapshot.v2, eddy: { ...snapshot.v2.eddy, calibration: { ...snapshot.v2.eddy.calibration, z0Done: true, activeStep: 'screws' as const, operatorPrompt: 'verify_z0' as const } } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={reported} />)
  expect(screen.queryByRole('button', { name: 'Далее: винты стола' })).not.toBeInTheDocument()
})

it('готовит XY и нижнюю Z-опору перед первичной высотной калибровкой', async () => {
  const snapshot = readySnapshot()
  snapshot.homedAxes = ''
  const { executeCommand } = renderScreen({ initialProcedure: 'height', snapshot })
  expect(screen.getByRole('button', { name: 'Подготовить оси' })).toBeEnabled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подготовить оси' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'homeXY' })
})

it('принимает повторную идентичную mesh-матрицу после принятой команды и успешного target refresh', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.mesh.profile = 'default'
  snapshot.calibration!.mesh.probedMatrix = [[0.1, 0.2], [0.3, 0.4]]
  const { props, view, executeCommand } = renderScreen({ initialProcedure: 'mesh', snapshot })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить карту стола' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyScanMesh', save: false })
  expect(screen.getByRole('button', { name: 'Сохранить карту и перезапустить' })).toBeEnabled()
  expect(screen.queryByText('Принтер не подтвердил команду. Результаты сохранены на экране.')).not.toBeInTheDocument()
  const meshDiagram = view.container.querySelector('.eddy-mesh-diagram')

  const measured = snapshot
  view.rerender(<EddyCalibrationScreen {...props} snapshot={measured} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить карту и перезапустить' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' })
  expect(view.container.querySelector('.eddy-mesh-diagram')).toBe(meshDiagram)
  expect(screen.getByText('Ожидаем сохранения и перезапуска принтера.')).toBeInTheDocument()

  const starting = { ...measured, klippy: { ...measured.klippy, state: 'startup' as const }, calibration: { ...measured.calibration!, config: { savePending: true, pendingSections: ['bed_mesh default'] } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={starting} />)
  expect(screen.queryByText('Сохранённый профиль default совпадает с картой после перезапуска.')).not.toBeInTheDocument()
  const ready = { ...measured, calibration: { ...measured.calibration!, config: { savePending: false, pendingSections: [] }, mesh: { ...measured.calibration!.mesh, savedProfiles: { default: [[0.1, 0.2], [0.3, 0.4]] } } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={ready} />)
  expect(screen.getByText('Карта сохранена.')).toBeInTheDocument()
  const completed = { ...ready, v2: { ...ready.v2, eddy: { ...ready.v2.eddy, calibration: { ...ready.v2.eddy.calibration, meshDone: true, requiredDone: true } } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={completed} />)
  expect(screen.getByRole('button', { name: 'Далее: первый слой' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Далее: первый слой' }))
  expect(screen.getByRole('heading', { name: 'Первый слой' })).toBeInTheDocument()
  expect(executeCommand).not.toHaveBeenCalledWith(expect.objectContaining({ command: 'start' }))
})

it('не позволяет сохранять mesh, если target refresh сообщил об ошибке', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.mesh.probedMatrix = [[0.1, 0.2], [0.3, 0.4]]
  renderScreen({ initialProcedure: 'mesh', snapshot, refreshEddyState: vi.fn<() => Promise<boolean>>().mockResolvedValue(false) })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить карту стола' })))
  expect(screen.queryByRole('button', { name: 'Сохранить карту и перезапустить' })).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('актуальный снимок карты не обновился')
})

it('сохраняет блокировку consoleGcode после свежего замера карты', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.mesh.probedMatrix = [[0.1, 0.2], [0.3, 0.4]]
  const reason = 'Команда сохранения заблокирована.'
  const { executeCommand } = renderScreen({ initialProcedure: 'mesh', snapshot, getCommandBlockReason: (command) => command === 'consoleGcode' ? reason : null })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить карту стола' })))
  const save = screen.getByRole('button', { name: 'Сохранить карту и перезапустить' })
  expect(save).toBeDisabled()
  expect(save).toHaveAttribute('title', reason)
  await act(async () => fireEvent.click(save))
  expect(executeCommand).not.toHaveBeenCalledWith({ command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' })
})

it('принимает идентичный результат винтов при успешном refresh и блокирует подтверждение при ошибке refresh', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.screws.error = false
  snapshot.calibration!.screws.results = ['Передний левый', 'Передний правый', 'Задний левый', 'Задний правый'].map((name, index) => ({ name, xMm: index, yMm: index, zMm: 0.1, isBase: null, sign: '+', adjust: '00:01' }))
  const first = renderScreen({ initialProcedure: 'screws', snapshot })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить винты' })))
  expect(screen.getByRole('button', { name: 'Проверить выравнивание' })).toBeEnabled()
  first.view.unmount()

  renderScreen({ initialProcedure: 'screws', snapshot, refreshEddyState: vi.fn<() => Promise<boolean>>().mockResolvedValue(false) })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить винты' })))
  expect(screen.getByRole('button', { name: 'Измерить винты' })).toBeEnabled()
  expect(screen.getByRole('status')).toHaveTextContent('актуальный снимок результата не обновился')
})

it('ведёт от четырёх подтверждённых винтов к явному сканированию карты', async () => {
  const snapshot = readySnapshot()
  snapshot.v2.eddy.calibration.screwsDone = false
  snapshot.calibration!.screws = { error: false, maxDeviationMm: 0.1, results: [[55, 40], [235, 40], [55, 222], [235, 222]].map(([xMm, yMm], index) => ({ name: `Винт ${index + 1}`, xMm, yMm, zMm: 0.1, isBase: index === 0, sign: index === 0 ? null : 'CW', adjust: '00:15' })) }
  const { props, view, executeCommand } = renderScreen({ initialProcedure: 'screws', snapshot })
  expect(view.container.querySelectorAll('.eddy-diagram circle')).toHaveLength(4)
  expect(screen.getByRole('button', { name: 'Измерить винты' })).toBeEnabled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить винты' })))
  expect(screen.getByText('Результат замера')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Проверить выравнивание' })).toBeEnabled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить выравнивание' })))
  expect(screen.getByRole('button', { name: 'Измерить винты' })).toBeEnabled()
  const confirmed = { ...snapshot, v2: { ...snapshot.v2, eddy: { ...snapshot.v2.eddy, calibration: { ...snapshot.v2.eddy.calibration, screwsDone: true, activeStep: 'mesh' as const } } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={confirmed} />)
  expect(screen.getByRole('button', { name: 'Далее: карта стола' })).toBeEnabled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Далее: карта стола' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyScanMesh', save: false })
  expect(screen.getByRole('heading', { name: 'Карта стола' })).toBeInTheDocument()
})

it('блокирует переход к карте, если Eddy стал недоступен после подтверждения винтов', async () => {
  const snapshot = readySnapshot()
  snapshot.v2.eddy.calibration.screwsDone = false
  snapshot.calibration!.screws = { error: false, maxDeviationMm: 0.1, results: [[55, 40], [235, 40], [55, 222], [235, 222]].map(([xMm, yMm], index) => ({ name: `Винт ${index + 1}`, xMm, yMm, zMm: 0.1, isBase: index === 0, sign: index === 0 ? null : 'CW', adjust: '00:15' })) }
  const { props, view, executeCommand } = renderScreen({ initialProcedure: 'screws', snapshot })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить винты' })))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить выравнивание' })))
  const confirmed = { ...snapshot, v2: { ...snapshot.v2, eddy: { ...snapshot.v2.eddy, calibration: { ...snapshot.v2.eddy.calibration, screwsDone: true, activeStep: 'mesh' as const } } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={confirmed} />)
  expect(screen.getByRole('button', { name: 'Далее: карта стола' })).toBeEnabled()

  const unavailable = { ...confirmed, capabilities: { ...confirmed.capabilities, eddy: false } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={unavailable} />)
  const next = screen.getByRole('button', { name: 'Далее: карта стола' })
  expect(next).toBeDisabled()
  expect(next).toHaveAttribute('title', 'Калибровка Eddy недоступна или её состояние неизвестно.')
  await act(async () => fireEvent.click(next))
  expect(executeCommand).not.toHaveBeenCalledWith({ command: 'eddyScanMesh', save: false })
})

it('старый код катушки не вызывает автопереход без принятой команды, перезапуска и подтверждения', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.driveCurrent = 7
  snapshot.v2.eddy.calibration.driveCurrentDone = true
  const { props, view } = renderScreen({ initialProcedure: 'driveCurrent', snapshot })
  expect(screen.queryByRole('button', { name: 'Далее: высота по бумаге' })).not.toBeInTheDocument()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Настроить ток катушки' })))
  expect(screen.getByRole('button', { name: 'Сохранение…' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Далее: высота по бумаге' })).not.toBeInTheDocument()
  view.rerender(<EddyCalibrationScreen {...props} snapshot={{ ...snapshot, klippy: { ...snapshot.klippy, state: 'startup' } }} />)
  view.rerender(<EddyCalibrationScreen {...props} snapshot={snapshot} />)
  expect(screen.getByRole('heading', { name: 'Высота по бумаге' })).toBeInTheDocument()
  expect(props.executeCommand).not.toHaveBeenCalledWith({ command: 'eddyPrimaryHeightStart' })
})

it('переходит после высоты только после записи, перезапуска и перехода device к температуре', async () => {
  const snapshot = readySnapshot()
  snapshot.v2.eddy.calibration.primaryDone = false
  snapshot.calibration!.manualProbe = { active: true, zMm: 0.1, zMinimumMm: 0, zMaximumMm: 2 }
  const { props, view } = renderScreen({ initialProcedure: 'height', snapshot })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Принять высоту и сохранить' })))
  expect(screen.getByRole('img')).toBeInTheDocument()
  expect(screen.queryByText('Бумага')).not.toBeInTheDocument()
  expect(screen.getByText('Ожидаем сохранения и перезапуска принтера.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Далее: температурная серия' })).not.toBeInTheDocument()
  view.rerender(<EddyCalibrationScreen {...props} snapshot={{ ...snapshot, klippy: { ...snapshot.klippy, state: 'startup' } }} />)
  const saved = { ...snapshot, calibration: { ...snapshot.calibration!, manualProbe: { ...snapshot.calibration!.manualProbe, active: false }, eddy: { ...snapshot.calibration!.eddy, heightCalibrated: true } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={saved} />)
  expect(screen.queryByRole('button', { name: 'Далее: температурная серия' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Высота по бумаге' })).toBeInTheDocument()
  view.rerender(<EddyCalibrationScreen {...props} snapshot={{ ...saved, v2: { ...snapshot.v2, eddy: { ...snapshot.v2.eddy, calibration: { ...snapshot.v2.eddy.calibration, primaryDone: true, activeStep: 'temperature' } } } }} />)
  expect(screen.getByRole('heading', { name: 'Температурная серия' })).toBeInTheDocument()
  expect(screen.queryByText('Высота сохранена. Можно продолжить.')).not.toBeInTheDocument()
  expect(props.executeCommand).not.toHaveBeenCalledWith({ command: 'eddyTemperatureStart' })
})

it('подробности и длинная ошибка не убирают TESTZ и аварийную остановку', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.manualProbe = { active: true, zMm: 1, zMinimumMm: 0, zMaximumMm: 2 }
  const { view } = renderScreen({ initialProcedure: 'height', snapshot, executeCommand: vi.fn<() => Promise<boolean>>().mockRejectedValue(new Error('Длинная ошибка '.repeat(40))) })
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
  expect(screen.getByText(/ΔZ 0.000 мм с начала проверки/)).toBeInTheDocument()
  expect(view.container.querySelectorAll('.eddy-testz button')).toHaveLength(6)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '+0.1 мм' })))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(view.container.querySelectorAll('.eddy-testz button')).toHaveLength(6)
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
})

it('удерживает активность от запуска через автопереход до Готово', async () => {
  const onCalibrationActivityChange = vi.fn<(active: boolean) => void>()
  const snapshot = readySnapshot()
  const { props, view } = renderScreen({ initialProcedure: 'driveCurrent', snapshot, onCalibrationActivityChange })
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(false)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Настроить ток катушки' })))
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(true)
  view.rerender(<EddyCalibrationScreen {...props} snapshot={{ ...snapshot, klippy: { ...snapshot.klippy, state: 'startup' } }} />)
  const saved = { ...snapshot, calibration: { ...snapshot.calibration!, eddy: { ...snapshot.calibration!.eddy, driveCurrent: 7 } }, v2: { ...snapshot.v2, eddy: { ...snapshot.v2.eddy, calibration: { ...snapshot.v2.eddy.calibration, driveCurrentDone: true } } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={saved} />)
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(true)
  expect(screen.getByRole('heading', { name: 'Высота по бумаге' })).toBeInTheDocument()
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(true)
  view.rerender(<EddyCalibrationScreen {...props} initialProcedure="accuracy" snapshot={saved} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить повторяемость' })))
  act(() => receivePrinterGcodeResponse('probe accuracy results: maximum 0.052, minimum 0.040, range 0.012, average 0.045, median 0.045, standard deviation 0.004'))
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(false)
})

it('активная device-сессия скрывает навигацию до принятой и наблюдаемой отмены', async () => {
  const onCalibrationActivityChange = vi.fn<(active: boolean) => void>()
  const snapshot = readySnapshot()
  snapshot.calibration!.manualProbe.active = true
  const { props, view } = renderScreen({ initialProcedure: 'height', snapshot, onCalibrationActivityChange })
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(true)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Отменить ручное измерение' })))
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(true)
  view.rerender(<EddyCalibrationScreen {...props} snapshot={{ ...snapshot, calibration: { ...snapshot.calibration!, manualProbe: { ...snapshot.calibration!.manualProbe, active: false } } }} />)
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(false)
})

it('не снимает активность при неопределённом запуске; уход очищает callback', async () => {
  const onCalibrationActivityChange = vi.fn<(active: boolean) => void>()
  const { view } = renderScreen({ initialProcedure: 'screws', onCalibrationActivityChange, executeCommand: vi.fn<() => Promise<boolean>>().mockResolvedValue(false) })
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(false)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить винты' })))
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(true)
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  view.unmount()
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(false)
})

it('не возвращает навигацию после неподтверждённой отмены даже при inactive-снимке', async () => {
  const onCalibrationActivityChange = vi.fn<(active: boolean) => void>()
  const snapshot = readySnapshot()
  snapshot.calibration!.manualProbe.active = true
  const { props, view } = renderScreen({ initialProcedure: 'height', snapshot, onCalibrationActivityChange, executeCommand: vi.fn<() => Promise<boolean>>().mockResolvedValue(false) })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Отменить ручное измерение' })))
  view.rerender(<EddyCalibrationScreen {...props} snapshot={{ ...snapshot, calibration: { ...snapshot.calibration!, manualProbe: { ...snapshot.calibration!.manualProbe, active: false } } }} />)
  expect(onCalibrationActivityChange).toHaveBeenLastCalledWith(true)
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
})

it('сохраняет доступную аварийную остановку после результата винтов и при открытых подробностях', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.screws = { error: false, maxDeviationMm: 0.1, results: [[55, 40], [235, 40], [55, 222], [235, 222]].map(([xMm, yMm], index) => ({ name: `Винт ${index + 1}`, xMm, yMm, zMm: 0.1, isBase: index === 0, sign: index === 0 ? null : 'CW', adjust: '00:15' })) }
  const { props, view } = renderScreen({ initialProcedure: 'screws', snapshot })
  expect(screen.getByRole('button', { name: 'К списку' })).toBeEnabled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить винты' })))
  expect(screen.getByText('Результат замера')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Завершить' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Завершить' }))
  expect(props.onBackToList).toHaveBeenCalledOnce()
  expect(view.container.querySelectorAll('.eddy-footer button')).toHaveLength(3)
  expect(screen.getByRole('button', { name: 'Проверить выравнивание' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }))
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' }))
  expect(screen.getByRole('alertdialog', { name: 'Аварийная остановка' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Подтвердить остановку' })).toBeEnabled()
})
