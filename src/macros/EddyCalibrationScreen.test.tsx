import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockSnapshot } from '../../mocks/runtime'
import { receivePrinterGcodeResponse } from '../core/store/printerNotifications'
import type { ExecuteCommandArgs } from '../core/commands'
import type { PrinterCalibrationSnapshot } from '../core/transport/types'
import { EddyCalibrationScreen } from './EddyCalibrationScreen'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

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
    setOffsets: true,
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
}: {
  initialProcedure?: 'overview' | 'screws' | 'mesh' | 'firstLayer' | 'xyOffset' | 'accuracy' | 'temperature' | 'height' | 'driveCurrent' | 'z0' | 'offsets'
  snapshot?: ReturnType<typeof readySnapshot>
  executeCommand?: (args: ExecuteCommandArgs) => Promise<boolean>
  refreshEddyState?: () => Promise<boolean>
  getCommandBlockReason?: () => string | null
} = {}) {
  const props = { snapshot, pendingCommand: null, executeCommand, refreshEddyState, getCommandBlockReason, onBackToList: vi.fn(), initialProcedure }
  const view = render(<EddyCalibrationScreen {...props} />)
  return { props, view, executeCommand }
}

it('обзор показывает неизвестное состояние вместо прежних сохранённых флагов', () => {
  const snapshot = readySnapshot()
  snapshot.calibration = undefined
  snapshot.v2.eddy.calibration.requiredDone = true
  renderScreen({ snapshot })
  expect(screen.getByRole('button', { name: /Неизвестно.*Код тока катушки.*Неизвестно/ })).toBeInTheDocument()
  expect(screen.queryByText('обязательные шаги готовы')).not.toBeInTheDocument()
})

it('принимает температурную точку отдельно от завершения серии и блокирует выход из активной сессии', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.inTemperatureCalibration = true
  snapshot.calibration!.eddy.temperatureSeriesActive = true
  snapshot.v2.eddy.calibration.operatorPrompt = 'temperature_points'
  const { executeCommand } = renderScreen({ initialProcedure: 'temperature', snapshot })
  expect(screen.getByRole('button', { name: 'К списку макросов' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'К обзору' })).toBeDisabled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Принять текущую точку' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyTemperatureAccept' })
  expect(executeCommand).not.toHaveBeenCalledWith({ command: 'eddyTemperatureComplete' })
  expect(screen.getByText('Измерено точек: 0')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Завершить серию и сохранить' })).toBeDisabled()
})

it('не завершает температурную серию, если capability завершения не объявлена', () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.inTemperatureCalibration = true
  snapshot.calibration!.eddy.temperatureSeriesActive = true
  snapshot.calibration!.eddy.temperaturePoints = 3
  snapshot.capabilities.calibrationCommands!.temperatureComplete = false
  const { executeCommand } = renderScreen({ initialProcedure: 'temperature', snapshot })
  expect(screen.getByRole('button', { name: 'Завершить серию и сохранить' })).toBeDisabled()
  expect(executeCommand).not.toHaveBeenCalled()
})

it('завершает температурную серию только при реальных трёх точках и активном сеансе', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.temperatureSeriesActive = true
  snapshot.calibration!.eddy.temperaturePoints = 3
  const { executeCommand } = renderScreen({ initialProcedure: 'temperature', snapshot })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Завершить серию и сохранить' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyTemperatureComplete' })
})

it('не подтверждает сохранение температурной серии без установленного temperatureDone', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.temperatureSeriesActive = true
  snapshot.calibration!.eddy.temperaturePoints = 3
  const { props, view, executeCommand } = renderScreen({ initialProcedure: 'temperature', snapshot })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Завершить серию и сохранить' })))
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
  expect(screen.queryByText('Настройки подтверждены после перезапуска принтера.')).not.toBeInTheDocument()
  expect(screen.getByText(/Ждём перезапуск, готовность Klipper/)).toBeInTheDocument()
})

it('показывает PROBE_ACCURACY только после настоящего ответа Klipper', async () => {
  const { executeCommand } = renderScreen({ initialProcedure: 'accuracy' })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Запустить PROBE_ACCURACY' })))
  expect(screen.getByText('Ожидаем ответ Klipper…')).toBeInTheDocument()
  act(() => receivePrinterGcodeResponse('probe accuracy: probe at X: 10.000 Y: 10.000 Z: 0.100: range 0.012, average 0.040, median 0.040, standard deviation 0.004'))
  expect(screen.getByText('Размах 0.012 мм · среднее 0.040 мм · σ 0.004 мм')).toBeInTheDocument()
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyProbeAccuracy' })
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
  expect(screen.getByRole('button', { name: 'К списку макросов' })).toBeDisabled()
  const idle = { ...snapshot, calibration: { ...snapshot.calibration!, manualProbe: { ...snapshot.calibration!.manualProbe, active: false } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={idle} />)
  expect(screen.getByRole('button', { name: 'К списку макросов' })).toBeEnabled()
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
  expect(screen.queryByText('Настройки подтверждены после перезапуска принтера.')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'К списку макросов' })).toBeDisabled()
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
  expect(screen.getByRole('button', { name: 'К списку макросов' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'К обзору' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  await act(async () => resolveCommand(true))
  expect(screen.getByRole('button', { name: 'К списку макросов' })).toBeDisabled()
  expect(screen.queryByText('Настройки подтверждены после перезапуска принтера.')).not.toBeInTheDocument()
})

it('блокирует повтор и выход после deferred RPC false, не вызывая refresh и сохраняя emergency-stop', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.mesh.probedMatrix = [[0.1, 0.2], [0.3, 0.4]]
  let resolveCommand!: (accepted: boolean) => void
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>(() => new Promise((resolve) => { resolveCommand = resolve }))
  const refreshEddyState = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
  renderScreen({ initialProcedure: 'mesh', snapshot, executeCommand, refreshEddyState })
  fireEvent.click(screen.getByRole('button', { name: 'Сканировать карту без записи' }))
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
  await act(async () => resolveCommand(false))
  expect(refreshEddyState).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('Итог неизвестен')
  expect(screen.getByRole('button', { name: 'Сканировать карту без записи' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'К обзору' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'К списку макросов' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
})

it('оставляет блокировку и emergency-stop при rejected подготовительной команде', async () => {
  const snapshot = readySnapshot()
  snapshot.homedAxes = ''
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>().mockRejectedValue(new Error('Связь прервана'))
  renderScreen({ initialProcedure: 'height', snapshot, executeCommand })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подготовить XY и нижнюю Z-опору' })))
  expect(screen.getByRole('alert')).toHaveTextContent('Итог неизвестен')
  expect(screen.getByRole('button', { name: 'Подготовить XY и нижнюю Z-опору' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'К списку макросов' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
})

it('снимает неопределённость только после принятого emergency-stop, refresh и безопасного снимка', async () => {
  const snapshot = readySnapshot()
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>(async (args) => args.command === 'eddyScanMesh' ? false : true)
  const { props, view, executeCommand: command } = renderScreen({ initialProcedure: 'mesh', snapshot, executeCommand })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сканировать карту без записи' })))
  const uncertainWithManualSession = {
    ...snapshot,
    calibration: { ...snapshot.calibration!, manualProbe: { ...snapshot.calibration!.manualProbe, active: true } },
  }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={uncertainWithManualSession} />)
  fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подтвердить остановку' })))
  expect(command).toHaveBeenCalledWith({ command: 'emergencyStop' })
  expect(screen.getByRole('button', { name: 'К списку макросов' })).toBeDisabled()

  const recovered = {
    ...uncertainWithManualSession,
    calibration: { ...uncertainWithManualSession.calibration, manualProbe: { ...uncertainWithManualSession.calibration.manualProbe, active: false } },
  }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={recovered} />)
  expect(screen.getByText(/Аварийная остановка подтверждена/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'К списку макросов' })).toBeEnabled()
})

it('не снимает блокировку после неподтверждённого emergency-stop', async () => {
  const snapshot = readySnapshot()
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>().mockResolvedValue(false)
  renderScreen({ initialProcedure: 'mesh', snapshot, executeCommand })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сканировать карту без записи' })))
  fireEvent.click(screen.getByRole('button', { name: 'Аварийная остановка' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подтвердить остановку' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'emergencyStop' })
  expect(screen.getByRole('button', { name: 'К списку макросов' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Аварийная остановка' })).toBeEnabled()
})

it('показывает drive_current как код регистра без физических единиц', () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.driveCurrent = 7
  renderScreen({ initialProcedure: 'driveCurrent', snapshot })
  expect(screen.getByText('Значение регистра 0–31 без единиц измерения.')).toBeInTheDocument()
  expect(screen.getByText('7')).toBeInTheDocument()
  expect(screen.queryByText(/мА/)).not.toBeInTheDocument()
})

it('сохраняет Z-offset только после изменения и при ранее подтверждённой высотной калибровке', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.eddy.heightCalibrated = true
  const { executeCommand } = renderScreen({ initialProcedure: 'offsets', snapshot })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '+ 0,05 мм' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyZOffsetAdjust', deltaMm: 0.05 })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить сохранение Z-offset' })))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись и перезапуск' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyZOffsetSave' })
})

it('вводит XY-смещения через touch-клавиатуру, включая отрицательный знак, и ждёт подтверждения после перезапуска', async () => {
  const snapshot = readySnapshot()
  const { props, view, executeCommand } = renderScreen({ initialProcedure: 'xyOffset', snapshot })
  fireEvent.click(screen.getByRole('button', { name: 'Новое X-смещение, мм' }))
  fireEvent.click(screen.getByRole('button', { name: 'Очистить значение' }))
  fireEvent.click(screen.getByRole('button', { name: 'Цифра 0' }))
  fireEvent.click(screen.getByRole('button', { name: 'Десятичная точка' }))
  for (const digit of ['1', '2']) fireEvent.click(screen.getByRole('button', { name: `Цифра ${digit}` }))
  fireEvent.click(screen.getByRole('button', { name: 'Ввод' }))
  fireEvent.click(screen.getByRole('button', { name: 'Новое Y-смещение, мм' }))
  fireEvent.click(screen.getByRole('button', { name: 'Очистить значение' }))
  fireEvent.click(screen.getByRole('button', { name: 'Цифра 0' }))
  fireEvent.click(screen.getByRole('button', { name: 'Десятичная точка' }))
  for (const digit of ['0', '8']) fireEvent.click(screen.getByRole('button', { name: `Цифра ${digit}` }))
  fireEvent.click(screen.getByRole('button', { name: 'Изменить знак' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ввод' }))
  fireEvent.click(screen.getByRole('button', { name: 'Проверить изменения' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись и перезапуск' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddySetOffsets', xOffsetMm: 0.12, yOffsetMm: -0.08 })
  expect(screen.getByRole('status')).toHaveTextContent('Ждём перезапуск')
  const starting = { ...snapshot, klippy: { ...snapshot.klippy, state: 'startup' as const }, calibration: { ...snapshot.calibration!, eddy: { ...snapshot.calibration!.eddy, xOffsetMm: 0.12, yOffsetMm: -0.08 } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={starting} />)
  expect(screen.queryByText('Настройки подтверждены после перезапуска принтера.')).not.toBeInTheDocument()
  const ready = { ...starting, klippy: { ...starting.klippy, state: 'ready' as const } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={ready} />)
  expect(screen.getByText('Настройки подтверждены после перезапуска принтера.')).toBeInTheDocument()
})

it('сопоставляет тест первого слоя по полному пути и открывает babystep только для наблюдавшегося файла', async () => {
  const snapshot = readySnapshot()
  snapshot.printFiles = [{ id: 'first-layer', path: 'tests/bed.gcode', name: 'bed.gcode', directory: 'tests', printTime: '', weight: '', material: '', addedAt: '' }]
  const { props, view, executeCommand } = renderScreen({ initialProcedure: 'firstLayer', snapshot })
  fireEvent.change(screen.getByRole('combobox', { name: 'Файл теста' }), { target: { value: 'tests/bed.gcode' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Запустить выбранный тест' })))
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

it('показывает координаты Z0 отдельно и подтверждает успех после обновления этапа без ожидания перезапуска', async () => {
  const snapshot = readySnapshot()
  snapshot.v2.eddy.calibration.z0Done = false
  const executeCommand = vi.fn<(args: ExecuteCommandArgs) => Promise<boolean>>(async () => {
    receivePrinterGcodeResponse('Eddy Z0: probe=(125.0,128.5) tool=(125.0,158.5) offset=(0.0,-30.0)')
    return true
  })
  const { props, view } = renderScreen({ initialProcedure: 'z0', snapshot, executeCommand })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Проверить Z0' })))
  expect(screen.getByText(/Датчик \(125.0,128.5\)/)).toBeInTheDocument()
  expect(screen.queryByText('Подтверждено после команды')).not.toBeInTheDocument()
  const confirmed = { ...snapshot, v2: { ...snapshot.v2, eddy: { ...snapshot.v2.eddy, calibration: { ...snapshot.v2.eddy.calibration, z0Done: true, activeStep: 'screws' as const, operatorPrompt: 'verify_z0' as const } } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={confirmed} />)
  expect(screen.getByText('Подтверждено после команды')).toBeInTheDocument()
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
  expect(screen.getByText(/Датчик \(125.0,128.5\)/)).toBeInTheDocument()
  expect(screen.queryByText('Подтверждено после команды')).not.toBeInTheDocument()
  const reported = { ...snapshot, v2: { ...snapshot.v2, eddy: { ...snapshot.v2.eddy, calibration: { ...snapshot.v2.eddy.calibration, z0Done: true, activeStep: 'screws' as const, operatorPrompt: 'verify_z0' as const } } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={reported} />)
  expect(screen.queryByText('Подтверждено после команды')).not.toBeInTheDocument()
})

it('готовит XY и нижнюю Z-опору перед первичной высотной калибровкой', async () => {
  const snapshot = readySnapshot()
  snapshot.homedAxes = ''
  const { executeCommand } = renderScreen({ initialProcedure: 'height', snapshot })
  expect(screen.getByRole('button', { name: 'Начать проверку по бумаге' })).toBeDisabled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Подготовить XY и нижнюю Z-опору' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'homeXY' })
})

it('принимает повторную идентичную mesh-матрицу после принятой команды и успешного target refresh', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.mesh.profile = 'default'
  snapshot.calibration!.mesh.probedMatrix = [[0.1, 0.2], [0.3, 0.4]]
  const { props, view, executeCommand } = renderScreen({ initialProcedure: 'mesh', snapshot })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сканировать карту без записи' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'eddyScanMesh', save: false })
  expect(screen.getByRole('button', { name: 'Сохранить профиль и перезапустить' })).toBeEnabled()
  expect(screen.queryByText('Принтер не подтвердил команду. Результаты сохранены на экране.')).not.toBeInTheDocument()

  const measured = snapshot
  view.rerender(<EddyCalibrationScreen {...props} snapshot={measured} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль и перезапустить' })))
  expect(executeCommand).toHaveBeenCalledWith({ command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' })

  const starting = { ...measured, klippy: { ...measured.klippy, state: 'startup' as const }, calibration: { ...measured.calibration!, config: { savePending: true, pendingSections: ['bed_mesh default'] } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={starting} />)
  expect(screen.queryByText('Сохранённый профиль default совпадает с картой после перезапуска.')).not.toBeInTheDocument()
  const ready = { ...measured, calibration: { ...measured.calibration!, config: { savePending: false, pendingSections: [] }, mesh: { ...measured.calibration!.mesh, savedProfiles: { default: [[0.1, 0.2], [0.3, 0.4]] } } } }
  view.rerender(<EddyCalibrationScreen {...props} snapshot={ready} />)
  expect(screen.getByText('Сохранённый профиль default совпадает с картой после перезапуска.')).toBeInTheDocument()
})

it('не позволяет сохранять mesh, если target refresh сообщил об ошибке', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.mesh.probedMatrix = [[0.1, 0.2], [0.3, 0.4]]
  renderScreen({ initialProcedure: 'mesh', snapshot, refreshEddyState: vi.fn<() => Promise<boolean>>().mockResolvedValue(false) })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Сканировать карту без записи' })))
  expect(screen.queryByRole('button', { name: 'Сохранить профиль и перезапустить' })).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('актуальный снимок карты не обновился')
})

it('принимает идентичный результат винтов при успешном refresh и блокирует подтверждение при ошибке refresh', async () => {
  const snapshot = readySnapshot()
  snapshot.calibration!.screws.error = false
  snapshot.calibration!.screws.results = ['Передний левый', 'Передний правый', 'Задний левый', 'Задний правый'].map((name, index) => ({ name, xMm: index, yMm: index, zMm: 0.1, isBase: null, sign: '+', adjust: '00:01' }))
  const first = renderScreen({ initialProcedure: 'screws', snapshot })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить винты' })))
  expect(screen.getByRole('button', { name: 'Подтвердить после повторного замера' })).toBeEnabled()
  first.view.unmount()

  renderScreen({ initialProcedure: 'screws', snapshot, refreshEddyState: vi.fn<() => Promise<boolean>>().mockResolvedValue(false) })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Измерить винты' })))
  expect(screen.getByRole('button', { name: 'Подтвердить после повторного замера' })).toBeDisabled()
})
