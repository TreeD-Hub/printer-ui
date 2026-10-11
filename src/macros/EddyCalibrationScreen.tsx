import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type { TemperatureChartPoint } from '../control/types'
import type { PrinterSnapshot } from '../core/transport/types'
import { subscribePrinterGcodeResponses } from '../core/store/printerNotifications'
import { isPrintJobActive } from '../core/transport/types'
import { BABYSTEP_STEP_OPTIONS } from '../dashboard/config'
import { EDDY_TEST_Z_STEP_OPTIONS } from '@treed/printer-logic'
import { NumericKeypad, TemperatureTrendChart, TuneValueEditor, joinClassNames, useModalFocus } from '../ui'
import './eddyCalibration.css'

type ProcedureId = 'overview' | 'driveCurrent' | 'height' | 'temperature' | 'z0' | 'offsets' | 'accuracy' | 'screws' | 'mesh' | 'xyOffset' | 'firstLayer'
type SaveKind = 'height' | 'temperature' | 'mesh' | 'xyOffset' | 'zOffset'
type EddyCalibrationScreenProps = {
  snapshot: PrinterSnapshot
  pendingCommand: PrinterCommandId | null
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  refreshEddyState: () => Promise<boolean>
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
  onBackToList: () => void
  initialProcedure?: ProcedureId
}

const PROCEDURES: Array<{ id: Exclude<ProcedureId, 'overview'>; title: string; detail: string }> = [
  { id: 'driveCurrent', title: 'Код тока катушки', detail: 'Код настройки Eddy' },
  { id: 'height', title: 'Высота по бумаге', detail: 'Ручной TESTZ и подтверждение Z' },
  { id: 'temperature', title: 'Температурная серия', detail: 'Точки, график и отдельное завершение' },
  { id: 'z0', title: 'Z0', detail: 'Проверка нулевой высоты' },
  { id: 'offsets', title: 'Смещения Z', detail: 'Изменение Z-offset с сохранением' },
  { id: 'accuracy', title: 'Повторяемость', detail: 'Результат PROBE_ACCURACY' },
  { id: 'screws', title: 'Винты стола', detail: 'Результаты замера и повторная проверка' },
  { id: 'mesh', title: 'Карта стола', detail: 'Профиль, границы и значения замера' },
  { id: 'xyOffset', title: 'XY-смещение', detail: 'Измерение и запись со сбросом калибровок' },
  { id: 'firstLayer', title: 'Первый слой', detail: 'Подготовленный тестовый G-code' },
]

const READY = (snapshot: PrinterSnapshot) => snapshot.transport.state === 'online' && snapshot.klippy.state === 'ready'

function valueText(value: number | null | undefined, digits = 3, unit = 'мм'): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)} ${unit}` : 'Неизвестно'
}

function statusText(value: boolean | null | undefined): string {
  return value === true ? 'Подтверждено' : value === false ? 'Не настроено' : 'Неизвестно'
}

function parseAccuracyResponse(message: string): string | null {
  if (!/probe accuracy/i.test(message)) return null
  const range = message.match(/\brange\s+([+-]?[\d.]+)/i)?.[1]
  const average = message.match(/\baverage\s+([+-]?[\d.]+)/i)?.[1]
  const deviation = message.match(/\bstandard deviation\s+([+-]?[\d.]+)/i)?.[1]
  if (!range || !average || !deviation || ![range, average, deviation].every((value) => Number.isFinite(Number(value)))) return null
  return `Размах ${Number(range).toFixed(3)} мм · среднее ${Number(average).toFixed(3)} мм · σ ${Number(deviation).toFixed(3)} мм`
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
  const [emergencyRecoveryPending, setEmergencyRecoveryPending] = useState(false)
  const [confirmEmergency, setConfirmEmergency] = useState(false)
  const [confirmOffsets, setConfirmOffsets] = useState(false)
  const [confirmZOffsetSave, setConfirmZOffsetSave] = useState(false)
  const [operationUncertain, setOperationUncertain] = useState(false)
  const [xOffsetDraft, setXOffsetDraft] = useState(() => eddy?.xOffsetMm?.toString() ?? '')
  const [yOffsetDraft, setYOffsetDraft] = useState(() => eddy?.yOffsetMm?.toString() ?? '')
  const [editingOffsetField, setEditingOffsetField] = useState<'x' | 'y' | null>(null)
  const [offsetFieldDraft, setOffsetFieldDraft] = useState('')
  const [accuracyResult, setAccuracyResult] = useState<string | null>(null)
  const [z0Result, setZ0Result] = useState<string | null>(null)
  const [z0CommandAccepted, setZ0CommandAccepted] = useState(false)
  const [z0RefreshRunId, setZ0RefreshRunId] = useState<number | null>(null)
  const [accuracyRunning, setAccuracyRunning] = useState(false)
  const [z0Running, setZ0Running] = useState(false)
  const [temperaturePoints, setTemperaturePoints] = useState({ nozzle: [] as TemperatureChartPoint[], bed: [] as TemperatureChartPoint[] })
  const [screwsRefreshRunId, setScrewsRefreshRunId] = useState<number | null>(null)
  const [meshCommandFinished, setMeshCommandFinished] = useState(false)
  const [meshScanCommandAccepted, setMeshScanCommandAccepted] = useState(false)
  const [meshScanRefreshRunId, setMeshScanRefreshRunId] = useState<number | null>(null)
  const [meshSaveTarget, setMeshSaveTarget] = useState<Array<Array<number | null>> | null>(null)
  const [selectedFile, setSelectedFile] = useState('')
  const [firstLayerStartedPath, setFirstLayerStartedPath] = useState<string | null>(null)
  const [firstLayerObservedPath, setFirstLayerObservedPath] = useState<string | null>(null)
  const [babystepStep, setBabystepStep] = useState<number>(BABYSTEP_STEP_OPTIONS[1])
  const [zOffsetDelta, setZOffsetDelta] = useState(0)
  const emergencyButtonRef = useRef<HTMLButtonElement>(null)
  const commandRunIdRef = useRef(0)
  const replaceOffsetDraftRef = useRef(true)
  const offsetDialogRef = useModalFocus<HTMLDivElement>(editingOffsetField !== null, () => setEditingOffsetField(null))
  const accuracyRunningRef = useRef(false)
  const z0RunningRef = useRef(false)

  const ready = READY(snapshot)
  const activeManualSession = calibration?.manualProbe.active === true
  const activeTemperatureSession = eddy?.temperatureSeriesActive === true || eddy?.inTemperatureCalibration === true
  const activeSession = activeManualSession || activeTemperatureSession
  const allAxesHomed = ['x', 'y', 'z'].every((axis) => snapshot.homedAxes.toLowerCase().includes(axis))
  const z0Confirmed = z0CommandAccepted
    && z0RefreshRunId === commandRunIdRef.current
    && snapshot.v2.eddy.calibration.z0Done
    && snapshot.v2.eddy.calibration.activeStep === 'screws'
    && snapshot.v2.eddy.calibration.operatorPrompt === 'verify_z0'
  const emergencyRecoveryConfirmed = ready
    && calibration?.manualProbe.active === false
    && eddy?.inTemperatureCalibration === false
    && eddy?.temperatureSeriesActive === false
    && calibration?.config.savePending === false
    && calibration.config.pendingSections.length === 0
  const isBusy = pendingCommand !== null || localCommandPending
  const backBlocked = isBusy || activeSession || saveKind !== null || operationUncertain
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
  const offsetsCapability = snapshot.capabilities.calibrationCommands?.setOffsets === true
  const zAdjustCapability = snapshot.capabilities.calibrationCommands?.zOffsetAdjust === true
  const zSaveCapability = snapshot.capabilities.calibrationCommands?.zOffsetSave === true
  const temperatureAcceptReason = commandReason({ command: 'eddyTemperatureAccept' }, temperatureAcceptCapability)
    ?? (eddy?.temperatureSeriesActive !== true ? 'Температурная серия не подтверждена в текущем статусе принтера.' : null)
    ?? (snapshot.v2.eddy.calibration.operatorPrompt !== 'temperature_points' ? 'Klipper ещё не запросил температурную точку.' : null)
  const temperatureCompleteReason = commandReason({ command: 'eddyTemperatureComplete' }, temperatureCompleteCapability)
    ?? (eddy?.temperatureSeriesActive !== true ? 'Температурная серия не подтверждена в текущем статусе принтера.' : null)
    ?? (eddy?.temperaturePoints == null ? 'Количество точек неизвестно; обновите состояние принтера.' : eddy.temperaturePoints < 3 ? 'Нужно принять не менее трёх температурных точек.' : null)
    ?? (calibration?.manualProbe.active !== false ? 'Статус ручного измерения неизвестен или оно ещё активно.' : null)

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
      && (saveKind !== 'height' || (calibration?.manualProbe.active === false && eddy?.heightCalibrated === true))
      && (saveKind !== 'temperature' || (eddy?.inTemperatureCalibration === false && eddy?.temperatureSeriesActive === false && snapshot.v2.eddy.calibration.temperatureDone === true))
      && (saveKind !== 'mesh' || (meshSaveTarget !== null && savedMeshMatches(meshSaveTarget, calibration?.mesh.savedProfiles.default)))
      && (saveKind !== 'xyOffset' || (eddy?.xOffsetMm === Number(xOffsetDraft) && eddy?.yOffsetMm === Number(yOffsetDraft)))
      && (saveKind !== 'zOffset' || eddy?.heightCalibrated === true)
    if (saveFinished) {
      const completedKind = saveKind
      setSaveKind(null)
      setSaveAccepted(false)
      setSaveError('')
      if (saveKind === 'zOffset') setZOffsetDelta(0)
      setMessage(completedKind === 'mesh'
        ? 'Команда карты завершена; ниже показано последнее состояние, полученное от принтера.'
        : 'Настройки подтверждены после перезапуска принтера.')
      if (completedKind === 'mesh') setMeshCommandFinished(true)
      void refreshEddyState()
    }
  }, [saveAccepted, saveKind, restartSeen, ready, calibration?.config.savePending, calibration?.config.pendingSections.length, calibration?.manualProbe.active, eddy?.heightCalibrated, eddy?.inTemperatureCalibration, eddy?.temperatureSeriesActive, snapshot.v2.eddy.calibration.temperatureDone, snapshot.v2.eddy.calibration.z0Done, snapshot.v2.eddy.calibration.activeStep, snapshot.v2.eddy.calibration.operatorPrompt, calibration?.mesh.savedProfiles, eddy?.xOffsetMm, eddy?.yOffsetMm, eddy?.zOffsetMm, xOffsetDraft, yOffsetDraft, eddy?.temperaturePoints, zOffsetDelta, meshSaveTarget, refreshEddyState])

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
    if (procedure !== 'temperature' || !activeTemperatureSession || !ready) return
    const timestamp = Date.now()
    setTemperaturePoints((current) => {
      if (timestamp - (current.nozzle.at(-1)?.timestamp ?? 0) < 1000) return current
      const keep = (points: TemperatureChartPoint[], temperature: number, target: number) => Number.isFinite(temperature)
        ? [...points.slice(-899), { timestamp, current: temperature, target }]
        : points
      return {
        nozzle: keep(current.nozzle, snapshot.extruderTemp, snapshot.thermalTargets.nozzle),
        bed: keep(current.bed, snapshot.bedTemp, snapshot.thermalTargets.bed),
      }
    })
  }, [procedure, activeTemperatureSession, ready, snapshot.extruderTemp, snapshot.bedTemp, snapshot.thermalTargets.nozzle, snapshot.thermalTargets.bed, snapshot.updatedAt])

  useEffect(() => {
    if (firstLayerStartedPath === null || !isPrintJobActive(snapshot.printJob)) return
    if (canonicalPrintPath(snapshot.printJob.filename) === firstLayerStartedPath) setFirstLayerObservedPath(firstLayerStartedPath)
  }, [firstLayerStartedPath, snapshot.printJob.filename, snapshot.printJob.state])

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

  useEffect(() => {
    if (!emergencyRecoveryPending || !emergencyRecoveryConfirmed) return
    setEmergencyRecoveryPending(false)
    setOperationUncertain(false)
    setSaveError('')
    setMessage('Аварийная остановка подтверждена. Принтер готов; проверьте результат предыдущей операции перед продолжением.')
  }, [emergencyRecoveryPending, emergencyRecoveryConfirmed])

  async function run(args: ExecuteCommandArgs, refreshOnAccept = true): Promise<boolean> {
    const isEmergencyStop = args.command === 'emergencyStop'
    if (operationUncertain && !isEmergencyStop) return false
    if (localCommandPending && !isEmergencyStop) return false
    const reason = getCommandBlockReason(args.command, args)
    if (reason !== null) {
      setMessage(reason)
      return false
    }
    const commandRunId = ++commandRunIdRef.current
    setMessage('')
    setSaveError('')
    setLocalCommandPending(true)
    try {
      const accepted = await executeCommand(args)
      if (commandRunId !== commandRunIdRef.current) return false
      if (accepted) {
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
  }

  async function beginSave(kind: SaveKind, args: ExecuteCommandArgs): Promise<boolean> {
    if (blockCalibration !== null) {
      setMessage(blockCalibration)
      return false
    }
    setSaveKind(kind)
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
  }

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
    if (!await run({ command: 'eddyScrewsTiltStart' }, false) || commandRunIdRef.current !== runId) return
    const refreshed = await refreshEddyState()
    if (commandRunIdRef.current !== runId) return
    if (refreshed) setScrewsRefreshRunId(runId)
    else setMessage('Команда винтов принята, но актуальный снимок результата не обновился.')
  }

  async function runMeshScan() {
    const runId = commandRunIdRef.current + 1
    setMeshScanCommandAccepted(false)
    setMeshScanRefreshRunId(null)
    setMeshCommandFinished(false)
    setMeshSaveTarget(null)
    if (!await run({ command: 'eddyScanMesh', save: false }, false) || commandRunIdRef.current !== runId) return
    setMeshScanCommandAccepted(true)
    const refreshed = await refreshEddyState()
    if (commandRunIdRef.current !== runId) return
    if (refreshed) setMeshScanRefreshRunId(runId)
    else setMessage('Сканирование завершилось, но актуальный снимок карты не обновился.')
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
    if (saveKind !== null || localCommandPending) {
      commandRunIdRef.current += 1
      setOperationUncertain(true)
      setSaveError('Аварийная остановка отправлена во время незавершённой операции. Её итог неизвестен; повторный запуск и выход заблокированы.')
    }
    setSaveKind(null)
    setSaveAccepted(false)
    setSaveError('')
    try {
      const accepted = await run({ command: 'emergencyStop' }, false)
      if (!accepted) return
      const refreshed = await refreshEddyState()
      if (refreshed) setEmergencyRecoveryPending(true)
      else setSaveError('Аварийная остановка принята, но актуальное состояние принтера не обновлено. Блокировка сохранена.')
    } finally {
      setEmergencyPending(false)
    }
  }

  function commandReason(args: ExecuteCommandArgs, featureAvailable = true): string | null {
    if (!featureAvailable) return 'Эта команда не объявлена в возможностях подключённого принтера.'
    return getCommandBlockReason(args.command, args)
  }

  function commandButton(label: string, args: ExecuteCommandArgs, options: { secondary?: boolean; blocked?: boolean; reason?: string | null; onClick?: () => void } = {}) {
    const reason = options.reason ?? commandReason(args)
    return (
      <button
        type="button"
        className={joinClassNames('eddy-btn', options.secondary && 'is-secondary')}
        disabled={options.blocked || isBusy || operationUncertain || reason !== null}
        title={operationUncertain ? 'Операция принтера остаётся неопределённой.' : reason ?? undefined}
        onClick={options.onClick ?? (() => void run(args))}
      >
        {label}
      </button>
    )
  }

  function openProcedure(next: ProcedureId) {
    setMessage('')
    setProcedure(next)
    if (next === 'xyOffset') {
      setXOffsetDraft(eddy?.xOffsetMm?.toString() ?? '')
      setYOffsetDraft(eddy?.yOffsetMm?.toString() ?? '')
      setConfirmOffsets(false)
    }
  }

  function openOffsetEditor(field: 'x' | 'y') {
    const value = field === 'x' ? xOffsetDraft : yOffsetDraft
    setOffsetFieldDraft(value)
    replaceOffsetDraftRef.current = true
    setEditingOffsetField(field)
  }

  function enterOffsetDigit(digit: string) {
    setOffsetFieldDraft((current) => {
      const base = replaceOffsetDraftRef.current ? '' : current
      replaceOffsetDraftRef.current = false
      return `${base}${digit}`
    })
  }

  function enterOffsetDecimal() {
    setOffsetFieldDraft((current) => {
      replaceOffsetDraftRef.current = false
      if (current.includes('.')) return current
      return current === '' || current === '-' ? `${current}0.` : `${current}.`
    })
  }

  function toggleOffsetSign() {
    setOffsetFieldDraft((current) => {
      replaceOffsetDraftRef.current = false
      return current.startsWith('-') ? current.slice(1) : `-${current || '0'}`
    })
  }

  function submitOffsetDraft() {
    const parsed = Number(offsetFieldDraft)
    if (!offsetFieldDraft.trim() || !Number.isFinite(parsed)) return
    if (editingOffsetField === 'x') setXOffsetDraft(offsetFieldDraft)
    if (editingOffsetField === 'y') setYOffsetDraft(offsetFieldDraft)
    setConfirmOffsets(false)
    setEditingOffsetField(null)
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

  const xValue = Number(xOffsetDraft)
  const yValue = Number(yOffsetDraft)
  const offsetsValid = xOffsetDraft.trim() !== '' && yOffsetDraft.trim() !== '' && Number.isFinite(xValue) && Number.isFinite(yValue)
  const offsetArgs: ExecuteCommandArgs = { command: 'eddySetOffsets', xOffsetMm: xValue, yOffsetMm: yValue }
  const offsetBlock = offsetsValid ? commandReason(offsetArgs, offsetsCapability) : 'Введите два конечных числовых значения.'
  const zOffsetSaveReason = !zSaveCapability
    ? commandReason({ command: 'eddyZOffsetSave' }, zSaveCapability)
    : zOffsetDelta === 0
      ? 'Сначала измените Z-offset на экране.'
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
  const probedMatrix = calibration?.mesh.probedMatrix ?? []
  const matrix = probedMatrix.length > 0 ? probedMatrix : calibration?.mesh.meshMatrix ?? []
  const matrixIsLatestProbe = probedMatrix.length > 0
  const meshScanHasNewMatrix = meshScanCommandAccepted
    && meshScanRefreshRunId !== null
    && meshScanRefreshRunId === commandRunIdRef.current
    && probedMatrix.length > 0
    && probedMatrix.every((row) => row.length > 0 && row.every((value) => typeof value === 'number' && Number.isFinite(value)))
  const measuredMeshValues = matrix.flatMap((row) => row.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)))
  const measuredMeshMin = measuredMeshValues.length > 0 ? Math.min(...measuredMeshValues) : null
  const measuredMeshMax = measuredMeshValues.length > 0 ? Math.max(...measuredMeshValues) : null
  const screws = calibration?.screws
  const screwsFresh = screwsRefreshRunId !== null
    && screwsRefreshRunId === commandRunIdRef.current
    && (screws?.results.length ?? 0) >= 4
    && screws?.error === false

  function renderOverview() {
    const cards = [
      { id: 'driveCurrent' as const, label: 'Код тока катушки', value: eddy?.driveCurrent == null ? 'Неизвестно' : String(eddy.driveCurrent), state: eddy?.driveCurrent == null ? 'Неизвестно' : 'Значение регистра' },
      { id: 'height' as const, label: 'Высота Eddy', value: statusText(eddy?.heightCalibrated), state: statusText(eddy?.heightCalibrated) },
      { id: 'temperature' as const, label: 'Компенсация температуры', value: statusText(eddy?.compensationEnabled), state: statusText(eddy?.compensationEnabled) },
      { id: 'z0' as const, label: 'Z0', value: statusText(snapshot.v2.eddy.calibration.z0Done), state: snapshot.v2.eddy.calibration.z0Done ? 'Подтверждено Klipper' : 'Не подтверждено' },
      { id: 'offsets' as const, label: 'Смещения Z', value: eddy?.zOffsetMm == null ? 'Числовое значение не публикуется' : valueText(eddy.zOffsetMm), state: statusText(eddy?.heightCalibrated) },
      { id: 'accuracy' as const, label: 'Повторяемость', value: accuracyResult ?? 'Измерение не запускалось', state: accuracyResult === null ? 'Нет замера в этой сессии' : 'Есть результат' },
      { id: 'screws' as const, label: 'Винты стола', value: valueText(screws?.maxDeviationMm), state: screws?.error == null ? 'Неизвестно' : screws.error ? 'Есть ошибка' : 'Есть результат' },
      { id: 'mesh' as const, label: 'Карта стола', value: measuredMeshValues.length > 0 ? `${valueText(measuredMeshMin)} … ${valueText(measuredMeshMax)}` : 'Нет измеренной карты', state: calibration?.mesh.profile ?? 'Профиль неизвестен' },
      { id: 'xyOffset' as const, label: 'XY-смещение', value: `X ${valueText(eddy?.xOffsetMm)} · Y ${valueText(eddy?.yOffsetMm)}`, state: eddy?.xOffsetMm == null || eddy?.yOffsetMm == null ? 'Неизвестно' : 'В конфигурации' },
      { id: 'firstLayer' as const, label: 'Первый слой', value: snapshot.printJob.state === 'complete' ? 'Последняя печать завершена' : 'Тест ещё не запускался', state: calibration?.config.savePending || calibration?.config.pendingSections.length ? 'Есть несохранённые изменения' : 'Оценка не сохранена' },
    ]
    return (
      <>
        <section className="eddy-overview-grid" aria-label="Фактическое состояние калибровок">
          {cards.map((card) => (
            <button className="eddy-overview-card" key={card.id} type="button" onClick={() => openProcedure(card.id)}>
              <span className="eddy-card-state">{card.state}</span>
              <strong>{card.label}</strong>
              <span className="eddy-card-value">{card.value}</span>
            </button>
          ))}
        </section>
        <section className="eddy-sequence" aria-label="Полная последовательность калибровки">
          <p>Полная настройка</p>
          <ol>{PROCEDURES.map((item, index) => <li key={item.id}><span>{String(index + 1).padStart(2, '0')}</span>{item.title}</li>)}</ol>
          <button type="button" className="eddy-btn" onClick={() => openProcedure('driveCurrent')}>Начать последовательность</button>
        </section>
      </>
    )
  }

  function renderProcedure() {
    switch (procedure) {
      case 'driveCurrent':
        return <>
          <p>Убедитесь, что сопло и стол остыли, а датчик и кабель закреплены. Запустите настройку тока катушки и дождитесь ответа Klipper.</p>
          <div className="eddy-metric"><span>Код настройки тока</span><strong>{eddy?.driveCurrent == null ? 'Неизвестно' : String(eddy.driveCurrent)}</strong><small>Значение регистра 0–31 без единиц измерения.</small></div>
          {commandButton('Настроить код тока катушки', { command: 'eddyDriveCurrentCalibrate' }, { reason: blockCalibration })}
        </>
      case 'height':
        return <>
          <p>Поставьте чистую бумагу на стол. Команды TESTZ перемещают сопло малыми шагами; измерение и сохранение выполняются отдельно.</p>
          <div className="eddy-metric"><span>Привязанные оси</span><strong>{snapshot.homedAxes.toUpperCase() || 'Нет'}</strong><small>Перед ручной проверкой нужны X, Y и безопасная нижняя Z-опора.</small></div>
          {!allAxesHomed && commandButton('Подготовить XY и нижнюю Z-опору', { command: 'homeXY' }, { reason: commandReason({ command: 'homeXY' }), onClick: () => void run({ command: 'homeXY' }) })}
          <div className="eddy-metric"><span>Текущая высота</span><strong>{valueText(calibration?.manualProbe.zMm)}</strong><small>Диапазон измерения: {valueText(calibration?.manualProbe.zMinimumMm)} … {valueText(calibration?.manualProbe.zMaximumMm)}</small></div>
          {!activeManualSession && commandButton('Начать проверку по бумаге', { command: 'eddyPrimaryHeightStart' }, { reason: blockCalibration ?? (!allAxesHomed ? 'Сначала привяжите X, Y и Z безопасной командой G28 X Y.' : null) })}
          {activeManualSession && <>
            <div className="eddy-action-grid eddy-testz">{EDDY_TEST_Z_STEP_OPTIONS.map((deltaMm) => {
              const label = `${deltaMm > 0 ? '+' : ''}${deltaMm}`
              const args: ExecuteCommandArgs = { command: 'eddyTestZ', deltaMm }
              return <button key={deltaMm} type="button" disabled={isBusy || operationUncertain || getCommandBlockReason(args.command, args) !== null} onClick={() => void run(args)}>{label} мм</button>
            })}</div>
            <div className="eddy-action-row">
              {commandButton('Принять высоту и сохранить', { command: 'eddyPrimaryAcceptSave' }, { reason: blockCalibration, onClick: () => void beginSave('height', { command: 'eddyPrimaryAcceptSave' }) })}
              {abortCapability && commandButton('Отменить ручное измерение', { command: 'eddyAbort' }, { secondary: true, reason: commandReason({ command: 'eddyAbort' }, abortCapability) })}
            </div>
          </>}
          {!activeManualSession && <p>Состояние: {statusText(eddy?.heightCalibrated)}</p>}
        </>
      case 'temperature':
        return <>
          <p>Запустите температурную серию. Наблюдайте за фактическими температурами сопла и стола и принимайте каждую точку отдельно. Завершение серии записывает результат и перезапускает Klipper.</p>
          {activeTemperatureSession || temperaturePoints.nozzle.length > 0 ? <section className="eddy-chart-area" aria-label="График температурной калибровки">
            <div className="eddy-chart-readings"><strong>Катушка {valueText(eddy?.temperatureC, 1, '°C')}</strong><span>Расширение {valueText(eddy?.estimatedExpansionMm)}</span><span>Измерено точек: {eddy?.temperaturePoints ?? 'Неизвестно'}</span></div>
            <TemperatureTrendChart height={250} testId="eddy-temperature-chart" series={[
              { id: 'nozzle', label: 'Сопло', tone: 'orange', points: temperaturePoints.nozzle },
              { id: 'bed', label: 'Стол', tone: 'green', points: temperaturePoints.bed },
            ]} />
            <p>Сплошная линия — фактическая температура; пунктир — цель.</p>
          </section> : <div className="eddy-metric"><span>Компенсация температуры</span><strong>{statusText(eddy?.compensationEnabled)}</strong></div>}
          {!activeTemperatureSession && commandButton('Начать температурную серию', { command: 'eddyTemperatureStart' }, { reason: blockCalibration })}
          {activeTemperatureSession && <div className="eddy-action-row">
            {commandButton('Принять текущую точку', { command: 'eddyTemperatureAccept' }, { reason: temperatureAcceptReason })}
            {commandButton('Завершить серию и сохранить', { command: 'eddyTemperatureComplete' }, { secondary: true, reason: temperatureCompleteReason, onClick: () => void beginSave('temperature', { command: 'eddyTemperatureComplete' }) })}
            {abortCapability && commandButton('Отменить серию', { command: 'eddyAbort' }, { secondary: true, reason: commandReason({ command: 'eddyAbort' }, abortCapability) })}
          </div>}
        </>
      case 'z0':
        return <>
          <p>Команда выполнит G28 и проверит Eddy Z0. Координаты из предварительного ответа Klipper показываются отдельно; результат подтверждается только после обновления этапа калибровки.</p>
          <div className="eddy-metric"><span>Проверка Z0</span><strong>{z0Running ? 'Команда выполняется…' : z0Confirmed ? 'Подтверждено после команды' : z0CommandAccepted ? 'Команда принята; ждём обновления статуса' : statusText(snapshot.v2.eddy.calibration.z0Done)}</strong><small>{z0Confirmed ? 'Klipper перешёл к этапу регулировки винтов.' : 'Одного предварительного сообщения с координатами недостаточно.'}</small></div>
          {z0Result && <div className="eddy-metric"><span>Координаты до проверки</span><strong>{z0Result}</strong></div>}
          {commandButton('Проверить Z0', { command: 'eddyCheckZ0' }, { blocked: z0Running || z0CommandAccepted && !z0Confirmed || blockCalibration !== null, reason: blockCalibration ?? getCommandBlockReason('eddyCheckZ0'), onClick: () => void runProbe('eddyCheckZ0') })}
        </>
      case 'offsets':
        return <>
          <p>Изменяйте живую поправку шагом ±0,05 мм. Scalar Z-offset датчик не публикует; итог подтверждается проверенной высотной калибровкой после перезапуска.</p>
          <div className="eddy-metric"><span>Сохранённая калибровка высоты</span><strong>{statusText(eddy?.heightCalibrated)}</strong><small>Поправка этой сессии: {valueText(zOffsetDelta)} · сохранение ожидает подтверждения после перезапуска.</small></div>
          <div className="eddy-action-row">
            {commandButton('− 0,05 мм', { command: 'eddyZOffsetAdjust', deltaMm: -0.05 }, { reason: commandReason({ command: 'eddyZOffsetAdjust', deltaMm: -0.05 }, zAdjustCapability), onClick: async () => { if (await run({ command: 'eddyZOffsetAdjust', deltaMm: -0.05 })) setZOffsetDelta((delta) => delta - 0.05) } })}
            {commandButton('+ 0,05 мм', { command: 'eddyZOffsetAdjust', deltaMm: 0.05 }, { reason: commandReason({ command: 'eddyZOffsetAdjust', deltaMm: 0.05 }, zAdjustCapability), onClick: async () => { if (await run({ command: 'eddyZOffsetAdjust', deltaMm: 0.05 })) setZOffsetDelta((delta) => delta + 0.05) } })}
            {confirmZOffsetSave
              ? commandButton('Подтвердить запись и перезапуск', { command: 'eddyZOffsetSave' }, { secondary: true, reason: zOffsetSaveReason, onClick: () => void beginSave('zOffset', { command: 'eddyZOffsetSave' }) })
              : <button type="button" className="eddy-btn is-secondary" disabled={zOffsetSaveReason !== null || isBusy || operationUncertain} title={operationUncertain ? 'Операция принтера остаётся неопределённой.' : zOffsetSaveReason ?? undefined} onClick={() => setConfirmZOffsetSave(true)}>Проверить сохранение Z-offset</button>}
          </div>
          <p className="eddy-warning">Подтверждённое числовое смещение принтер не публикует. После записи UI ждёт готовность Klipper, очищенный pending и подтверждённую высотную калибровку.</p>
        </>
      case 'accuracy':
        return <>
          <p>PROBE_ACCURACY выполняет измерение датчика в текущей точке. Результат берётся из ответа Klipper: размах, среднее и стандартное отклонение.</p>
          <div className="eddy-metric"><span>Последний результат</span><strong>{accuracyRunning ? 'Ожидаем ответ Klipper…' : accuracyResult ?? 'Замер не запускался'}</strong></div>
          {commandButton('Запустить PROBE_ACCURACY', { command: 'eddyProbeAccuracy' }, { blocked: accuracyRunning || !accuracyCapability || blockCalibration !== null, reason: commandReason({ command: 'eddyProbeAccuracy' }, accuracyCapability) ?? blockCalibration, onClick: () => void runProbe('eddyProbeAccuracy') })}
        </>
      case 'screws':
        return <>
          <p>Измерьте все точки стола, отрегулируйте винты по подсказкам и выполните повторный замер. Подтверждение доступно только после свежего ответа с результатами.</p>
          {screws?.results.length ? <div className="eddy-table-wrap"><table><caption>Результаты винтового замера</caption><thead><tr><th>Винт</th><th>X / Y</th><th>Z</th><th>Знак</th><th>Поворот</th></tr></thead><tbody>{screws.results.map((item) => <tr key={item.name}><th scope="row">{item.name}{item.isBase === true ? ' · база' : ''}</th><td>{valueText(item.xMm)} / {valueText(item.yMm)}</td><td>{valueText(item.zMm)}</td><td>{item.sign ?? '—'}</td><td>{item.adjust ?? '—'}</td></tr>)}</tbody></table></div> : <p>Данные винтового замера неизвестны.</p>}
          <div className="eddy-metric"><span>Максимальное отклонение · {screwsFresh ? 'принятый замер и обновлённый снимок' : 'последние доступные данные'}</span><strong>{valueText(screws?.maxDeviationMm)}</strong></div>
          <div className="eddy-action-row">
            {commandButton('Измерить винты', { command: 'eddyScrewsTiltStart' }, { reason: blockCalibration, onClick: () => void runScrewsMeasurement() })}
            {commandButton('Подтвердить после повторного замера', { command: 'eddyScrewsTiltDone' }, { secondary: true, blocked: !screwsFresh || screws?.error !== false || screws.results.length < 4, reason: !screwsFresh ? 'Нужен принятый повторный замер с четырьмя обновлёнными точками.' : screws?.error !== false ? 'Проверьте ошибки винтового замера.' : null })}
          </div>
        </>
      case 'mesh':
        return <>
          <p>Постройте карту стола и проверьте профиль, границы области сканирования и реальные значения измерений.</p>
          <div className="eddy-mesh-summary"><div><span>Профиль</span><strong>{calibration?.mesh.profile ?? 'Неизвестно'}</strong></div><div><span>Высота min / max</span><strong>{valueText(measuredMeshMin)} / {valueText(measuredMeshMax)}</strong></div><div><span>Границы X</span><strong>{valueText(calibration?.mesh.min?.[0])} … {valueText(calibration?.mesh.max?.[0])}</strong></div><div><span>Границы Y</span><strong>{valueText(calibration?.mesh.min?.[1])} … {valueText(calibration?.mesh.max?.[1])}</strong></div></div>
          {matrix.length > 0 ? <div className="eddy-heightmap" role="img" aria-label={`Карта высот стола, ${matrix.length} строк, min ${valueText(measuredMeshMin)}, max ${valueText(measuredMeshMax)}`}>
            {matrix.map((row, rowIndex) => <div key={rowIndex}>{row.map((value, columnIndex) => <span key={columnIndex} title={`${rowIndex + 1}, ${columnIndex + 1}: ${valueText(value)}`}>{value === null ? '—' : value.toFixed(2)}</span>)}</div>)}
          </div> : <p>Матрица измерений пока неизвестна.</p>}
          {matrix.length > 0 && <p>Источник матрицы: {matrixIsLatestProbe ? 'последние доступные значения сканирования' : 'загруженный профиль стола'}.</p>}
          <p>{meshCommandFinished ? 'Сохранённый профиль default совпадает с картой после перезапуска.' : meshScanHasNewMatrix ? 'Команда сканирования принята, целевой снимок обновлён. Проверьте карту перед записью.' : meshScanCommandAccepted ? 'Команда сканирования завершилась, но свежий целевой снимок с полной матрицей не подтверждён.' : 'Сканирование и сохранение разделены: сначала получите карту без записи, затем проверьте результат.'}</p>
          {commandButton('Сканировать карту без записи', { command: 'eddyScanMesh', save: false }, { reason: blockCalibration, onClick: () => void runMeshScan() })}
          {meshScanHasNewMatrix && <button type="button" className="eddy-btn is-secondary" disabled={isBusy || operationUncertain || saveKind !== null || blockCalibration !== null} title={operationUncertain ? 'Операция принтера остаётся неопределённой.' : blockCalibration ?? undefined} onClick={() => { setMeshSaveTarget(probedMatrix); void beginSave('mesh', { command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' }) }}>Сохранить профиль и перезапустить</button>}
        </>
      case 'xyOffset':
        return <>
          <p>Выполните измерение XY-смещения датчика относительно сопла по инструкции профиля. Введите измеренные значения и проверьте старые и новые параметры перед записью.</p>
          <div className="eddy-offset-fields">
            <div><span>X-смещение, мм</span><button type="button" aria-label="Новое X-смещение, мм" disabled={isBusy || operationUncertain} onClick={() => openOffsetEditor('x')}>{xOffsetDraft || 'Введите значение'} мм</button></div>
            <div><span>Y-смещение, мм</span><button type="button" aria-label="Новое Y-смещение, мм" disabled={isBusy || operationUncertain} onClick={() => openOffsetEditor('y')}>{yOffsetDraft || 'Введите значение'} мм</button></div>
          </div>
          <div className="eddy-offset-diff"><div><span>Сохранено</span><strong>X {valueText(eddy?.xOffsetMm)} · Y {valueText(eddy?.yOffsetMm)}</strong></div><div><span>Будет записано</span><strong>X {offsetsValid ? valueText(xValue) : '—'} · Y {offsetsValid ? valueText(yValue) : '—'}</strong></div></div>
          <p className="eddy-warning">Запись изменит локальный конфиг, перезапустит Klipper и потребует повторной калибровки высоты и температуры.</p>
          {confirmOffsets ? <div className="eddy-confirm-panel" role="group" aria-label="Подтверждение XY-смещения"><strong>Записать новые смещения и перезапустить Klipper?</strong><div className="eddy-action-row"><button type="button" className="eddy-btn" disabled={offsetBlock !== null || !offsetsValid || isBusy || operationUncertain} onClick={() => void beginSave('xyOffset', offsetArgs)}>Подтвердить запись и перезапуск</button><button type="button" className="eddy-btn is-secondary" disabled={operationUncertain} onClick={() => setConfirmOffsets(false)}>Изменить значения</button></div></div> : <button type="button" className="eddy-btn" disabled={!offsetsValid || offsetBlock !== null || isBusy || operationUncertain} title={operationUncertain ? 'Операция принтера остаётся неопределённой.' : offsetBlock ?? undefined} onClick={() => setConfirmOffsets(true)}>Проверить изменения</button>}
        </>
      case 'firstLayer':
        return <>
          <p>Выберите заранее подготовленный G-code первого слоя. Экран не генерирует модель и не определяет пригодность файла вместо вас.</p>
          {snapshot.printFiles.length > 0 ? <label className="eddy-file-picker">Файл теста<select value={selectedFile} onChange={(event) => setSelectedFile(event.target.value)}><option value="">Выберите загруженный G-code</option>{snapshot.printFiles.map((file) => <option key={file.id} value={file.path}>{file.name}</option>)}</select></label> : <p role="status">Список файлов недоступен. Загрузите подготовленный тест первого слоя через раздел файлов.</p>}
          {selectedCalibrationFile && <div className="eddy-metric"><span>Выбранный файл</span><strong>{selectedCalibrationFile.name}</strong><small>Печать запустится через обычную команду принтера. Следите за первым слоем.</small></div>}
          {activePrint && <>
            <div className="eddy-metric"><span>Печать</span><strong>{snapshot.printJob.filename} · {snapshot.printJob.progressPercent}%</strong><small>Слой {snapshot.printJob.currentLayer ?? '—'} / {snapshot.printJob.totalLayer ?? '—'}{activeCalibrationPrint ? ` · накопленная поправка ${valueText(snapshot.runtimeTune.appliedBabystepMm)}` : ' · выберите этот файл как тест первого слоя для коррекции'}</small></div>
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
          </>}
          {!activePrint && printStartArgs !== null && commandButton('Запустить выбранный тест', printStartArgs, { blocked: !ready || isBusy, reason: !ready ? 'Нужно подключение к готовому принтеру.' : getCommandBlockReason('start', printStartArgs), onClick: () => void startFirstLayerTest() })}
          {snapshot.printJob.state === 'complete' || snapshot.printJob.state === 'cancelled' ? <div className="eddy-metric"><span>{firstLayerObservedPath !== null && firstLayerObservedPath === firstLayerStartedPath && observedPrintPath === firstLayerObservedPath ? snapshot.printJob.state === 'complete' ? 'Наблюдавшийся тест завершён' : 'Наблюдавшийся тест отменён' : 'Последняя печать'}</span><strong>{firstLayerObservedPath !== null && firstLayerObservedPath === firstLayerStartedPath && observedPrintPath === firstLayerObservedPath
            ? calibration?.config.savePending || calibration?.config.pendingSections.length ? `Есть несохранённые изменения: ${calibration.config.pendingSections.join(', ') || 'разделы неизвестны'}` : 'Конфигурация не ожидает сохранения'
            : 'Статус завершённой печати не связан с наблюдавшимся запуском этого теста.'}</strong></div> : null}
        </>
      case 'overview':
        return null
    }
  }

  const activeTitle = PROCEDURES.find((item) => item.id === procedure)?.title ?? 'Калибровки Eddy'
  const procedureStatus = operationUncertain
    ? 'Операция неизвестна'
    : saveKind !== null
    ? 'Сохранение и перезапуск'
    : isBusy
      ? 'Команда выполняется'
      : activeManualSession
        ? 'Ручное измерение активно'
        : activeTemperatureSession
          ? 'Температурная серия активна'
          : accuracyRunning || z0Running
            ? 'Ожидаем ответ Klipper'
            : saveError
              ? 'Сохранение не подтверждено'
              : procedure === 'overview'
                ? 'Состояние принтера'
                : message.includes('подтверждены')
                  ? 'Результат подтверждён'
                  : 'Подготовка'
  const emergencyAllowed = snapshot.capabilities.serviceCommands && getCommandBlockReason('emergencyStop') === null
  const emergencyActionVisible = activeSession || isBusy || saveKind !== null || accuracyRunning || z0Running || operationUncertain

  return (
    <article className="eddy-workflow">
      <header className="eddy-header">
        <button type="button" disabled={backBlocked} onClick={onBackToList}>К списку макросов</button>
        <div><p>Калибровка / Eddy{snapshot.source === 'mock' ? ' / Симуляция' : ''}</p><h2>{procedure === 'overview' ? 'Обзор калибровок' : activeTitle}</h2></div>
        <span>{procedureStatus}</span>
      </header>
      <main className={joinClassNames('eddy-body', procedure === 'overview' && 'is-overview')}>
        {procedure !== 'overview' && <><h2>{activeTitle}</h2><section className="eddy-procedure-content">{renderProcedure()}</section></>}
        {procedure === 'overview' && <>{renderOverview()}</>}
        {message && <p className="eddy-message" role="status">{message}</p>}
        {saveError && <p className="eddy-message is-error" role="alert">{saveError}</p>}
        {saveKind !== null && !operationUncertain && <p className="eddy-message" role="status">Команда принята. Ждём перезапуск, готовность Klipper и подтверждение конфигурации…</p>}
        {operationUncertain && <p className="eddy-message is-error" role="status">Операция принтера остаётся неопределённой. Продолжение заблокировано до проверки состояния принтера.</p>}
      </main>
      <footer className="eddy-footer">
        <button type="button" disabled={backBlocked || procedure === 'overview'} onClick={() => openProcedure('overview')}>К обзору</button>
        {activeSession && abortCapability && commandButton('Отменить текущий этап', { command: 'eddyAbort' }, { secondary: true, reason: commandReason({ command: 'eddyAbort' }, abortCapability) })}
        {emergencyActionVisible && <button type="button" className="eddy-danger" disabled={!emergencyAllowed || emergencyPending} onClick={() => setConfirmEmergency(true)}>Аварийная остановка</button>}
        {procedure === 'overview' && <span className="eddy-footer-note">Состояния из конфигурации и телеметрии; неизвестные значения отмечены явно.</span>}
      </footer>
      {editingOffsetField !== null && createPortal(<div className="eddy-offset-dialog tune-value-workspace is-keyboard-open" role="dialog" aria-modal="true" aria-label={`Изменить ${editingOffsetField.toUpperCase()}-смещение`} ref={offsetDialogRef}>
        <div className="eddy-offset-editor">
          <TuneValueEditor label={`${editingOffsetField.toUpperCase()}-смещение, мм`} icon="metricSpeed">
            <label className="eddy-offset-input"><input aria-label={`${editingOffsetField.toUpperCase()}-смещение, мм`} type="text" inputMode="decimal" value={offsetFieldDraft} onChange={(event) => { setOffsetFieldDraft(event.target.value); replaceOffsetDraftRef.current = false }} onKeyDown={(event) => { if (event.key === 'Enter') submitOffsetDraft() }} /><span>мм</span></label>
          </TuneValueEditor>
          <p>Введите измеренное смещение. Допускаются положительные и отрицательные значения.</p>
          <div className="eddy-offset-editor-actions"><button type="button" aria-label="Изменить знак" onClick={toggleOffsetSign}>±</button><button type="button" onClick={() => setEditingOffsetField(null)}>Назад</button></div>
        </div>
        <NumericKeypad label={`${editingOffsetField.toUpperCase()}-смещение`} ariaLabel="Клавиатура XY-смещения" closeLabel="Закрыть ввод смещения" value={offsetFieldDraft} unit="мм" onDigit={enterOffsetDigit} onClear={() => { setOffsetFieldDraft(''); replaceOffsetDraftRef.current = false }} onBackspace={() => { setOffsetFieldDraft((value) => value.slice(0, -1)); replaceOffsetDraftRef.current = false }} onDecimal={enterOffsetDecimal} onSubmit={submitOffsetDraft} onClose={() => setEditingOffsetField(null)} testIdPrefix="eddy-offset" />
      </div>, document.body)}
      {confirmEmergency && <div className="eddy-dialog-layer" role="presentation"><section className="eddy-dialog" role="alertdialog" aria-modal="true" aria-labelledby="eddy-emergency-title" aria-describedby="eddy-emergency-warning"><h2 id="eddy-emergency-title">Аварийная остановка</h2><p id="eddy-emergency-warning">Команда немедленно остановит принтер. После неё проверьте механику и состояние Klipper перед продолжением.</p><div className="eddy-action-row"><button ref={emergencyButtonRef} type="button" className="eddy-danger" disabled={!emergencyAllowed || emergencyPending} onClick={() => void stopEmergency()}>Подтвердить остановку</button><button type="button" className="eddy-btn is-secondary" disabled={emergencyPending} onClick={() => setConfirmEmergency(false)}>Отмена</button></div></section></div>}
    </article>
  )
}
