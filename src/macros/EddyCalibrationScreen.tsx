import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type { TemperatureChartPoint } from '../control/types'
import type { PrinterSnapshot } from '../core/transport/types'
import { subscribePrinterGcodeResponses } from '../core/store/printerNotifications'
import { isPrintJobActive } from '../core/transport/types'
import { BABYSTEP_STEP_OPTIONS } from '../dashboard/config'
import { CalibrationPreview } from './CalibrationPreview'
import { EddyMeshDiagram, EddyNozzleDiagram, EddyScrewsDiagram, EddyScrewTurn } from './EddyCalibrationVisuals'
import { EDDY_TEST_Z_STEP_OPTIONS } from '@treed/printer-logic'
import { TemperatureTrendChart, joinClassNames, useModalFocus } from '../ui'
import './eddyCalibration.css'

type ProcedureId = 'overview' | 'driveCurrent' | 'height' | 'temperature' | 'z0' | 'offsets' | 'accuracy' | 'screws' | 'mesh' | 'firstLayer'
type SaveKind = 'driveCurrent' | 'height' | 'temperature' | 'mesh' | 'zOffset'
type EddyCalibrationScreenProps = {
  snapshot: PrinterSnapshot
  pendingCommand: PrinterCommandId | null
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  refreshEddyState: () => Promise<boolean>
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
  onBackToList: () => void
  onCalibrationActivityChange?: (active: boolean) => void
  initialProcedure?: ProcedureId
}

const PROCEDURES: Array<{ id: Exclude<ProcedureId, 'overview'>; title: string; detail: string }> = [
  { id: 'driveCurrent', title: 'Ток катушки', detail: 'Код настройки Eddy' },
  { id: 'height', title: 'Высота по бумаге', detail: 'Ручной TESTZ и подтверждение Z' },
  { id: 'temperature', title: 'Температурная серия', detail: 'Бумажные замеры и автоматическое сохранение' },
  { id: 'z0', title: 'Z0', detail: 'Проверка нулевой высоты' },
  { id: 'offsets', title: 'Смещение Z', detail: 'Изменение Z-offset с сохранением' },
  { id: 'accuracy', title: 'Повторяемость', detail: 'Результат PROBE_ACCURACY' },
  { id: 'screws', title: 'Винты стола', detail: 'Результаты замера и повторная проверка' },
  { id: 'mesh', title: 'Карта стола', detail: 'Профиль, границы и значения замера' },
  { id: 'firstLayer', title: 'Первый слой', detail: 'Подготовленный тестовый G-code' },
]

const READY = (snapshot: PrinterSnapshot) => snapshot.transport.state === 'online' && snapshot.klippy.state === 'ready'

function valueText(value: number | null | undefined, digits = 3, unit = 'мм'): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)} ${unit}` : '—'
}

function statusText(value: boolean | null | undefined): string {
  return value === true ? 'Подтверждено' : value === false ? 'Не настроено' : 'Неизвестно'
}

type AccuracyResult = { range: number; average: number; deviation: number }

function parseAccuracyResponse(message: string): AccuracyResult | null {
  if (!/probe accuracy/i.test(message)) return null
  const range = message.match(/\brange\s+([+-]?[\d.]+)/i)?.[1]
  const average = message.match(/\baverage\s+([+-]?[\d.]+)/i)?.[1]
  const deviation = message.match(/\bstandard deviation\s+([+-]?[\d.]+)/i)?.[1]
  if (!range || !average || !deviation || ![range, average, deviation].every((value) => Number.isFinite(Number(value)))) return null
  return { range: Number(range), average: Number(average), deviation: Number(deviation) }
}

function parseZ0Response(message: string): string | null {
  const match = message.match(/Eddy Z0:\s*probe=\(([^)]+)\)\s*tool=\(([^)]+)\)\s*offset=\(([^)]+)\)/i)
  if (!match) return null
  return `Датчик (${match[1]}) · сопло (${match[2]}) · смещение (${match[3]})`
}

function savedMeshMatches(matrix: Array<Array<number | null>>, saved: number[][] | undefined): boolean {
  return matrix.length > 0
    && saved !== undefined
    && saved.length === matrix.length
    && matrix.every((row, rowIndex) => row.length === saved[rowIndex]?.length
      && row.every((value, columnIndex) => value !== null && Math.abs(value - (saved[rowIndex]?.[columnIndex] ?? Number.NaN)) <= 0.000001))
}

function canonicalPrintPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

export function EddyCalibrationScreen({
  snapshot,
  pendingCommand,
  executeCommand,
  refreshEddyState,
  getCommandBlockReason,
  onBackToList,
  onCalibrationActivityChange,
  initialProcedure = 'overview',
}: EddyCalibrationScreenProps) {
  const calibration = snapshot.calibration
  const eddy = calibration?.eddy
  const [procedure, setProcedure] = useState<ProcedureId>(initialProcedure)
  const [message, setMessage] = useState('')
  const [saveKind, setSaveKind] = useState<SaveKind | null>(null)
  const [saveAccepted, setSaveAccepted] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [restartSeen, setRestartSeen] = useState(false)
  const [localCommandPending, setLocalCommandPending] = useState(false)
  const [emergencyPending, setEmergencyPending] = useState(false)
  const [confirmEmergency, setConfirmEmergency] = useState(false)
  const [confirmZOffsetSave, setConfirmZOffsetSave] = useState(false)
  const [operationUncertain, setOperationUncertain] = useState(false)
  const [heightNozzlePrepared, setHeightNozzlePrepared] = useState(false)
  const [accuracyResult, setAccuracyResult] = useState<AccuracyResult | null>(null)
  const [z0Result, setZ0Result] = useState<string | null>(null)
  const [z0CommandAccepted, setZ0CommandAccepted] = useState(false)
  const [z0RefreshRunId, setZ0RefreshRunId] = useState<number | null>(null)
  const [accuracyRunning, setAccuracyRunning] = useState(false)
  const [z0Running, setZ0Running] = useState(false)
  const [temperaturePoints, setTemperaturePoints] = useState({ nozzle: [] as TemperatureChartPoint[], bed: [] as TemperatureChartPoint[], eddy: [] as TemperatureChartPoint[] })
  const [screwsRefreshRunId, setScrewsRefreshRunId] = useState<number | null>(null)
  const [meshCommandFinished, setMeshCommandFinished] = useState(false)
  const [meshScanCommandAccepted, setMeshScanCommandAccepted] = useState(false)
  const [meshScanRefreshRunId, setMeshScanRefreshRunId] = useState<number | null>(null)
  const [meshScanRefreshPending, setMeshScanRefreshPending] = useState(false)
  const [meshSaveTarget, setMeshSaveTarget] = useState<Array<Array<number | null>> | null>(null)
  const [selectedFile, setSelectedFile] = useState('')
  const [firstLayerStartedPath, setFirstLayerStartedPath] = useState<string | null>(null)
  const [firstLayerObservedPath, setFirstLayerObservedPath] = useState<string | null>(null)
  const [babystepStep, setBabystepStep] = useState<number>(BABYSTEP_STEP_OPTIONS[1])
  const [zOffsetDelta, setZOffsetDelta] = useState(0)
  const [selectedScrew, setSelectedScrew] = useState(0)
  const [screwsRawVisible, setScrewsRawVisible] = useState(false)
  const [meshRow, setMeshRow] = useState(0)
  const [meshColumn, setMeshColumn] = useState(0)
  const [meshTableVisible, setMeshTableVisible] = useState(false)
  const [meshMethod, setMeshMethod] = useState<NonNullable<Extract<ExecuteCommandArgs, { command: 'eddyScanMesh' }>['method']>>('scan')
  const meshScanMethods = snapshot.capabilities.calibrationCommands?.meshScanMethods === true
  const meshScanArgs: ExecuteCommandArgs = { command: 'eddyScanMesh', save: false, ...(meshScanMethods ? { method: meshMethod } : {}) }
  const [detailsVisible, setDetailsVisible] = useState(false)
  const [completedSaveKind, setCompletedSaveKind] = useState<SaveKind | null>(null)
  const [screwsDoneRefreshRunId, setScrewsDoneRefreshRunId] = useState<number | null>(null)
  const [pipelineActive, setPipelineActive] = useState(() => calibration?.manualProbe.active === true || eddy?.temperatureSeriesActive === true || eddy?.inTemperatureCalibration === true)
  const [abortAccepted, setAbortAccepted] = useState(false)
  const workflowTerminatedRef = useRef(false)
  const activityCallbackRef = useRef(onCalibrationActivityChange)
  const backToListCallbackRef = useRef(onBackToList)
  useEffect(() => { activityCallbackRef.current = onCalibrationActivityChange }, [onCalibrationActivityChange])
  useEffect(() => { backToListCallbackRef.current = onBackToList }, [onBackToList])
  const heightBaseRef = useRef<number | null>(null)
  const emergencyButtonRef = useRef<HTMLButtonElement>(null)
  const commandRunIdRef = useRef(0)
  const heightPreparationRunIdRef = useRef(0)
  const temperatureAutoSaveAttemptedRef = useRef(false)
  const meshAutoSaveAttemptedRef = useRef(false)
  const meshScanRefreshPendingRef = useRef(false)
  const screwsDialogRef = useModalFocus<HTMLDivElement>(screwsRawVisible, () => setScrewsRawVisible(false))
  const accuracyRunningRef = useRef(false)
  const z0RunningRef = useRef(false)

  const ready = READY(snapshot)
  const activeManualSession = !workflowTerminatedRef.current && calibration?.manualProbe.active === true
  const activeTemperatureSession = !workflowTerminatedRef.current && (eddy?.temperatureSeriesActive === true || eddy?.inTemperatureCalibration === true)
  const temperatureCooling = activeTemperatureSession && snapshot.v2.eddy.calibration.operatorPrompt === 'cooling'
  const activeSession = activeManualSession || activeTemperatureSession
  useEffect(() => {
    if (!workflowTerminatedRef.current && activeSession) setPipelineActive(true)
  }, [activeSession])
  useEffect(() => {
    onCalibrationActivityChange?.(!workflowTerminatedRef.current && (pipelineActive || activeSession))
  }, [pipelineActive, activeSession, onCalibrationActivityChange])
  useEffect(() => () => activityCallbackRef.current?.(false), [])
  const manualZ = calibration?.manualProbe.zMm
  useEffect(() => {
    if (!activeManualSession) heightBaseRef.current = null
    else if (heightBaseRef.current === null && typeof manualZ === 'number' && Number.isFinite(manualZ)) heightBaseRef.current = manualZ
  }, [activeManualSession, manualZ])
  const confirmedHeightDelta = activeManualSession && typeof manualZ === 'number' && Number.isFinite(manualZ)
    ? manualZ - (heightBaseRef.current ?? manualZ) : null
  const allAxesHomed = ['x', 'y', 'z'].every((axis) => snapshot.homedAxes.toLowerCase().includes(axis))
  useEffect(() => {
    if (!ready || procedure !== 'height') {
      heightPreparationRunIdRef.current += 1
      setHeightNozzlePrepared(false)
    } else if (!allAxesHomed) setHeightNozzlePrepared(false)
  }, [ready, allAxesHomed, procedure])
  const z0Confirmed = z0CommandAccepted
    && z0RefreshRunId === commandRunIdRef.current
    && snapshot.v2.eddy.calibration.z0Done
    && snapshot.v2.eddy.calibration.activeStep === 'screws'
    && snapshot.v2.eddy.calibration.operatorPrompt === 'verify_z0'
  const isBusy = pendingCommand !== null || localCommandPending || meshScanRefreshPending
  useEffect(() => {
    if (!abortAccepted || isBusy || operationUncertain || saveKind !== null || !ready) return
    if (calibration?.manualProbe.active !== false || eddy?.inTemperatureCalibration !== false || eddy?.temperatureSeriesActive !== false) return
    setAbortAccepted(false)
    setPipelineActive(false)
  }, [abortAccepted, isBusy, operationUncertain, saveKind, ready, calibration?.manualProbe.active, eddy?.inTemperatureCalibration, eddy?.temperatureSeriesActive])
  const backBlocked = isBusy || activeSession || saveKind !== null || operationUncertain || accuracyRunning || z0Running || procedure === 'z0' && z0CommandAccepted && !z0Confirmed
  const calibrationAvailable = snapshot.capabilities.eddy === true && eddy?.available === true
  const blockCalibration = !calibrationAvailable
    ? 'Калибровка Eddy недоступна или её состояние неизвестно.'
    : !ready
      ? 'Нужно подключение к готовому принтеру.'
      : isPrintJobActive(snapshot.printJob)
        ? 'Завершите печать перед калибровкой.'
        : pendingCommand !== null
          ? 'Дождитесь завершения текущей команды.'
          : null
  const accuracyCapability = snapshot.capabilities.calibrationCommands?.probeAccuracy === true
  const temperatureAcceptCapability = snapshot.capabilities.calibrationCommands?.temperatureAccept === true
  const temperatureCompleteCapability = snapshot.capabilities.calibrationCommands?.temperatureComplete === true
  const abortCapability = snapshot.capabilities.calibrationCommands?.abort === true
  const zAdjustCapability = snapshot.capabilities.calibrationCommands?.zOffsetAdjust === true
  const zSaveCapability = snapshot.capabilities.calibrationCommands?.zOffsetSave === true
  const temperatureAcceptReason = commandReason({ command: 'eddyTemperatureAccept' }, temperatureAcceptCapability)
    ?? (eddy?.temperatureSeriesActive !== true ? 'Температурная серия не подтверждена в текущем статусе принтера.' : null)
    ?? (eddy?.inTemperatureCalibration !== true ? 'Активная температурная калибровка не подтверждена.' : null)
    ?? (!activeManualSession ? 'Klipper ещё не запросил бумажный замер.' : null)
    ?? (snapshot.v2.eddy.calibration.operatorPrompt !== 'temperature_points' ? 'Klipper ещё не запросил температурную точку.' : null)
  const temperatureCompleteReason = commandReason({ command: 'eddyTemperatureComplete' }, temperatureCompleteCapability)
    ?? (eddy?.temperatureSeriesActive !== true ? 'Температурная серия не подтверждена в текущем статусе принтера.' : null)
    ?? (eddy?.temperaturePoints == null ? 'Количество точек неизвестно; обновите состояние принтера.' : eddy.temperaturePoints < 3 ? 'Нужно принять не менее трёх температурных точек.' : null)
    ?? (calibration?.manualProbe.active !== false ? 'Статус ручного измерения неизвестен или оно ещё активно.' : null)
  const temperatureSeriesFinished = !temperatureCooling && eddy?.temperatureSeriesActive === true && eddy.inTemperatureCalibration === false
    && (eddy.temperaturePoints ?? 0) >= 3
    && calibration?.manualProbe.active === false
  const temperatureCurveReady = temperatureSeriesFinished && calibration?.config.savePending === true
    && calibration.config.pendingSections.includes('temperature_probe btt_eddy')
  const temperatureCompletionIssue = temperatureSeriesFinished
    ? !temperatureCurveReady ? 'Klipper не сформировал температурную кривую. Отмените серию и проверьте сообщения принтера.' : temperatureCompleteReason
    : null

  useEffect(() => {
    setProcedure(initialProcedure)
  }, [initialProcedure])

  useEffect(() => subscribePrinterGcodeResponses((response) => {
    if (accuracyRunningRef.current) {
      const result = parseAccuracyResponse(response)
      if (result !== null) {
        setAccuracyResult(result)
        setAccuracyRunning(false)
        accuracyRunningRef.current = false
      }
    }
    if (z0RunningRef.current) {
      const result = parseZ0Response(response)
      if (result !== null) setZ0Result(result)
    }
  }), [])

  useEffect(() => {
    if (saveKind === null) return
    if (!ready) setRestartSeen(true)
    const saveFinished = saveAccepted
      && restartSeen
      && ready
      && calibration?.config.savePending === false
      && calibration.config.pendingSections.length === 0
      && (saveKind !== 'driveCurrent' || (snapshot.v2.eddy.calibration.driveCurrentDone && typeof eddy?.driveCurrent === 'number' && Number.isFinite(eddy.driveCurrent)))
      && (saveKind !== 'height' || (calibration?.manualProbe.active === false && eddy?.heightCalibrated === true))
      && (saveKind !== 'temperature' || (eddy?.inTemperatureCalibration === false && eddy?.temperatureSeriesActive === false && snapshot.v2.eddy.calibration.temperatureDone === true))
      && (saveKind !== 'mesh' || (meshSaveTarget !== null && savedMeshMatches(meshSaveTarget, calibration?.mesh.savedProfiles.default)))
      && (saveKind !== 'zOffset' || eddy?.heightCalibrated === true)
    if (saveFinished) {
      const completedKind = saveKind
      setCompletedSaveKind(completedKind)
      setSaveKind(null)
      setSaveAccepted(false)
      setSaveError('')
      if (completedKind === 'zOffset') setConfirmZOffsetSave(false)
      if (saveKind === 'zOffset') setZOffsetDelta(0)
      setMessage(completedKind === 'mesh'
        ? 'Карта сохранена. Калибровка завершена успешно.'
        : 'Настройки сохранены. Калибровка завершена успешно.')
      if (completedKind === 'mesh') setMeshCommandFinished(true)
      void refreshEddyState()
    }
  }, [saveAccepted, saveKind, restartSeen, ready, calibration?.config.savePending, calibration?.config.pendingSections.length, calibration?.manualProbe.active, eddy?.driveCurrent, eddy?.heightCalibrated, eddy?.inTemperatureCalibration, eddy?.temperatureSeriesActive, snapshot.v2.eddy.calibration.driveCurrentDone, snapshot.v2.eddy.calibration.temperatureDone, snapshot.v2.eddy.calibration.z0Done, snapshot.v2.eddy.calibration.activeStep, snapshot.v2.eddy.calibration.operatorPrompt, calibration?.mesh.savedProfiles, eddy?.zOffsetMm, eddy?.temperaturePoints, zOffsetDelta, meshSaveTarget, refreshEddyState])

  useEffect(() => {
    if (saveKind === null) return
    const timeout = window.setTimeout(() => {
      commandRunIdRef.current += 1
      setOperationUncertain(true)
      setSaveError('Ответ команды или итоговое состояние не получены. Операция остаётся неопределённой: проверьте принтер вручную; повторный запуск и выход заблокированы.')
    }, 90_000)
    return () => window.clearTimeout(timeout)
  }, [saveKind])

  useEffect(() => {
    if (procedure !== 'temperature' || !ready) return
    const timestamp = Date.now()
    setTemperaturePoints((current) => {
      if (timestamp - (current.nozzle.at(-1)?.timestamp ?? 0) < 1000) return current
      const keep = (points: TemperatureChartPoint[], temperature: number | null | undefined, target: number) => typeof temperature === 'number' && Number.isFinite(temperature)
        ? [...points.slice(-899), { timestamp, current: temperature, target }]
        : points
      return {
        nozzle: keep(current.nozzle, snapshot.extruderTemp, snapshot.thermalTargets.nozzle),
        bed: keep(current.bed, snapshot.bedTemp, snapshot.thermalTargets.bed),
        eddy: keep(current.eddy, eddy?.temperatureC, 0),
      }
    })
  }, [procedure, ready, snapshot.extruderTemp, snapshot.bedTemp, eddy?.temperatureC, snapshot.thermalTargets.nozzle, snapshot.thermalTargets.bed, snapshot.updatedAt])

  useEffect(() => {
    if (firstLayerStartedPath === null || !isPrintJobActive(snapshot.printJob)) return
    if (canonicalPrintPath(snapshot.printJob.filename) === firstLayerStartedPath) setFirstLayerObservedPath(firstLayerStartedPath)
  }, [firstLayerStartedPath, snapshot.printJob])

  useEffect(() => {
    if (!accuracyRunning && !z0Running) return
    const timeout = window.setTimeout(() => {
      accuracyRunningRef.current = false
      z0RunningRef.current = false
      setAccuracyRunning(false)
      setZ0Running(false)
      setMessage('Klipper не прислал результат измерения. Исходные данные не изменены; проверьте журнал перед повтором.')
    }, 90_000)
    return () => window.clearTimeout(timeout)
  }, [accuracyRunning, z0Running])

  useEffect(() => {
    if (!confirmEmergency) return
    emergencyButtonRef.current?.focus()
  }, [confirmEmergency])

  const terminateWorkflow = useCallback(() => {
    if (workflowTerminatedRef.current) return
    workflowTerminatedRef.current = true
    commandRunIdRef.current += 1
    heightPreparationRunIdRef.current += 1
    accuracyRunningRef.current = false
    z0RunningRef.current = false
    setPipelineActive(false)
    setLocalCommandPending(false)
    setEmergencyPending(false)
    setSaveKind(null)
    setSaveAccepted(false)
    setAccuracyRunning(false)
    setZ0Running(false)
    setZ0CommandAccepted(false)
    setMeshScanCommandAccepted(false)
    setMeshScanRefreshRunId(null)
    meshScanRefreshPendingRef.current = false
    setMeshScanRefreshPending(false)
    setMeshSaveTarget(null)
    setOperationUncertain(false)
    setSaveError('')
    setMessage('')
    setAbortAccepted(false)
    activityCallbackRef.current?.(false)
    backToListCallbackRef.current()
  }, [])

  useEffect(() => {
    if (workflowTerminatedRef.current || !pipelineActive) return
    if (snapshot.klippy.state === 'shutdown' || snapshot.klippy.state === 'error') terminateWorkflow()
  }, [pipelineActive, snapshot.klippy.state, terminateWorkflow])

  const run = useCallback(async (args: ExecuteCommandArgs, refreshOnAccept = true): Promise<boolean> => {
    if (workflowTerminatedRef.current) return false
    const isEmergencyStop = args.command === 'emergencyStop'
    if (operationUncertain && !isEmergencyStop) return false
    if (localCommandPending && !isEmergencyStop) return false
    const reason = getCommandBlockReason(args.command, args)
    if (reason !== null) {
      setMessage(reason)
      return false
    }
    const commandRunId = ++commandRunIdRef.current
    if (args.command === 'eddyTemperatureStart') temperatureAutoSaveAttemptedRef.current = false
    if (args.command === 'eddyPrimaryHeightStart') setHeightNozzlePrepared(false)
    if (args.command.startsWith('eddy') && args.command !== 'eddyAbort' || args.command === 'homeXY' || args.command === 'serviceMode' || args.command === 'start') {
      setPipelineActive(true)
      setAbortAccepted(false)
    }
    setCompletedSaveKind(null)
    setMessage('')
    setSaveError('')
    setLocalCommandPending(true)
    try {
      const accepted = await executeCommand(args)
      if (commandRunId !== commandRunIdRef.current) return false
      if (accepted) {
        if (args.command === 'eddyAbort') setAbortAccepted(true)
        if (refreshOnAccept) void refreshEddyState()
      } else {
        setOperationUncertain(true)
        setSaveError('Принтер не подтвердил выполнение команды. Итог неизвестен; повторный запуск и выход заблокированы.')
      }
      return accepted
    } catch (cause) {
      if (commandRunId !== commandRunIdRef.current) return false
      setMessage(cause instanceof Error ? cause.message : 'Команда не выполнена. Проверьте связь с принтером.')
      setOperationUncertain(true)
      setSaveError('Не получен надёжный ответ команды. Итог неизвестен; повторный запуск и выход заблокированы.')
      return false
    } finally {
      if (commandRunId === commandRunIdRef.current) setLocalCommandPending(false)
    }
  }, [operationUncertain, localCommandPending, getCommandBlockReason, executeCommand, refreshEddyState])

  async function prepareHeightNozzle() {
    const preparationRunId = ++heightPreparationRunIdRef.current
    setHeightNozzlePrepared(false)
    if (await run({ command: 'serviceMode' }) && preparationRunId === heightPreparationRunIdRef.current) setHeightNozzlePrepared(true)
  }

  const beginSave = useCallback(async (kind: SaveKind, args: ExecuteCommandArgs): Promise<boolean> => {
    if (blockCalibration !== null) {
      setMessage(blockCalibration)
      return false
    }
    setSaveKind(kind)
    setCompletedSaveKind(null)
    setSaveAccepted(false)
    setRestartSeen(false)
    setSaveError('')
    const expectedRunId = commandRunIdRef.current + 1
    const accepted = await run(args)
    if (commandRunIdRef.current > expectedRunId) return false
    if (commandRunIdRef.current === expectedRunId && accepted) {
      setSaveAccepted(true)
      return true
    }
    setSaveKind(null)
    return false
  }, [blockCalibration, run])

  useEffect(() => {
    if (procedure !== 'temperature' || !temperatureCurveReady || temperatureCompleteReason !== null
        || !ready || isBusy || operationUncertain || saveKind !== null || blockCalibration !== null
        || temperatureAutoSaveAttemptedRef.current) return
    temperatureAutoSaveAttemptedRef.current = true
    void beginSave('temperature', { command: 'eddyTemperatureComplete' })
  }, [procedure, temperatureCurveReady, temperatureCompleteReason, ready, isBusy, operationUncertain, saveKind, blockCalibration, beginSave])

  async function runProbe(command: 'eddyProbeAccuracy' | 'eddyCheckZ0') {
    if (blockCalibration !== null) {
      setMessage(blockCalibration)
      return
    }
    if (command === 'eddyProbeAccuracy') {
      setAccuracyRunning(true)
      accuracyRunningRef.current = true
    } else {
      setZ0CommandAccepted(false)
      setZ0RefreshRunId(null)
      setZ0Result(null)
      setZ0Running(true)
      z0RunningRef.current = true
    }
    const expectedRunId = commandRunIdRef.current + 1
    const accepted = await run({ command }, command !== 'eddyCheckZ0')
    if (commandRunIdRef.current > expectedRunId) return
    if (!accepted) {
      if (command === 'eddyProbeAccuracy') {
        setAccuracyRunning(false)
        accuracyRunningRef.current = false
      } else {
        setZ0Running(false)
        z0RunningRef.current = false
      }
    } else if (command === 'eddyCheckZ0') {
      setZ0CommandAccepted(true)
      setZ0Running(false)
      z0RunningRef.current = false
      const refreshed = await refreshEddyState()
      if (commandRunIdRef.current === expectedRunId && refreshed) setZ0RefreshRunId(expectedRunId)
      else if (commandRunIdRef.current === expectedRunId) {
        setZ0CommandAccepted(false)
        setMessage('Команда Z0 принята, но обновлённый статус принтера не подтверждён. Проверьте связь и повторите проверку.')
      }
    }
  }

  async function runScrewsMeasurement() {
    const runId = commandRunIdRef.current + 1
    setScrewsRefreshRunId(null)
    setScrewsDoneRefreshRunId(null)
    if (!await run({ command: 'eddyScrewsTiltStart' }, false) || commandRunIdRef.current !== runId) return
    const refreshed = await refreshEddyState()
    if (commandRunIdRef.current !== runId) return
    if (refreshed) setScrewsRefreshRunId(runId)
    else setMessage('Команда винтов принята, но актуальный снимок результата не обновился.')
  }

  async function finishScrews() {
    if (!screwsFresh || blockCalibration !== null) return
    const runId = commandRunIdRef.current + 1
    setScrewsDoneRefreshRunId(null)
    if (!await run({ command: 'eddyScrewsTiltDone' }, false) || commandRunIdRef.current !== runId) return
    const refreshed = await refreshEddyState()
    if (refreshed && commandRunIdRef.current === runId) setScrewsDoneRefreshRunId(runId)
    else if (commandRunIdRef.current === runId) setMessage('Подтверждение винтов принято, но актуальный статус не получен.')
  }

  async function runMeshScan() {
    if (workflowTerminatedRef.current || meshScanRefreshPendingRef.current || saveKind !== null || blockCalibration !== null) return
    const runId = commandRunIdRef.current + 1
    meshAutoSaveAttemptedRef.current = false
    meshScanRefreshPendingRef.current = true
    setMeshScanRefreshPending(true)
    setMeshScanCommandAccepted(false)
    setMeshScanRefreshRunId(null)
    setMeshCommandFinished(false)
    setMeshSaveTarget(null)
    if (!await run(meshScanArgs, false) || commandRunIdRef.current !== runId) {
      if (commandRunIdRef.current < runId) {
        meshScanRefreshPendingRef.current = false
        setMeshScanRefreshPending(false)
      }
      return
    }
    setMeshScanCommandAccepted(true)
    let refreshed = false
    try {
      refreshed = await refreshEddyState()
    } catch {
      if (commandRunIdRef.current === runId) setMessage('Сканирование завершилось, но актуальный снимок карты не обновился.')
    }
    if (commandRunIdRef.current !== runId) return
    if (refreshed) setMeshScanRefreshRunId(runId)
    else {
      setMessage('Сканирование завершилось, но актуальный снимок карты не обновился.')
      meshScanRefreshPendingRef.current = false
      setMeshScanRefreshPending(false)
    }
  }

  async function stopEmergency(): Promise<void> {
    if (emergencyPending) return
    setConfirmEmergency(false)
    setEmergencyPending(true)
    setOperationUncertain(true)
    accuracyRunningRef.current = false
    z0RunningRef.current = false
    setAccuracyRunning(false)
    setZ0Running(false)
    setZ0CommandAccepted(false)
    if (saveKind !== null || localCommandPending || meshScanRefreshPendingRef.current) {
      commandRunIdRef.current += 1
      setOperationUncertain(true)
      setSaveError('Аварийная остановка отправлена во время незавершённой операции. Её итог неизвестен; повторный запуск и выход заблокированы.')
      if (meshScanRefreshPendingRef.current && !localCommandPending) {
        meshScanRefreshPendingRef.current = false
        setMeshScanRefreshPending(false)
      }
    }
    setSaveKind(null)
    setSaveAccepted(false)
    setSaveError('')
    try {
      const accepted = await run({ command: 'emergencyStop' }, false)
      if (!accepted) return
      terminateWorkflow()
    } finally {
      setEmergencyPending(false)
    }
  }

  function commandReason(args: ExecuteCommandArgs, featureAvailable = true): string | null {
    if (!featureAvailable) return 'Эта команда не объявлена в возможностях подключённого принтера.'
    return getCommandBlockReason(args.command, args)
  }

  function commandButton(label: string, args: ExecuteCommandArgs, options: { primary?: boolean; secondary?: boolean; blocked?: boolean; reason?: string | null; onClick?: () => void } = {}) {
    const reason = options.reason ?? commandReason(args)
    const disabledReason = reason
      ?? (operationUncertain ? 'Сначала проверьте состояние принтера.' : isBusy ? 'Дождитесь завершения текущей команды.' : options.blocked ? 'Действие пока недоступно. Проверьте состояние этапа.' : null)
    return (
      <span className="eddy-command">
        <button
          type="button"
          className={joinClassNames('eddy-btn', options.primary && 'is-primary', options.secondary && 'is-secondary')}
          disabled={options.blocked || isBusy || operationUncertain || reason !== null}
          title={operationUncertain ? 'Операция принтера остаётся неопределённой.' : reason ?? undefined}
          onClick={options.onClick ?? (() => void run(args))}
        >
          {label}
        </button>
        {disabledReason && args.command === 'eddyZOffsetAdjust' && <small className="eddy-command-reason">{disabledReason}</small>}
      </span>
    )
  }

  function openProcedure(next: ProcedureId) {
    setMessage('')
    setDetailsVisible(false)
    setProcedure(next)
  }

  async function startFirstLayerTest() {
    if (!printStartArgs || selectedCalibrationFile === undefined) return
    const expectedRunId = commandRunIdRef.current + 1
    setFirstLayerStartedPath(null)
    setFirstLayerObservedPath(null)
    const accepted = await run(printStartArgs)
    if (accepted && commandRunIdRef.current === expectedRunId) {
      setFirstLayerStartedPath(canonicalPrintPath(selectedCalibrationFile.path))
    }
  }

  const zOffsetSaveReason = !zSaveCapability
    ? commandReason({ command: 'eddyZOffsetSave' }, zSaveCapability)
    : zOffsetDelta === 0
      ? 'Сначала скорректируйте высоту кнопками − и +.'
      : eddy?.heightCalibrated !== true
        ? 'Сначала подтвердите высотную калибровку Eddy.'
        : commandReason({ command: 'eddyZOffsetSave' }, zSaveCapability)
  const selectedCalibrationFile = snapshot.printFiles.find((file) => file.path === selectedFile)
  const printStartArgs: ExecuteCommandArgs | null = selectedCalibrationFile === undefined ? null : { command: 'start', filename: selectedCalibrationFile.path }
  const activePrint = isPrintJobActive(snapshot.printJob)
  const observedPrintPath = canonicalPrintPath(snapshot.printJob.filename)
  const activeCalibrationPrint = activePrint && firstLayerStartedPath !== null
    && firstLayerObservedPath === firstLayerStartedPath
    && observedPrintPath === firstLayerObservedPath
  const probedMatrix = useMemo(() => calibration?.mesh.probedMatrix ?? [], [calibration?.mesh.probedMatrix])
  const matrix = probedMatrix.length > 0 ? probedMatrix : calibration?.mesh.meshMatrix ?? []
  const matrixIsLatestProbe = probedMatrix.length > 0
  const meshScanHasNewMatrix = meshScanCommandAccepted
    && meshScanRefreshRunId !== null
    && meshScanRefreshRunId === commandRunIdRef.current
    && probedMatrix.length > 0
    && probedMatrix.every((row) => row.length > 0 && row.length === probedMatrix[0]?.length && row.every((value) => typeof value === 'number' && Number.isFinite(value)))
  useEffect(() => {
    if (procedure !== 'mesh' || !meshScanRefreshPending || meshScanRefreshRunId !== commandRunIdRef.current) return
    if (!meshScanHasNewMatrix || !ready || operationUncertain || saveKind !== null || blockCalibration !== null
        || workflowTerminatedRef.current || meshAutoSaveAttemptedRef.current) {
      meshScanRefreshPendingRef.current = false
      setMeshScanRefreshPending(false)
      return
    }
    if (pendingCommand !== null || localCommandPending) return
    meshAutoSaveAttemptedRef.current = true
    meshScanRefreshPendingRef.current = false
    setMeshScanRefreshPending(false)
    setMeshSaveTarget(probedMatrix)
    void beginSave('mesh', { command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' })
  }, [procedure, meshScanRefreshPending, meshScanRefreshRunId, meshScanHasNewMatrix, probedMatrix, ready, operationUncertain, saveKind, blockCalibration, pendingCommand, localCommandPending, beginSave])
  const measuredMeshValues = matrix.flatMap((row) => row.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)))
  const measuredMeshMin = measuredMeshValues.length > 0 ? Math.min(...measuredMeshValues) : null
  const measuredMeshMax = measuredMeshValues.length > 0 ? Math.max(...measuredMeshValues) : null
  const screws = calibration?.screws
  const selectedScrewIndex = Math.min(selectedScrew, Math.max(0, (screws?.results.length ?? 0) - 1))
  const screw = screws?.results[selectedScrewIndex]
  const meshColumns = Math.max(0, ...matrix.map((row) => row.length))
  const selectedMeshRow = Math.min(meshRow, Math.max(0, matrix.length - 1))
  const selectedMeshColumn = Math.min(meshColumn, Math.max(0, meshColumns - 1))
  const screwsFresh = screwsRefreshRunId !== null
    && screwsRefreshRunId === commandRunIdRef.current
    && (screws?.results.length ?? 0) >= 4
    && screws?.error === false
  const screwsConfirmed = screwsDoneRefreshRunId !== null && screwsDoneRefreshRunId === commandRunIdRef.current && snapshot.v2.eddy.calibration.screwsDone && snapshot.v2.eddy.calibration.activeStep === 'mesh' && screws?.error === false && screws.results.length >= 4
  const driveCurrentConfirmed = completedSaveKind === 'driveCurrent' && snapshot.v2.eddy.calibration.driveCurrentDone && typeof eddy?.driveCurrent === 'number' && Number.isFinite(eddy.driveCurrent)
  const recommendation: ProcedureId = saveKind === 'height' || activeManualSession ? 'height'
    : saveKind === 'temperature' || activeTemperatureSession ? 'temperature'
      : saveKind === 'mesh' ? 'mesh'
        : !snapshot.v2.eddy.calibration.driveCurrentDone ? 'driveCurrent'
          : !snapshot.v2.eddy.calibration.primaryDone ? 'height'
            : !snapshot.v2.eddy.calibration.temperatureDone ? 'temperature'
              : !snapshot.v2.eddy.calibration.z0Done ? 'z0'
                : !snapshot.v2.eddy.calibration.screwsDone ? 'screws'
                  : !snapshot.v2.eddy.calibration.meshDone || !snapshot.v2.eddy.calibration.requiredDone ? 'mesh' : 'firstLayer'

  function renderOverview() {
    const cards = [
      { id: 'driveCurrent' as const, label: 'Ток катушки', state: snapshot.v2.eddy.calibration.driveCurrentDone ? 'Настроено' : 'Не настроено' },
      { id: 'height' as const, label: 'Высота Eddy', state: snapshot.v2.eddy.calibration.primaryDone ? 'Настроено' : 'Не настроено' },
      { id: 'temperature' as const, label: 'Температура', state: snapshot.v2.eddy.calibration.temperatureDone ? 'Настроено' : 'Не настроено' },
      { id: 'z0' as const, label: 'Z0', state: snapshot.v2.eddy.calibration.z0Done ? 'Подтверждено' : 'Не настроено' },
      { id: 'offsets' as const, label: 'Смещение Z', state: eddy?.zOffsetMm == null ? 'Не настроено' : 'Есть значение' },
      { id: 'accuracy' as const, label: 'Повторяемость', state: accuracyResult === null ? 'Не запускалось' : 'Есть замер' },
      { id: 'screws' as const, label: 'Винты стола', state: screws?.error == null ? 'Не запускалось' : screws.error ? 'Есть ошибка' : 'Есть замер' },
      { id: 'mesh' as const, label: 'Карта стола', state: measuredMeshValues.length > 0 ? 'Есть замер' : 'Не запускалось' },
    ]
    return (
      <>
        <section className="eddy-overview-grid" aria-label="Фактическое состояние калибровок">
          {cards.map((card) => (
            <button className="eddy-overview-card" key={card.id} type="button" onClick={() => openProcedure(card.id)}>
              <CalibrationPreview kind={card.id} compact />
              <strong>{card.label}</strong>
              <span className="eddy-card-state">{card.state}</span>
            </button>
          ))}
        </section>
      </>
    )
  }

  function renderDetails() {
    const content = procedure === 'driveCurrent' ? <><p>Регистр 0–31 · без единиц измерения. Значение настройки получено от Klipper.</p><div className="eddy-metric"><span>Код тока</span><strong>{eddy?.driveCurrent == null ? '—' : String(eddy.driveCurrent)}</strong></div></>
      : procedure === 'height' ? <><p>min {valueText(calibration?.manualProbe.zMinimumMm)} · max {valueText(calibration?.manualProbe.zMaximumMm)}</p><p>ΔZ {confirmedHeightDelta === null ? '—' : `${confirmedHeightDelta > 0 ? '+' : ''}${confirmedHeightDelta.toFixed(3)} мм`} с начала проверки, по статусу Klipper.</p><p>Схема положения; фактический зазор не измеряется. Оси: {snapshot.homedAxes.toUpperCase() || 'Нет'}.</p></>
        : procedure === 'temperature' ? <><p>Расширение {valueText(eddy?.estimatedExpansionMm)}</p><p>Компенсация: {statusText(eddy?.compensationEnabled)}. Точки принимаются отдельно, завершение записывает результат и перезапускает Klipper.</p></>
          : procedure === 'z0' ? <><p>Команда выполняет G28 и проверку Z0. Подтверждение — по обновлённому этапу Klipper, не по предварительным координатам.</p>{z0Result && <p>{z0Result}</p>}</>
            : procedure === 'offsets' ? <><p>Сумма принятых UI-команд, не абсолютный Z-offset. В конфиге: {valueText(eddy?.zOffsetMm)}.</p><p>Высота: {statusText(eddy?.heightCalibrated)}. Запись подтверждается после перезапуска и очистки несохранённых изменений.</p></>
              : procedure === 'accuracy' ? <><p>Среднее {valueText(accuracyResult?.average)}</p><p>σ {valueText(accuracyResult?.deviation)}</p><p>Значения из ответа PROBE_ACCURACY этой сессии. Порог качества не задан.</p></>
                : procedure === 'screws' ? <><p>Z выбранного винта {valueText(screw?.zMm)} · отклонение {valueText(screws?.maxDeviationMm)}</p><p>{screwsFresh ? 'Принятый замер и обновлённый снимок.' : 'Последние доступные данные.'} Направление показано со стороны головки винта. Поворот — обороты:минуты, не время.</p><button type="button" onClick={() => setScrewsRawVisible(true)}>Все данные замера</button></>
                  : procedure === 'mesh' ? <><p>Сканирование сохранит новый профиль и перезапустит Klipper автоматически. Подтверждение будет показано после проверки карты из сохранённого профиля.</p><p>min {valueText(measuredMeshMin)} · max {valueText(measuredMeshMax)}</p><p>X {calibration?.mesh.min?.[0] ?? '—'}…{calibration?.mesh.max?.[0] ?? '—'} мм · Y {calibration?.mesh.min?.[1] ?? '—'}…{calibration?.mesh.max?.[1] ?? '—'} мм</p><p>{matrix.length} строк × {meshColumns} столбцов · {matrixIsLatestProbe ? 'последние доступные значения сканирования' : 'загруженный профиль стола'}. Z увеличен для наглядности; пропуски не являются нулями.</p></>
                      : <><p>Слой {snapshot.printJob.currentLayer ?? '—'} / {snapshot.printJob.totalLayer ?? '—'} · координата Z {valueText(snapshot.toolheadZ)}</p><p>Качество слоя оценивает оператор; завершение печати не подтверждает качество.</p></>
    return <aside className="eddy-details" aria-label="Подробности процедуры">{content}</aside>
  }

  function visualOrDetails(visual: ReactNode) {
    const critical = saveError || (operationUncertain ? 'Операция принтера остаётся неопределённой. Продолжение заблокировано до проверки состояния принтера.' : '')
    if (critical) return <aside className="eddy-state-panel"><p className="eddy-message is-error" role="alert">{critical}</p></aside>
    if (detailsVisible) return renderDetails()
    return visual
  }

  function renderTestZ() {
    return <>
      <div className="eddy-testz-labels"><span>− Опустить</span><span>+ Поднять</span></div>
      <div className="eddy-action-grid eddy-testz">{EDDY_TEST_Z_STEP_OPTIONS.slice().sort((a, b) => Math.sign(a) - Math.sign(b) || Math.abs(b) - Math.abs(a)).map((deltaMm) => {
        const args: ExecuteCommandArgs = { command: 'eddyTestZ', deltaMm }
        return <button key={deltaMm} type="button" disabled={isBusy || operationUncertain || !ready || getCommandBlockReason(args.command, args) !== null} onClick={() => void run(args)}>{deltaMm > 0 ? '+' : ''}{deltaMm} мм</button>
      })}</div>
    </>
  }

  function renderProcedure() {
    switch (procedure) {
      case 'driveCurrent':
        return <div className="eddy-instrument">{visualOrDetails(<figure className="eddy-subject"><CalibrationPreview kind="driveCurrent" /><figcaption>Схема катушки</figcaption></figure>)}<div className="eddy-instrument-controls">
          <p>{driveCurrentConfirmed ? 'Ток настроен. Можно продолжить.' : 'Остудите сопло и стол. Проверьте крепление датчика.'}</p>
        </div></div>
      case 'height':
        return <div className="eddy-instrument">{visualOrDetails(<EddyNozzleDiagram paper={activeManualSession} delta={confirmedHeightDelta} />)}<div className="eddy-instrument-controls">
          <div className="eddy-metric"><span>Зазор сопла</span><strong>{valueText(manualZ)}</strong></div>
          <p>{completedSaveKind === 'height' && snapshot.v2.eddy.calibration.primaryDone && snapshot.v2.eddy.calibration.activeStep === 'temperature' ? 'Высота сохранена. Можно продолжить.' : activeManualSession ? 'Положите бумагу под сопло и опускайте его до лёгкого трения.' : heightNozzlePrepared ? 'Очистите сопло щёткой. Затем подтвердите очистку.' : 'Припаркуйте принтер для ручной очистки сопла.'}</p>
          {activeManualSession && renderTestZ()}
        </div></div>
      case 'temperature':
        return <div className="eddy-instrument">
          {visualOrDetails(<figure className="eddy-subject"><CalibrationPreview kind="temperature" /><figcaption>Схема температурной компенсации</figcaption></figure>)}
          <div className={joinClassNames('eddy-instrument-controls eddy-temperature-controls', activeTemperatureSession && activeManualSession && 'eddy-temperature-controls--manual')}>
            <div className="control-heating-chart-legend eddy-temperature-legend">
              {[
                { id: 'nozzle', label: 'Сопло', tone: 'orange', current: snapshot.extruderTemp, target: snapshot.thermalTargets.nozzle },
                { id: 'bed', label: 'Стол', tone: 'green', current: snapshot.bedTemp, target: snapshot.thermalTargets.bed },
                { id: 'eddy', label: 'Eddy', tone: 'neutral', current: eddy?.temperatureC, target: 0 },
              ].map((series) => <div className="control-heating-chart-legend-btn is-active" key={series.id}>
                <span className={`control-heating-chart-legend-marker is-${series.tone}`} aria-hidden="true" />
                <span className="control-heating-chart-legend-label">{series.label}</span>
                <span className="control-heating-chart-legend-value">{valueText(series.current, 1, '°C')}{series.target > 0 ? ` / ${valueText(series.target, 0, '°C')}` : ''}</span>
              </div>)}
            </div>
            {activeTemperatureSession && activeManualSession ? <div className="eddy-temperature-paper">
              <div className="eddy-metric"><span>Зазор сопла · бумажный замер</span><strong>{valueText(manualZ)}</strong></div>
              <p>Опускайте до лёгкого трения бумаги.</p>
              {renderTestZ()}
            </div> : <>
            <section className="eddy-chart-area" aria-label="График температурной калибровки">
              <TemperatureTrendChart height={280} testId="eddy-temperature-chart" series={[
                { id: 'nozzle', label: 'Сопло', tone: 'orange', points: temperaturePoints.nozzle },
                { id: 'bed', label: 'Стол', tone: 'green', points: temperaturePoints.bed },
                { id: 'eddy', label: 'Eddy', tone: 'neutral', points: temperaturePoints.eddy },
              ]} />
            </section>
            <div className="eddy-temperature-summary"><p>Принято точек: <span>{eddy?.temperaturePoints ?? '—'}</span></p>{temperatureCooling ? <p>Обдув включён. Охлаждаем датчик, сопло и стол до 40 °C.</p> : !activeTemperatureSession && <p>Калибровка тепловой погрешности датчика.</p>}</div>
            </>}
          </div>
        </div>
      case 'z0':
        return <div className="eddy-instrument">{visualOrDetails(<EddyNozzleDiagram sensor />)}<div className="eddy-instrument-controls">
          <div className="eddy-metric"><span>Проверка Z0</span><strong>{z0Running ? 'Проверяем' : z0Confirmed ? 'Подтверждено' : z0CommandAccepted ? 'Ожидаем подтверждение' : 'Не проверено'}</strong></div>
          <p>Сопло переместится к столу. Освободите зону движения.</p>
        </div></div>
      case 'offsets':
        return <div className="eddy-instrument">{visualOrDetails(<EddyNozzleDiagram />)}<div className="eddy-instrument-controls">
          <div className="eddy-metric"><span>Поправка высоты</span><strong>{zOffsetDelta > 0 ? '+' : ''}{valueText(zOffsetDelta)}</strong></div>
          <p>Сохранение перезапустит принтер.</p>
          <div className="eddy-action-row">
            {commandButton('− 0,05 мм', { command: 'eddyZOffsetAdjust', deltaMm: -0.05 }, { reason: commandReason({ command: 'eddyZOffsetAdjust', deltaMm: -0.05 }, zAdjustCapability), onClick: async () => { if (await run({ command: 'eddyZOffsetAdjust', deltaMm: -0.05 })) setZOffsetDelta((delta) => delta - 0.05) } })}
            {commandButton('+ 0,05 мм', { command: 'eddyZOffsetAdjust', deltaMm: 0.05 }, { reason: commandReason({ command: 'eddyZOffsetAdjust', deltaMm: 0.05 }, zAdjustCapability), onClick: async () => { if (await run({ command: 'eddyZOffsetAdjust', deltaMm: 0.05 })) setZOffsetDelta((delta) => delta + 0.05) } })}
          </div>
        </div></div>
      case 'accuracy':
        return <div className="eddy-instrument">{visualOrDetails(<EddyNozzleDiagram sensor repeated />)}<div className="eddy-instrument-controls"><div className="eddy-metric"><span>Размах</span><strong>{valueText(accuracyResult?.range)}</strong></div><p>Повторные касания в одной точке.</p><p>{accuracyRunning ? 'Ожидаем ответ Klipper…' : accuracyResult ? 'Результат последнего замера этой сессии' : 'Измерений нет'}</p></div></div>
      case 'screws':
        return <div className="eddy-instrument">{visualOrDetails(<EddyScrewsDiagram screws={screws?.results ?? []} selected={selectedScrewIndex} />)}<div className="eddy-instrument-controls">
          {screws?.results.length ? <><div className="eddy-screw-select" role="group" aria-label="Выбор винта">{screws.results.map((item, index) => <button key={`${item.name}-${index}`} type="button" aria-pressed={selectedScrewIndex === index} onClick={() => setSelectedScrew(index)}>Винт {index + 1}</button>)}</div>
          {screw && <div className="eddy-screw-detail"><div className="eddy-metric"><span>Винт {selectedScrewIndex + 1}</span><strong>{screw.isBase === true ? 'Не вращать' : screw.adjust ?? '—'}</strong>{screw.isBase !== true && <small>обороты:минуты</small>}</div><EddyScrewTurn sign={screw.sign} isBase={screw.isBase} /></div>}
          {!screwsFresh && !screwsConfirmed && <p>Нужен повторный замер</p>}
          {screwsConfirmed && <p>Начнётся сканирование карты стола.</p>}
          </> : <p>Данные винтового замера неизвестны.</p>}
          {screws?.error === true && <p className="eddy-warning">Винтовой замер содержит ошибку. Подтверждение недоступно.</p>}
        </div></div>
      case 'mesh':
        return detailsVisible || saveError || operationUncertain ? <div className="eddy-instrument">{visualOrDetails(null)}<div className="eddy-instrument-controls"><div className="eddy-metric"><span>Размах карты</span><strong>{valueText(measuredMeshMin === null || measuredMeshMax === null ? null : measuredMeshMax - measuredMeshMin)}</strong></div><p>{meshCommandFinished ? 'Профиль сохранён' : meshScanHasNewMatrix ? 'Новый замер · не сохранено' : matrix.length > 0 ? 'Последний замер' : 'Карта не подтверждена'}</p></div></div> : <EddyMeshDiagram matrix={matrix} row={selectedMeshRow} column={selectedMeshColumn} min={calibration?.mesh.min} max={calibration?.mesh.max}
          table={meshTableVisible ? <div className="eddy-mesh-table"><div className="eddy-table-wrap eddy-mesh-values"><table><caption>Строки Y / столбцы X · Z, мм</caption><thead><tr><th scope="col">Y / X</th>{Array.from({ length: meshColumns }, (_, c) => <th key={c} scope="col">{c + 1}</th>)}</tr></thead><tbody>{matrix.map((line, row) => <tr key={row}><th scope="row">{row + 1}</th>{Array.from({ length: meshColumns }, (_, column) => <td key={column} className={selectedMeshRow === row && selectedMeshColumn === column ? 'is-selected' : ''}>{valueText(line[column], 3, '')}</td>)}</tr>)}</tbody></table>{matrix.length === 0 && <p>Измерений пока нет</p>}</div><div className="eddy-mesh-selectors"><div><button type="button" aria-label="Предыдущая строка" disabled={selectedMeshRow === 0 || matrix.length === 0} onClick={() => setMeshRow(selectedMeshRow - 1)}>−</button><span>Y {matrix.length ? selectedMeshRow + 1 : '—'}</span><button type="button" aria-label="Следующая строка" disabled={selectedMeshRow >= matrix.length - 1} onClick={() => setMeshRow(selectedMeshRow + 1)}>+</button></div><div><button type="button" aria-label="Предыдущий столбец" disabled={selectedMeshColumn === 0 || meshColumns === 0} onClick={() => setMeshColumn(selectedMeshColumn - 1)}>−</button><span>X {meshColumns ? selectedMeshColumn + 1 : '—'}</span><button type="button" aria-label="Следующий столбец" disabled={selectedMeshColumn >= meshColumns - 1} onClick={() => setMeshColumn(selectedMeshColumn + 1)}>+</button></div></div><p>Выбранная точка Z {valueText(matrix[selectedMeshRow]?.[selectedMeshColumn])}</p></div> : undefined}
          controls={<><div className="eddy-metric"><span>Размах · {!ready ? 'нет связи' : meshScanHasNewMatrix ? 'новый замер' : matrix.length > 0 ? 'последний замер' : 'нет данных'}</span><strong>{valueText(measuredMeshMin === null || measuredMeshMax === null ? null : measuredMeshMax - measuredMeshMin)}</strong></div>
            {meshScanMethods && <div className="eddy-mesh-method"><span>Сканирование</span><div role="group" aria-label="Режим сканирования">{([['scan', 'Обычный'], ['rapid_scan', 'Rapid'], ['automatic', 'Точки']] as const).map(([method, label]) => <button key={method} type="button" aria-pressed={meshMethod === method} disabled={!ready || isBusy || activeSession || saveKind !== null} onClick={() => setMeshMethod(method)}>{label}</button>)}</div></div>}
            <button type="button" className="is-secondary" onClick={() => setMeshTableVisible((visible) => !visible)}>{meshTableVisible ? '3D-карта' : 'Значения'}</button></>} />
      case 'firstLayer':
        return <div className="eddy-instrument">{visualOrDetails(<EddyNozzleDiagram firstLayer />)}<div className="eddy-instrument-controls">
          {!activePrint && <><p>Выберите подготовленный G-code первого слоя и проверьте файл.</p>
          {snapshot.printFiles.length > 0 ? <section className="eddy-file-list" aria-label="Файлы теста первого слоя">
            {snapshot.printFiles.map((file) => <button key={file.id} type="button" aria-label={`Выбрать ${file.name}${file.directory ? `, каталог ${file.directory}` : ', корень'}`} aria-pressed={selectedFile === file.path} onClick={() => setSelectedFile(file.path)}><span>{file.name}</span><small>{file.directory || 'Корень'}</small></button>)}
          </section> : <p role="status">Нет загруженных файлов теста. Откройте раздел файлов и добавьте G-code.</p>}
          {selectedCalibrationFile && <div className="eddy-file-summary"><span>Проверьте файл перед запуском</span><strong>{selectedCalibrationFile.path}</strong></div>}</>}
          {activePrint && <>
            <div className="eddy-metric"><span>Текущая печать</span><strong>{snapshot.printJob.filename.split(/[\\/]/).pop()} · {Math.round(snapshot.printJob.progressPercent)}%</strong><small>Слой {snapshot.printJob.currentLayer ?? '—'} / {snapshot.printJob.totalLayer ?? '—'} · Координата Z {valueText(snapshot.toolheadZ)}</small></div>
            {activeCalibrationPrint && <div className="eddy-babystep">
              <span>Шаг, мм</span>
              <div className="eddy-action-row" role="group" aria-label="Шаг babystep">
                {BABYSTEP_STEP_OPTIONS.map((step) => <button key={step} type="button" aria-pressed={babystepStep === step} onClick={() => setBabystepStep(step)}>{step}</button>)}
              </div>
              <div className="eddy-action-row" role="group" aria-label="Коррекция первого слоя">
                {([-1, 1] as const).map((direction) => {
                  const deltaMm = direction * babystepStep
                  const args: ExecuteCommandArgs = { command: 'adjustZOffset', deltaMm }
                  const reason = getCommandBlockReason(args.command, args)
                  return <button key={direction} type="button" aria-label={`Babystep ${direction < 0 ? 'минус' : 'плюс'} ${babystepStep}`} disabled={isBusy || operationUncertain || reason !== null} title={operationUncertain ? 'Операция принтера остаётся неопределённой.' : reason ?? undefined} onClick={() => void run(args)}>{direction < 0 ? `− ${babystepStep} мм` : `+ ${babystepStep} мм`}</button>
                })}
              </div>
            </div>}
            {!activeCalibrationPrint && <p>Текущая печать не связана с запуском этого теста. Коррекция первого слоя недоступна.</p>}
          </>}
          {snapshot.printJob.state === 'complete' || snapshot.printJob.state === 'cancelled' ? <div className="eddy-metric"><span>{firstLayerObservedPath !== null && firstLayerObservedPath === firstLayerStartedPath && observedPrintPath === firstLayerObservedPath ? snapshot.printJob.state === 'complete' ? 'Наблюдавшийся тест завершён' : 'Наблюдавшийся тест отменён' : 'Последняя печать'}</span><strong>{firstLayerObservedPath !== null && firstLayerObservedPath === firstLayerStartedPath && observedPrintPath === firstLayerObservedPath
            ? calibration?.config.savePending || calibration?.config.pendingSections.length ? `Есть несохранённые изменения: ${calibration.config.pendingSections.join(', ') || 'разделы неизвестны'}` : 'Конфигурация не ожидает сохранения'
            : 'Статус завершённой печати не связан с наблюдавшимся запуском этого теста.'}</strong></div> : null}
          {(snapshot.printJob.state === 'complete' || snapshot.printJob.state === 'cancelled') && <p>Качество слоя оценивает оператор; завершение печати не подтверждает качество.</p>}
        </div></div>
      case 'overview':
        return null
    }
  }

  function renderProcedureActions(): { primary: ReactNode; secondary: ReactNode } {
    const actions = (primary: ReactNode, secondary: ReactNode = null) => ({ primary, secondary })
    const next = (label: string, destination: ProcedureId) => <button type="button" className="eddy-btn is-secondary" disabled={backBlocked || !ready || blockCalibration !== null} onClick={() => openProcedure(destination)}>{label}</button>
    const done = <button type="button" className="eddy-btn is-primary" disabled={backBlocked} onClick={() => { setPipelineActive(false); activityCallbackRef.current?.(false); onBackToList() }}>Завершить</button>
    if (procedure === 'overview') return actions(<button type="button" className="eddy-btn is-primary" disabled={isBusy || operationUncertain || saveKind !== null || !ready || visibleBlockReason !== null} title={visibleBlockReason ?? undefined} onClick={() => openProcedure(recommendation)}>{recommendation === 'driveCurrent' ? 'Начать калибровку' : `Продолжить: ${PROCEDURES.find((item) => item.id === recommendation)?.title}`}</button>)
    if (procedure === 'mesh' && saveKind === 'mesh') return actions(<button type="button" className="eddy-btn is-primary" disabled>Сохранение карты…</button>)
    if (saveKind !== null) return actions(<button type="button" className="eddy-btn is-primary" disabled>Сохранение…</button>)
    switch (procedure) {
      case 'driveCurrent':
        if (driveCurrentConfirmed) return actions(done, next('Далее: высота по бумаге', 'height'))
        return actions(commandButton('Настроить ток катушки', { command: 'eddyDriveCurrentCalibrate' }, { primary: true, reason: blockCalibration, onClick: () => void beginSave('driveCurrent', { command: 'eddyDriveCurrentCalibrate' }) }))
      case 'height':
        if (completedSaveKind === 'height') return actions(done, snapshot.v2.eddy.calibration.primaryDone && snapshot.v2.eddy.calibration.activeStep === 'temperature' ? next('Далее: температурная серия', 'temperature') : null)
        return actions(activeManualSession
          ? commandButton('Принять высоту и сохранить', { command: 'eddyPrimaryAcceptSave' }, { primary: true, reason: blockCalibration, onClick: () => void beginSave('height', { command: 'eddyPrimaryAcceptSave' }) })
          : !heightNozzlePrepared
            ? commandButton('Подготовить сопло', { command: 'serviceMode' }, { primary: true, reason: blockCalibration, onClick: () => void prepareHeightNozzle() })
            : commandButton('Сопло очищено · к бумаге', { command: 'eddyPrimaryHeightStart' }, { primary: true, blocked: !allAxesHomed, reason: blockCalibration }))
      case 'temperature':
        if (completedSaveKind === 'temperature') return actions(done, snapshot.v2.eddy.calibration.activeStep === 'z0' ? next('Далее: Z0', 'z0') : null)
        return activeTemperatureSession
          ? actions(activeManualSession
            ? commandButton('Подтвердить зазор', { command: 'eddyTemperatureAccept' }, { primary: true, reason: temperatureAcceptReason })
            : <button type="button" className="eddy-btn is-primary" disabled>{temperatureCooling ? 'Охлаждение до 40 °C…' : temperatureSeriesFinished ? temperatureCompletionIssue === null ? 'Сохранение…' : 'Серия остановлена' : 'Ожидаем бумажный замер…'}</button>)
          : actions(commandButton('Начать температурную серию', { command: 'eddyTemperatureStart' }, { primary: true, reason: blockCalibration }))
      case 'z0':
        if (z0Confirmed) return actions(done, next('Далее: винты стола', 'screws'))
        return actions(commandButton('Проверить Z0', { command: 'eddyCheckZ0' }, { primary: true, blocked: z0Running || z0CommandAccepted && !z0Confirmed || blockCalibration !== null, reason: blockCalibration ?? getCommandBlockReason('eddyCheckZ0'), onClick: () => void runProbe('eddyCheckZ0') }))
      case 'offsets':
        if (completedSaveKind === 'zOffset') return actions(done)
        return confirmZOffsetSave
          ? actions(commandButton('Сохранить и перезапустить', { command: 'eddyZOffsetSave' }, { primary: true, reason: zOffsetSaveReason, onClick: () => void beginSave('zOffset', { command: 'eddyZOffsetSave' }) }))
          : actions(<button type="button" className="eddy-btn is-primary" disabled={zOffsetSaveReason !== null || isBusy || operationUncertain} title={operationUncertain ? 'Операция принтера остаётся неопределённой.' : zOffsetSaveReason ?? undefined} onClick={() => setConfirmZOffsetSave(true)}>Сохранить смещение Z</button>)
      case 'accuracy':
        if (accuracyResult !== null && !accuracyRunning) return actions(done)
        return actions(commandButton('Проверить повторяемость', { command: 'eddyProbeAccuracy' }, { primary: true, blocked: accuracyRunning || !accuracyCapability || blockCalibration !== null, reason: commandReason({ command: 'eddyProbeAccuracy' }, accuracyCapability) ?? blockCalibration, onClick: () => void runProbe('eddyProbeAccuracy') }))
      case 'screws':
        if (screwsConfirmed) return actions(done, commandButton('Измерить и сохранить', meshScanArgs, { secondary: true, blocked: backBlocked || blockCalibration !== null, reason: blockCalibration ?? commandReason(meshScanArgs), onClick: () => { if (backBlocked || blockCalibration !== null || commandReason(meshScanArgs) !== null) return; openProcedure('mesh'); void runMeshScan() } }))
        if (!screwsFresh) return actions(commandButton('Измерить винты', { command: 'eddyScrewsTiltStart' }, { primary: true, reason: blockCalibration, onClick: () => void runScrewsMeasurement() }))
        return actions(commandButton('Проверить выравнивание', { command: 'eddyScrewsTiltDone' }, { primary: true, blocked: !screwsFresh || screws?.error !== false || screws.results.length < 4, reason: !screwsFresh ? 'Нужен принятый повторный замер с четырьмя обновлёнными точками.' : screws?.error !== false ? 'Проверьте ошибки винтового замера.' : null, onClick: () => void finishScrews() }), commandButton('Измерить винты', { command: 'eddyScrewsTiltStart' }, { secondary: true, reason: blockCalibration, onClick: () => void runScrewsMeasurement() }))
      case 'mesh':
        if (meshCommandFinished) return actions(done, snapshot.v2.eddy.calibration.meshDone && snapshot.v2.eddy.calibration.requiredDone ? next('Далее: первый слой', 'firstLayer') : null)
        if (meshScanHasNewMatrix) return actions(commandButton('Повторить сохранение и перезапустить', { command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' }, { primary: true, blocked: saveKind !== null || blockCalibration !== null, reason: blockCalibration, onClick: () => { setMeshSaveTarget(probedMatrix); void beginSave('mesh', { command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' }) } }), commandButton('Повторить сканирование', meshScanArgs, { secondary: true, reason: blockCalibration, onClick: () => void runMeshScan() }))
        return actions(commandButton('Измерить и сохранить', meshScanArgs, { primary: true, blocked: saveKind !== null, reason: blockCalibration, onClick: () => void runMeshScan() }))
      case 'firstLayer':
        if (!activePrint && firstLayerObservedPath !== null && firstLayerObservedPath === firstLayerStartedPath && observedPrintPath === firstLayerObservedPath && (snapshot.printJob.state === 'complete' || snapshot.printJob.state === 'cancelled')) return actions(done)
        if (activePrint) return actions(<button type="button" className="eddy-btn is-primary" disabled>Печать выполняется</button>)
        if (printStartArgs === null) return actions(<button type="button" className="eddy-btn is-primary" disabled>Выберите G-code</button>)
        return actions(commandButton('Запустить тест первого слоя', printStartArgs, { primary: true, blocked: !ready || isBusy, reason: !ready ? 'Нужно подключение к готовому принтеру.' : getCommandBlockReason('start', printStartArgs), onClick: () => void startFirstLayerTest() }))
    }
  }

  const activeTitle = PROCEDURES.find((item) => item.id === procedure)?.title ?? 'Калибровки Eddy'
  const procedureCompleted = procedure === 'driveCurrent' ? driveCurrentConfirmed
    : procedure === 'height' ? completedSaveKind === 'height'
      : procedure === 'temperature' ? completedSaveKind === 'temperature'
        : procedure === 'z0' ? z0Confirmed
          : procedure === 'screws' ? screwsConfirmed
            : procedure === 'mesh' ? meshCommandFinished
              : procedure === 'offsets' ? completedSaveKind === 'zOffset'
                  : procedure === 'accuracy' ? accuracyResult !== null && !accuracyRunning : false
  const procedureStatus = operationUncertain
    ? 'Операция неизвестна'
    : saveKind !== null
    ? 'Сохранение и перезапуск'
    : isBusy
      ? 'Команда выполняется'
      : activeManualSession
        ? 'Ручное измерение активно'
        : activeTemperatureSession
          ? temperatureCooling ? 'Охлаждение перед температурной серией' : 'Температурная серия активна'
          : accuracyRunning || z0Running
            ? 'Ожидаем ответ Klipper'
            : saveError
              ? 'Сохранение не подтверждено'
              : procedure === 'overview'
                ? 'Состояние принтера'
                : procedureCompleted
                  ? 'Калибровка завершена успешно.'
                  : procedure === 'screws' && screwsFresh ? 'Результат замера'
                    : procedure === 'mesh' && meshScanHasNewMatrix ? 'Новый замер · не сохранено'
                    : 'Подготовка'
  const emergencyAllowed = snapshot.capabilities.serviceCommands && getCommandBlockReason('emergencyStop') === null
  const emergencyActionVisible = pipelineActive || activeSession || isBusy || saveKind !== null || accuracyRunning || z0Running || operationUncertain
  const primaryBlockReason = procedureCompleted ? null : procedure === 'driveCurrent' ? commandReason({ command: 'eddyDriveCurrentCalibrate' })
    : procedure === 'height' ? commandReason({ command: activeManualSession ? 'eddyPrimaryAcceptSave' : heightNozzlePrepared ? 'eddyPrimaryHeightStart' : 'serviceMode' })
      : procedure === 'temperature' ? activeTemperatureSession ? activeManualSession ? temperatureAcceptReason : temperatureCompletionIssue : commandReason({ command: 'eddyTemperatureStart' })
        : procedure === 'z0' ? commandReason({ command: 'eddyCheckZ0' })
          : procedure === 'accuracy' ? commandReason({ command: 'eddyProbeAccuracy' }, accuracyCapability)
            : procedure === 'mesh' ? commandReason(meshScanArgs)
              : procedure === 'offsets' ? zOffsetSaveReason
                  : procedure === 'screws' ? commandReason({ command: 'eddyScrewsTiltStart' }) ?? (screwsDoneRefreshRunId !== null && !screwsConfirmed ? 'Ожидаем подтверждение настройки винтов.' : screws?.results.length && !screwsFresh ? 'Нужен повторный замер четырёх винтов.' : null)
                    : procedure === 'firstLayer' && printStartArgs && !activePrint ? getCommandBlockReason('start', printStartArgs) : null
  const visibleBlockReason = procedure === 'overview' || procedure === 'firstLayer' ? primaryBlockReason : blockCalibration ?? (procedure === 'screws' && screwsConfirmed ? commandReason(meshScanArgs) : primaryBlockReason)
  const visibleStatusReason = procedure === 'temperature' && activeTemperatureSession && !activeManualSession && !temperatureSeriesFinished && visibleBlockReason === null
    ? 'Принтер готовит точку измерения. Дождитесь готовности.'
    : visibleBlockReason === 'Принять точку температуры Eddy: активная температурная точка manual_probe не подтверждена.'
    ? 'Принтер готовит точку измерения. Дождитесь готовности.' : visibleBlockReason
  const procedureMessageInBody = procedure !== 'overview' && Boolean(saveError || operationUncertain)
  const statusIsError = !procedureMessageInBody && Boolean(saveError || operationUncertain || procedure === 'temperature' && temperatureCompletionIssue)
  const hideMeshStatus = procedure === 'mesh' && !procedureCompleted && ready && !isBusy && !activeSession && saveKind === null
    && !saveError && !operationUncertain && !message && visibleStatusReason === null
  const footerActions = renderProcedureActions()

  return (
    <article className={joinClassNames('eddy-workflow', (procedure === 'temperature' || procedure === 'height' && activeManualSession) && 'eddy-workflow--tall-controls', hideMeshStatus && 'eddy-workflow--mesh-expanded')}>
      <header className="eddy-header">
        <button type="button" disabled={backBlocked} onClick={onBackToList}>{!procedureCompleted && pipelineActive && !backBlocked ? 'Завершить' : 'К списку'}</button>
        <div>{snapshot.source === 'mock' && <p>Симуляция</p>}<h2>{procedure === 'overview' ? 'Обзор калибровок' : activeTitle}</h2></div>
        {emergencyActionVisible && <button type="button" className="eddy-danger" disabled={!emergencyAllowed || emergencyPending} onClick={() => setConfirmEmergency(true)}>Аварийная остановка</button>}
      </header>
      <main className="eddy-body">
        {procedure !== 'overview' && <section className="eddy-procedure-content">{renderProcedure()}</section>}
        {procedure === 'overview' && <>{renderOverview()}</>}
      </main>
      {!hideMeshStatus && <div className={joinClassNames('eddy-status', statusIsError && 'is-error')} role={statusIsError ? 'alert' : 'status'} aria-hidden={procedureMessageInBody || undefined}>{procedureMessageInBody ? '' : saveError || (operationUncertain ? 'Операция принтера остаётся неопределённой. Продолжение заблокировано.' : saveKind !== null ? 'Ожидаем сохранения и перезапуска принтера.' : message || (!ready ? 'Связи нет · показаны последние данные.' : visibleStatusReason ?? procedureStatus))}</div>}
      <footer className="eddy-footer">
        <div className="eddy-footer-details">{procedure !== 'overview' && <button type="button" className="is-secondary" aria-expanded={detailsVisible} onClick={() => setDetailsVisible((visible) => !visible)}>{detailsVisible ? 'Скрыть' : 'Подробнее'}</button>}</div>
        <div className="eddy-footer-secondary">
          {activeSession && abortCapability && commandButton(procedure === 'height' ? 'Отменить ручное измерение' : procedure === 'temperature' ? temperatureCooling ? 'Отменить охлаждение' : 'Отменить серию' : 'Отменить текущий этап', { command: 'eddyAbort' }, { secondary: true, reason: commandReason({ command: 'eddyAbort' }, abortCapability) })}
          {footerActions.secondary}
        </div>
        <div className="eddy-footer-primary">{footerActions.primary}</div>
      </footer>
      {screwsRawVisible && <div className="eddy-dialog-layer"><div className="eddy-dialog" role="dialog" aria-modal="true" aria-label="Все данные винтового замера" ref={screwsDialogRef}><div className="eddy-table-wrap eddy-raw-table"><table><caption>Результаты винтового замера</caption><thead><tr><th>Винт</th><th>X / Y</th><th>Z</th><th>Знак</th><th>Поворот</th></tr></thead><tbody>{screws?.results.map((item) => <tr key={item.name}><th scope="row">{item.name}{item.isBase === true ? ' · база' : ''}</th><td>{valueText(item.xMm)} / {valueText(item.yMm)}</td><td>{valueText(item.zMm)}</td><td>{item.sign ?? '—'}</td><td>{item.adjust ?? '—'}</td></tr>)}</tbody></table></div><p>Направление показано со стороны вращаемой головки винта. Поворот — обороты:минуты, не время.</p><button type="button" onClick={() => setScrewsRawVisible(false)}>Закрыть данные замера</button></div></div>}
      {confirmEmergency && <div className="eddy-dialog-layer" role="presentation"><section className="eddy-dialog" role="alertdialog" aria-modal="true" aria-labelledby="eddy-emergency-title" aria-describedby="eddy-emergency-warning"><h2 id="eddy-emergency-title">Аварийная остановка</h2><p id="eddy-emergency-warning">Команда немедленно остановит принтер. После неё проверьте механику и состояние Klipper перед продолжением.</p><div className="eddy-action-row"><button ref={emergencyButtonRef} type="button" className="eddy-danger" disabled={!emergencyAllowed || emergencyPending} onClick={() => void stopEmergency()}>Подтвердить остановку</button><button type="button" className="eddy-btn is-secondary" disabled={emergencyPending} onClick={() => setConfirmEmergency(false)}>Отмена</button></div></section></div>}
    </article>
  )
}
