import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MacrosContainerProps } from './MacrosContainer'
import { CalibrationPreview } from './CalibrationPreview'
import { ExtruderStudy, MaterialStudy, MotionStudy, ShaperSpectrum } from './ProcedureVisuals'
import { parseShaperSpectrumCsv } from './shaperResonanceCsv'
import type { ShaperSpectrumAxis } from './ProcedureVisuals'
import type { PrinterShaperResonanceReport } from '../core/transport/types'
import { isPrintJobActive } from '../core/transport/types'
import { subscribePrinterGcodeResponses } from '../core/store/printerNotifications'
import { NumericKeypad, TuneValueEditor, useModalFocus } from '../ui'
import './calibrationProcedures.css'

type EddyProcedure = 'overview' | 'screws' | 'mesh' | 'firstLayer'
type Procedure = 'catalog' | 'shaper' | 'extruder' | 'material' | 'service'
type MaterialStep = 'test' | 'file' | 'prepare'
type MaterialTest = 'pa' | 'flow' | 'temperature' | 'retraction' | 'maxFlow'
type ShaperAction = 'calibration' | 'adxlQuery' | 'adxlNoise'
type ExtruderField = 'length' | 'speed' | 'temperature' | 'actual'
type ShaperTarget = { typeX: string; typeY: string; freqXHz: number; freqYHz: number }
type AdxlDiagnostic = { kind: 'query' | 'noise'; chipAxes: string; x: number; y: number; z: number }
const OPERATION_TIMEOUT_MS = 90_000
const MATERIAL_TESTS: Array<{ id: MaterialTest; title: string; guidance: string }> = [
  { id: 'pa', title: 'Pressure Advance', guidance: 'Сравните углы и переходы теста; выбранный коэффициент запишите в профиль материала слайсера.' },
  { id: 'flow', title: 'Расход', guidance: 'Сравните поверхность и геометрию образца; корректировку расхода внесите в профиль слайсера.' },
  { id: 'temperature', title: 'Температура', guidance: 'Сравните участки температурной башни по мостам, нависаниям и нитям.' },
  { id: 'retraction', title: 'Ретракт', guidance: 'Сравните тестовые столбики по нитям и пропускам после перемещения.' },
  { id: 'maxFlow', title: 'Макс. поток', guidance: 'Найдите участок с ухудшением заполнения/поверхности; внесите найденный предел в слайсер.' },
]
const MATERIAL_TASKS: Record<MaterialTest, string> = { pa: 'Найдите участок с ровными углами', flow: 'Сравните равномерность поверхности', temperature: 'Выберите лучший участок башни', retraction: 'Сравните нити между столбиками', maxFlow: 'Найдите начало ухудшения поверхности' }
const emptySpectra = (): Record<'x' | 'y', ShaperSpectrumAxis> => ({ x: { points: [], error: null }, y: { points: [], error: null } })

type Props = MacrosContainerProps & {
  completedRequiredCount: number
  catalogFolder: 'root' | 'eddy'
  onCatalogFolderChange: (folder: 'root' | 'eddy') => void
  onOpenPid: () => void
  onOpenEddy: (procedure: EddyProcedure) => void
}

const READY = (snapshot: Props['snapshot']) => snapshot.transport.state === 'online' && snapshot.klippy.state === 'ready'
function parseShaperTarget(message: string, current: Partial<ShaperTarget>): Partial<ShaperTarget> {
  const x = message.match(/Recommended\s+shaper_type_x\s*=\s*([a-z0-9_]+)[,\s]+shaper_freq_x\s*=\s*([\d.]+)/i)
  const y = message.match(/Recommended\s+shaper_type_y\s*=\s*([a-z0-9_]+)[,\s]+shaper_freq_y\s*=\s*([\d.]+)/i)
  return {
    ...current,
    ...(x && Number.isFinite(Number(x[2])) ? { typeX: x[1], freqXHz: Number(x[2]) } : {}),
    ...(y && Number.isFinite(Number(y[2])) ? { typeY: y[1], freqYHz: Number(y[2]) } : {}),
  }
}

function parseAdxlDiagnostic(message: string, kind: AdxlDiagnostic['kind']): AdxlDiagnostic | null {
  const number = '([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[-+]?\\d+)?)'
  const match = kind === 'query'
    ? message.match(new RegExp(`(?:[a-z0-9_-]+\\s+)*values\\s*\\(x,\\s*y,\\s*z\\)\\s*:\\s*${number}\\s*,\\s*${number}\\s*,\\s*${number}`, 'i'))
    : message.match(new RegExp(`axes noise for ([xyz]+)-axis accelerometer:\\s*${number}\\s*\\(x\\),\\s*${number}\\s*\\(y\\),\\s*${number}\\s*\\(z\\)`, 'i'))
  if (!match) return null
  const values = match.slice(kind === 'query' ? 1 : 2, kind === 'query' ? 4 : 5).map(Number)
  if (!values.every(Number.isFinite)) return null
  return { kind, chipAxes: kind === 'noise' ? match[1].toUpperCase() : '', x: values[0], y: values[1], z: values[2] }
}

function canonicalPrintPath(path: string): string {
  return path.replace(/^\/+/, '')
}

function CalibrationProcedures({ snapshot, pendingCommand, executeCommand, getCommandBlockReason, fetchShaperResonances, onCalibrationActivityChange, completedRequiredCount, catalogFolder, onCatalogFolderChange, onOpenPid, onOpenEddy }: Props) {
  const [procedure, setProcedure] = useState<Procedure>('catalog')
  const [message, setMessage] = useState('')
  const [stage, setStage] = useState<'idle' | 'running' | 'result' | 'applying' | 'saving' | 'applied' | 'saved' | 'error' | 'stopped'>('idle')
  const [shaperMode, setShaperMode] = useState<'full' | 'light'>('full')
  const [shaperTarget, setShaperTarget] = useState<Partial<ShaperTarget>>({})
  const [shaperAction, setShaperAction] = useState<ShaperAction | null>(null)
  const [adxlDiagnostic, setAdxlDiagnostic] = useState<AdxlDiagnostic | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [spectrumAxis, setSpectrumAxis] = useState<'x' | 'y'>('x')
  const [spectra, setSpectra] = useState(emptySpectra)
  const [spectrumLoading, setSpectrumLoading] = useState(false)
  const [baselinePreparing, setBaselinePreparing] = useState(false)
  const spectrumToken = useRef(0)
  const collectingShaperRun = useRef<number | null>(null)
  const shaperRecommendationWaiter = useRef<{ id: number; timer: number; resolve: (received: boolean) => void } | null>(null)
  const ownedShaperRun = useRef<number | null>(null)
  const preparingShaper = useRef(false)
  const sessionActive = useRef(false)
  const activityCallback = useRef(onCalibrationActivityChange)
  activityCallback.current = onCalibrationActivityChange
  const latestCommandState = useRef({ snapshot, pendingCommand, getCommandBlockReason })
  latestCommandState.current = { snapshot, pendingCommand, getCommandBlockReason }
  const [extrudeLength, setExtrudeLength] = useState('100')
  const [extrudeSpeed, setExtrudeSpeed] = useState('2')
  const [extrudeTemperature, setExtrudeTemperature] = useState('200')
  const [measuredLength, setMeasuredLength] = useState('')
  const [measurementRotation, setMeasurementRotation] = useState<number | null>(null)
  const [measurementRequestedLength, setMeasurementRequestedLength] = useState<number | null>(null)
  const [editingField, setEditingField] = useState<ExtruderField | null>(null)
  const [fieldDraft, setFieldDraft] = useState('')
  const [rotationDraft, setRotationDraft] = useState<number | null>(null)
  const [selectedFile, setSelectedFile] = useState('')
  const [materialTest, setMaterialTest] = useState<MaterialTest | null>(null)
  const [materialStep, setMaterialStep] = useState<MaterialStep>('test')
  const [filamentChecked, setFilamentChecked] = useState(false)
  const [testChecked, setTestChecked] = useState(false)
  const [materialStartedFile, setMaterialStartedFile] = useState<string | null>(null)
  const [materialFinishedState, setMaterialFinishedState] = useState<'complete' | 'cancelled' | null>(null)
  const latestResponse = useRef('')
  const latestShaperTarget = useRef<Partial<ShaperTarget>>({})
  const runId = useRef(0)
  const running = useRef(false)
  const saveRestartSeen = useRef(false)
  const pendingSaveKind = useRef<'shaper' | 'extruder' | null>(null)
  const materialObservedActive = useRef(false)
  const pendingApply = useRef(false)
  const operationDeadline = useRef<number | null>(null)
  const [operationUncertain, setOperationUncertain] = useState(false)
  const baselineRotationUpdatedAt = useRef<string | null>(null)
  const replaceFieldDraft = useRef(true)
  const fieldDialog = useModalFocus<HTMLDivElement>(editingField !== null, () => setEditingField(null))
  const activePrint = isPrintJobActive(snapshot.printJob)
  const ready = READY(snapshot)
  const calibration = snapshot.calibration
  const blockedBase = activePrint ? 'Завершите печать перед калибровкой.'
    : !ready ? 'Нужно подключение к готовому принтеру.'
      : pendingCommand !== null ? 'Дождитесь завершения другой команды.' : null
  const calibrationBlock = blockedBase ?? (!calibration ? 'Данные калибровки недоступны в снимке принтера.' : null)
  const targetExtrudeLength = Number(extrudeLength)
  const targetExtrudeSpeed = Number(extrudeSpeed)
  const targetExtrudeTemperature = Number(extrudeTemperature)
  const actualExtruded = Number(measuredLength)
  const oldRotation = calibration?.extruder.rotationDistanceMm ?? null
  const calculatedRotation = measurementRotation !== null && measurementRequestedLength !== null
    && Number.isFinite(actualExtruded) && actualExtruded >= 1 && actualExtruded <= 120
    ? measurementRotation * actualExtruded / measurementRequestedLength : null
  const extruderArgs = { command: 'extruderCalibrationExtrude' as const, lengthMm: targetExtrudeLength, speedMmPerSec: targetExtrudeSpeed, targetCelsius: targetExtrudeTemperature }
  const extruderInputValid = Number.isFinite(targetExtrudeLength) && targetExtrudeLength >= 1 && targetExtrudeLength <= 120
    && Number.isFinite(targetExtrudeSpeed) && targetExtrudeSpeed >= 0.1 && targetExtrudeSpeed <= 5
    && Number.isInteger(targetExtrudeTemperature) && targetExtrudeTemperature >= 170
    && targetExtrudeTemperature < Math.ceil(snapshot.limits.nozzleMaxC)
  const extruderSaveArgs = rotationDraft === null ? null : { command: 'extruderRotationDistanceSave' as const, distanceMm: rotationDraft }
  const selectedFileEntry = snapshot.printFiles.find((file) => file.path === selectedFile)
  const printArgs = selectedFileEntry ? { command: 'start' as const, filename: selectedFileEntry.path } : null
  const selectedMaterialTest = MATERIAL_TESTS.find((item) => item.id === materialTest)
  const shaperArgs = shaperMode === 'full' ? { command: 'shaperCalibrateFull' as const, save: false } : { command: 'shaperCalibrateLight' as const }
  const shaperResultValid = Number.isFinite(shaperTarget.freqXHz) && Number.isFinite(shaperTarget.freqYHz)
    && Boolean(shaperTarget.typeX) && Boolean(shaperTarget.typeY)
  const currentShaper = calibration?.shaper
  const shaperMatchesTarget = shaperResultValid && currentShaper !== undefined && currentShaper.typeX === shaperTarget.typeX
    && currentShaper.typeY === shaperTarget.typeY
    && currentShaper.freqXHz !== null && currentShaper.freqYHz !== null
    && Math.abs(currentShaper.freqXHz - (shaperTarget.freqXHz ?? 0)) < 0.1
    && Math.abs(currentShaper.freqYHz - (shaperTarget.freqYHz ?? 0)) < 0.1

  useEffect(() => subscribePrinterGcodeResponses((next) => {
    if (!running.current) return
    latestResponse.current = next
    if (collectingShaperRun.current !== runId.current) return
    const target = parseShaperTarget(next, latestShaperTarget.current)
    latestShaperTarget.current = target
    setShaperTarget(target)
    const waiter = shaperRecommendationWaiter.current
    if (waiter?.id === runId.current && Number.isFinite(target.freqXHz) && Number.isFinite(target.freqYHz) && target.typeX && target.typeY) {
      window.clearTimeout(waiter.timer)
      shaperRecommendationWaiter.current = null
      waiter.resolve(true)
    }
  }), [])
  useEffect(() => () => {
    ++spectrumToken.current
    collectingShaperRun.current = null
    const waiter = shaperRecommendationWaiter.current
    if (waiter) { window.clearTimeout(waiter.timer); shaperRecommendationWaiter.current = null; waiter.resolve(false) }
  }, [])
  useEffect(() => {
    activityCallback.current?.(false)
    return () => activityCallback.current?.(false)
  }, [])
  useEffect(() => { setDetailsOpen(false) }, [procedure])

  useEffect(() => {
    if (pendingSaveKind.current !== null && !ready) saveRestartSeen.current = true
  }, [ready, snapshot.updatedAt])

  useEffect(() => {
    if (materialStartedFile === null) return
    const jobPath = canonicalPrintPath(snapshot.printJob.filename)
    const activelyPrinting = snapshot.printJob.state === 'printing' || snapshot.printJob.state === 'paused'
    if (activelyPrinting && jobPath === materialStartedFile) {
      materialObservedActive.current = true
      return
    }
    if (materialObservedActive.current && jobPath === materialStartedFile
      && (snapshot.printJob.state === 'complete' || snapshot.printJob.state === 'cancelled')) {
      setMaterialFinishedState(snapshot.printJob.state)
      if (snapshot.printJob.state === 'cancelled') publishActivity(false)
    }
  }, [materialStartedFile, snapshot.printJob.filename, snapshot.printJob.state])

  useEffect(() => {
    if (stage !== 'applying' || rotationDraft === null || oldRotation === null || measurementRotation === null) return
    if (snapshot.updatedAt !== baselineRotationUpdatedAt.current && oldRotation !== measurementRotation
      && Math.abs(oldRotation - rotationDraft) < 0.001) {
      pendingApply.current = false
      operationDeadline.current = null
      setStage('applied')
    }
  }, [stage, rotationDraft, oldRotation, measurementRotation, snapshot.updatedAt])

  useEffect(() => {
    if (stage !== 'saving') return
    if (!ready) saveRestartSeen.current = true
    if (!saveRestartSeen.current || !ready || calibration?.config.savePending !== false) return
    if (pendingSaveKind.current === 'shaper' && shaperMatchesTarget) {
      pendingSaveKind.current = null
      operationDeadline.current = null
      setStage('saved')
    } else if (pendingSaveKind.current === 'extruder' && calibration?.extruder.rotationDistanceMm != null
      && rotationDraft !== null && Math.abs(calibration.extruder.rotationDistanceMm - rotationDraft) < 0.001) {
      pendingSaveKind.current = null
      operationDeadline.current = null
      setStage('saved')
    }
  }, [stage, ready, calibration?.config.savePending, calibration?.extruder.rotationDistanceMm, shaperMatchesTarget, rotationDraft, oldRotation, snapshot.updatedAt])

  useEffect(() => {
    const isPending = (pendingApply.current && (stage === 'running' || stage === 'applying'))
      || (pendingSaveKind.current !== null && (stage === 'running' || stage === 'saving'))
    if (!isPending || operationDeadline.current === null) return
    const timeout = window.setTimeout(() => {
      if (operationDeadline.current === null) return
      ++runId.current
      running.current = false
      pendingApply.current = false
      pendingSaveKind.current = null
      operationDeadline.current = null
      setOperationUncertain(true)
      setMessage('Не удалось подтвердить применение или сохранение за 90 секунд. Состояние принтера неизвестно; проверьте его и выполните аварийную остановку перед продолжением.')
      setStage('error')
    }, Math.max(0, operationDeadline.current - Date.now()))
    return () => window.clearTimeout(timeout)
  }, [stage])

  function commandReason(command: Parameters<Props['getCommandBlockReason']>[0], args?: Parameters<Props['getCommandBlockReason']>[1]) {
    return getCommandBlockReason(command, args)
  }

  function publishActivity(active: boolean) {
    if (sessionActive.current === active) return
    sessionActive.current = active
    activityCallback.current?.(active)
  }

  async function run(args: Parameters<Props['executeCommand']>[0], onComplete?: () => void | Promise<void>, requiresCalibration = true) {
    const emergency = args.command === 'emergencyStop'
    if ((running.current && !emergency) || (!emergency && (blockedBase || (requiresCalibration && !calibration) || pendingCommand !== null)) || getCommandBlockReason(args.command, args)) return
    // До отправки безопасно разрешённой команды UI удерживает сеанс даже при неопределённом RPC.
    publishActivity(true)
    if (emergency) ++runId.current
    if (emergency) {
      ++spectrumToken.current; collectingShaperRun.current = null; ownedShaperRun.current = null; setSpectrumLoading(false)
      const waiter = shaperRecommendationWaiter.current
      if (waiter) { window.clearTimeout(waiter.timer); shaperRecommendationWaiter.current = null; waiter.resolve(false) }
    }
    running.current = true
    const id = ++runId.current
    setMessage('')
    setStage('running')
    try {
      const ok = await executeCommand(args)
      if (runId.current !== id) return
      if (!ok) {
        setMessage('Команда не подтверждена. Она могла продолжиться на принтере; используйте аварийную остановку и проверьте состояние.')
        return
      }
      await onComplete?.()
      if (runId.current !== id) return
      if (emergency) { setOperationUncertain(false); publishActivity(false) }
    } catch (cause) {
      if (runId.current === id) {
        setMessage(cause instanceof Error ? `${cause.message} Команда могла продолжиться на принтере; используйте аварийную остановку и проверьте состояние.` : 'Команда завершилась с ошибкой и могла продолжиться на принтере; используйте аварийную остановку.')
      }
    } finally {
      if (runId.current === id) running.current = false
    }
  }

  async function startShaper() {
    if (preparingShaper.current || running.current || calibrationBlock || commandReason(shaperArgs.command, shaperArgs)) return
    preparingShaper.current = true
    setBaselinePreparing(true)
    const token = ++spectrumToken.current
    const mode = shaperMode
    setSpectra(emptySpectra())
    setSpectrumAxis('x')
    setSpectrumLoading(false)
    setMessage('')
    setShaperAction('calibration')
    setAdxlDiagnostic(null)
    setShaperTarget({})
    latestResponse.current = ''
    latestShaperTarget.current = {}
    let baseline: PrinterShaperResonanceReport | null = null
    let baselineError: string | null = null
    try {
      if (!fetchShaperResonances) throw new Error('Источник спектра недоступен.')
      baseline = await fetchShaperResonances(mode)
      if (baseline.mode !== mode) throw new Error('Источник вернул другой режим замера.')
    } catch (cause) { baselineError = cause instanceof Error ? cause.message : 'Не удалось прочитать исходные данные спектра.' }
    if (token !== spectrumToken.current) return
    preparingShaper.current = false
    setBaselinePreparing(false)
    const current = latestCommandState.current
    const reason = isPrintJobActive(current.snapshot.printJob) ? 'Завершите печать перед калибровкой.'
      : !READY(current.snapshot) ? 'Нужно подключение к готовому принтеру.'
        : current.pendingCommand !== null ? 'Дождитесь завершения другой команды.'
          : !current.snapshot.calibration ? 'Данные калибровки недоступны.' : current.getCommandBlockReason(shaperArgs.command, shaperArgs)
    if (reason) { setMessage(reason); return }
    const id = runId.current + 1
    ownedShaperRun.current = id
    collectingShaperRun.current = id
    await run(shaperArgs, async () => {
      const beforeWait = latestShaperTarget.current
      if (!(Number.isFinite(beforeWait.freqXHz) && Number.isFinite(beforeWait.freqYHz) && beforeWait.typeX && beforeWait.typeY)) {
        const received = await new Promise<boolean>((resolve) => {
          const timer = window.setTimeout(() => {
            if (shaperRecommendationWaiter.current?.id !== id) return
            shaperRecommendationWaiter.current = null
            collectingShaperRun.current = null
            resolve(false)
          }, OPERATION_TIMEOUT_MS)
          shaperRecommendationWaiter.current = { id, timer, resolve }
        })
        if (token !== spectrumToken.current || runId.current !== id || ownedShaperRun.current !== id) return
        if (!received) {
          setMessage('Klipper не вернул рекомендации для обеих осей за 90 секунд. Результат не подтверждён.')
          setStage('error')
          return
        }
      }
      if (token !== spectrumToken.current || runId.current !== id || ownedShaperRun.current !== id) return
      collectingShaperRun.current = null
      const result = latestShaperTarget.current
      if (Number.isFinite(result.freqXHz) && Number.isFinite(result.freqYHz) && result.typeX && result.typeY) {
        setShaperTarget(result)
        setStage('result')
        if (baselineError || !baseline || !fetchShaperResonances) {
          const error = `Ошибка получения спектра: ${baselineError ?? 'Исходные данные недоступны.'}`
          setSpectra({ x: { points: [], error }, y: { points: [], error } })
        } else {
          setSpectrumLoading(true)
          void fetchShaperResonances(mode).then((report) => {
            if (token !== spectrumToken.current || ownedShaperRun.current !== id) return
            if (report.mode !== mode) throw new Error('Источник вернул другой режим замера.')
            const next = emptySpectra()
            for (const axis of ['x', 'y'] as const) {
              const file = report.axes[axis]
              if (!file || !file.revision || file.revision === baseline.axes[axis]?.revision) continue
              try { next[axis].points = parseShaperSpectrumCsv(file.csv) }
              catch (cause) { next[axis].error = `Ошибка данных спектра ${axis.toUpperCase()}: ${cause instanceof Error ? cause.message : 'Некорректный CSV.'}` }
            }
            setSpectra(next)
          }).catch((cause: unknown) => {
            if (token !== spectrumToken.current || ownedShaperRun.current !== id) return
            const error = `Ошибка получения спектра: ${cause instanceof Error ? cause.message : 'Источник недоступен.'}`
            setSpectra({ x: { points: [], error }, y: { points: [], error } })
          }).finally(() => { if (token === spectrumToken.current && ownedShaperRun.current === id) setSpectrumLoading(false) })
        }
      } else {
        setMessage('Klipper не вернул рекомендации для обеих осей. Результат не подтверждён.')
        setStage('error')
      }
    })
    if (collectingShaperRun.current === id) collectingShaperRun.current = null
  }

  async function runAdxlDiagnostic(kind: AdxlDiagnostic['kind']) {
    const args = kind === 'query' ? { command: 'accelerometerQuery' as const } : { command: 'accelerometerMeasureNoise' as const }
    if (preparingShaper.current || running.current || blockedCommand(args)) return
    ++spectrumToken.current
    ownedShaperRun.current = null
    collectingShaperRun.current = null
    setSpectrumLoading(false)
    setShaperAction(kind === 'query' ? 'adxlQuery' : 'adxlNoise')
    setAdxlDiagnostic(null)
    latestResponse.current = ''
    await run(args, () => {
      const diagnostic = parseAdxlDiagnostic(latestResponse.current, kind)
      setAdxlDiagnostic(diagnostic)
      setMessage(diagnostic ? '' : 'Ответ датчика не распознан. Проверьте его состояние перед повтором.')
      setStage(diagnostic ? 'result' : 'error')
    })
  }

  function startExtruderFeed() {
    if (!extruderInputValid || oldRotation === null || blockedCommand(extruderArgs)) return
    setMeasuredLength('')
    setRotationDraft(null)
    setMeasurementRotation(oldRotation)
    setMeasurementRequestedLength(targetExtrudeLength)
    baselineRotationUpdatedAt.current = null
    void run(extruderArgs, () => setStage('result'))
  }

  function saveShaper() {
    if (stage !== 'result' || !shaperResultValid || calibrationBlock || calibration?.config.savePending !== true) return
    const saveArgs = { command: 'consoleGcode' as const, script: 'TREED_SAVE_CONFIG' }
    if (getCommandBlockReason(saveArgs.command, saveArgs)) return
    if (!calibration?.config.pendingSections.includes('input_shaper')) return
    if (calibration.shaper.typeX == null || calibration.shaper.typeY == null || calibration.shaper.freqXHz == null || calibration.shaper.freqYHz == null) return
    saveRestartSeen.current = false
    pendingSaveKind.current = 'shaper'
    operationDeadline.current = Date.now() + OPERATION_TIMEOUT_MS
    void run(saveArgs, () => setStage('saving'))
  }

  function applyExtruderRotation() {
    if (stage !== 'result' || calculatedRotation === null || oldRotation === null || extruderApplyBlock !== null) return
    setRotationDraft(calculatedRotation)
    baselineRotationUpdatedAt.current = snapshot.updatedAt
    pendingApply.current = true
    operationDeadline.current = Date.now() + OPERATION_TIMEOUT_MS
    void run({ command: 'extruderRotationDistanceApply', distanceMm: calculatedRotation }, () => setStage('applying'))
  }

  function saveExtruderRotation() {
    if (stage !== 'applied' || !extruderSaveArgs || blockedCommand(extruderSaveArgs) !== null) return
    saveRestartSeen.current = false
    pendingSaveKind.current = 'extruder'
    operationDeadline.current = Date.now() + OPERATION_TIMEOUT_MS
    void run(extruderSaveArgs, () => setStage('saving'))
  }

  function backToCatalog() {
    if (stage === 'running' || stage === 'applying' || stage === 'saving' || operationUncertain || activePrint) return
    setProcedure('catalog')
    setStage('idle')
    setMessage('')
    ++spectrumToken.current
    preparingShaper.current = false
    setBaselinePreparing(false)
    ownedShaperRun.current = null
    publishActivity(false)
  }

  const fieldValues: Record<ExtruderField, string> = { length: extrudeLength, speed: extrudeSpeed, temperature: extrudeTemperature, actual: measuredLength }
  const fieldLabels: Record<ExtruderField, string> = { length: 'Запрошенная длина', speed: 'Скорость подачи', temperature: 'Температура сопла', actual: 'Фактическая длина' }
  const fieldUnits: Record<ExtruderField, string> = { length: 'мм', speed: 'мм/с', temperature: '°C', actual: 'мм' }
  const fieldLimits: Record<ExtruderField, string> = {
    length: 'Целое число от 1 до 120 мм.', speed: 'Число от 0,1 до 5 мм/с.',
    temperature: `Целое число от 170 до ${Math.ceil(snapshot.limits.nozzleMaxC) - 1} °C.`, actual: 'Число от 1 до 120 мм.',
  }
  const fieldIcon = editingField === 'temperature' ? 'metricNozzle' as const : 'metricSpeed' as const
  const fieldDraftNumber = Number(fieldDraft)
  const fieldDraftValid = editingField !== null && Number.isFinite(fieldDraftNumber) && (editingField === 'length' ? Number.isInteger(fieldDraftNumber) && fieldDraftNumber >= 1 && fieldDraftNumber <= 120
    : editingField === 'speed' ? fieldDraftNumber >= 0.1 && fieldDraftNumber <= 5
      : editingField === 'temperature' ? Number.isInteger(fieldDraftNumber) && fieldDraftNumber >= 170 && fieldDraftNumber < Math.ceil(snapshot.limits.nozzleMaxC)
        : fieldDraftNumber >= 1 && fieldDraftNumber <= 120)

  function openField(field: ExtruderField) {
    setEditingField(field)
    setFieldDraft(fieldValues[field])
    replaceFieldDraft.current = true
  }

  function editFieldDigit(digit: string) {
    const replace = replaceFieldDraft.current
    replaceFieldDraft.current = false
    setFieldDraft((value) => `${replace ? '' : value}${digit}`.slice(0, 7))
  }

  function editFieldDecimal() {
    replaceFieldDraft.current = false
    setFieldDraft((value) => value.includes('.') ? value : `${value || '0'}.`)
  }

  function submitField() {
    if (!editingField) return
    if (!fieldDraftValid) return
    if (editingField === 'length') setExtrudeLength(fieldDraft)
    else if (editingField === 'speed') setExtrudeSpeed(fieldDraft)
    else if (editingField === 'temperature') setExtrudeTemperature(fieldDraft)
    else setMeasuredLength(fieldDraft)
    setEditingField(null)
  }

  const blockedCommand = (args: Parameters<Props['executeCommand']>[0] | null, requiresCalibration = true): string | null => args === null
    ? 'Команда недоступна в текущем состоянии.'
    : blockedBase ?? (requiresCalibration && !calibration ? 'Данные калибровки недоступны в снимке принтера.' : null) ?? getCommandBlockReason(args.command, args)
  const extruderApplyBlock = calculatedRotation === null ? 'Введите фактическую длину не меньше 1 мм.'
    : measurementRotation === null || measurementRequestedLength === null || !Number.isFinite(calculatedRotation) || calculatedRotation <= 0
      ? 'Исходные данные замера недоступны.'
      : Math.abs(calculatedRotation - measurementRotation) < 0.001 ? 'Расчёт не отличается от значения до замера.'
        : blockedCommand({ command: 'extruderRotationDistanceApply', distanceMm: calculatedRotation })

  if (procedure === 'catalog') return (
    <div className={`macros-manager-list calibration-catalog${catalogFolder === 'eddy' ? ' is-eddy-folder' : ''}`} data-testid="calibration-catalog">
      <header className="macros-manager-list-head calibration-catalog-header">
        {catalogFolder === 'eddy' && <button type="button" className="calibration-catalog-back" onClick={() => onCatalogFolderChange('root')}>Назад</button>}
        <div className="macros-manager-title"><p>{catalogFolder === 'eddy' ? 'Калибровки / Eddy' : 'Калибровки'}{snapshot.source === 'mock' ? ' / Симуляция' : ''}</p><h1>{catalogFolder === 'eddy' ? 'Eddy' : 'Выберите процедуру'}</h1></div>
      </header>
      <div className="calibration-catalog-cards">
        {catalogFolder === 'eddy' ? <>
          <button type="button" className="macros-manager-workflow" onClick={() => onOpenEddy('overview')}><CalibrationPreview kind="eddy" /><span>Калибровка Eddy</span><em>Датчик и смещения</em><strong>Обязательные этапы · {completedRequiredCount}/5</strong></button>
          <button type="button" className="macros-manager-workflow" onClick={() => onOpenEddy('screws')}><CalibrationPreview kind="screws" /><span>Винты стола</span><em>Выравнивание стола</em><strong>Измерение отклонений</strong></button>
          <button type="button" className="macros-manager-workflow" onClick={() => onOpenEddy('mesh')}><CalibrationPreview kind="mesh" /><span>Карта стола</span><em>Поверхность стола</em><strong>Измерение сетки</strong></button>
          <button type="button" className="macros-manager-workflow" onClick={() => onOpenEddy('firstLayer')}><CalibrationPreview kind="firstLayer" /><span>Первый слой</span><em>Проверка печати</em><strong>Подготовленный G-code</strong></button>
        </> : <>
          <button type="button" className="macros-manager-workflow" onClick={onOpenPid}><CalibrationPreview kind="pid" /><span>PID-калибровка</span><em>Сопло и стол</em><strong>Нагреватели</strong></button>
          <button type="button" className="macros-manager-workflow" aria-label="Датчик Eddy" onClick={() => onCatalogFolderChange('eddy')}><CalibrationPreview kind="eddyFolder" /><span>Eddy</span><em>Датчик и стол</em><strong>4 раздела →</strong></button>
          <button type="button" className="macros-manager-workflow" onClick={() => { setProcedure('shaper'); setStage('idle'); setShaperAction(null); setAdxlDiagnostic(null); setMessage('') }}><CalibrationPreview kind="shaper" /><span>Шейпер и ADXL</span><em>Резонансы и датчик</em><strong>ADXL345</strong></button>
          <button type="button" className="macros-manager-workflow" onClick={() => { setProcedure('extruder'); setStage('idle'); setMeasuredLength(''); setRotationDraft(null) }}><CalibrationPreview kind="extruder" /><span>Подача экструдера</span><em>Длина подачи</em><strong>Замер и расчёт</strong></button>
          <button type="button" className="macros-manager-workflow" onClick={() => { setProcedure('material'); setStage('idle'); setMaterialStartedFile(null); setMaterialFinishedState(null); materialObservedActive.current = false; setMaterialTest(null); setMaterialStep('test'); setSelectedFile(''); setFilamentChecked(false); setTestChecked(false) }}><CalibrationPreview kind="material" /><span>Профиль материала</span><em>Тесты печати</em><strong>Профиль слайсера</strong></button>
          <button type="button" className="macros-manager-workflow" onClick={() => { setProcedure('service'); setStage('idle') }}><CalibrationPreview kind="service" /><span>Сервисная телеметрия</span><em>Данные принтера</em><strong>Только показания</strong></button>
        </>}
      </div>
    </div>
  )

  const title = procedure === 'shaper' ? 'Шейпер и ADXL' : procedure === 'extruder' ? 'Подача экструдера' : procedure === 'material' ? 'Профиль материала' : 'Сервисная телеметрия'
  const isBlocking = stage === 'running' || stage === 'applying' || stage === 'saving' || operationUncertain
  const showStudy = stage !== 'error' && !operationUncertain && !(stage === 'running' && message)
  const shaperRecommendation = procedure === 'shaper' && shaperAction === 'calibration' && shaperResultValid && ['result', 'saving', 'saved'].includes(stage)
  const activeMaterialPrint = materialStartedFile !== null && canonicalPrintPath(snapshot.printJob.filename) === materialStartedFile && activePrint
  const workflowSteps = procedure === 'shaper' ? ['Подготовка', 'Измерение', 'Результат', 'Сохранение']
    : procedure === 'extruder' ? ['Параметры', 'Замер', 'Расчёт', 'Сохранение']
      : procedure === 'material' ? ['Тест', 'Файл', 'Подготовка', 'Печать', 'Оценка'] : []
  const activeWorkflowStep = procedure === 'shaper'
    ? stage === 'running' ? 1 : stage === 'result' ? 2 : stage === 'saving' || stage === 'saved' ? 3 : 0
    : procedure === 'extruder'
      ? stage === 'running' || stage === 'result' ? 1 : stage === 'applying' ? 2 : stage === 'applied' || stage === 'saving' || stage === 'saved' ? 3 : 0
      : procedure === 'material'
        ? stage === 'running' ? 3 : stage === 'result' ? materialFinishedState ? 4 : 3 : materialStep === 'test' ? 0 : materialStep === 'file' ? 1 : 2
        : -1
  return (
    <article className="calibration-procedure">
      <header className="calibration-procedure-header"><button type="button" disabled={isBlocking || activePrint} onClick={backToCatalog}>{sessionActive.current ? 'Завершить' : 'К списку'}</button><div><p>Калибровки{snapshot.source === 'mock' ? ' / Симуляция' : ''}</p><h2>{title}</h2></div><span>{procedure === 'service' ? calibration?.eddy.available === undefined ? 'Нет данных' : calibration.eddy.available ? 'Датчик доступен' : 'Датчик недоступен' : operationUncertain ? 'Нужна проверка принтера' : baselinePreparing ? 'Читаем данные' : stage === 'saving' ? 'Сохраняем · перезапуск' : isBlocking ? 'Команда выполняется' : stage === 'error' ? 'Нет подтверждения' : stage === 'stopped' ? 'Остановлено' : stage === 'saved' ? 'Сохранено' : stage === 'applied' ? 'Применено · не сохранено' : stage === 'result' ? 'Результат' : 'Подготовка'}</span><button type="button" aria-expanded={detailsOpen} aria-controls="calibration-technical-details" onClick={() => setDetailsOpen((value) => !value)}>{detailsOpen ? 'Закрыть' : 'Подробнее'}</button></header>
      {workflowSteps.length > 0 && <ol className="calibration-workflow-steps" aria-label="Этапы процедуры">{workflowSteps.map((label, index) => <li key={label} aria-current={activeWorkflowStep === index ? 'step' : undefined}>{String(index + 1).padStart(2, '0')} {label}</li>)}</ol>}
      <main className={`calibration-procedure-body${showStudy && (detailsOpen || procedure === 'shaper' || procedure === 'extruder' || (procedure === 'material' && selectedMaterialTest && (stage !== 'idle' || materialStep !== 'test'))) ? ' has-study' : ''}${shaperRecommendation ? ' has-spectrum' : ''}${procedure === 'material' && materialStep === 'prepare' ? ' is-material-prepare' : ''}`}>
        {detailsOpen && showStudy ? <section id="calibration-technical-details" className="calibration-technical-details" aria-label="Подробности процедуры">
          {procedure === 'shaper' && <>
            <p>Спектр показывает измеренный PSD_xyz из CSV текущего запуска. Частота — в Гц; физическая единица PSD источником не задана.</p>
            <div className="calibration-shaper-comparison" aria-label="Сейчас и рекомендовано"><div className="calibration-comparison-head"><span>Ось</span><span>Сейчас</span><span>Рекомендовано</span></div>{(['x', 'y'] as const).map((axis) => <div key={axis}><strong>{axis.toUpperCase()}</strong><span>{axis === 'x' ? currentShaper?.typeX ?? '—' : currentShaper?.typeY ?? '—'} · {(axis === 'x' ? currentShaper?.freqXHz : currentShaper?.freqYHz)?.toFixed(1) ?? '—'} Гц</span><span>{axis === 'x' ? shaperTarget.typeX ?? '—' : shaperTarget.typeY ?? '—'} · {(axis === 'x' ? shaperTarget.freqXHz : shaperTarget.freqYHz)?.toFixed(1) ?? '—'} Гц</span></div>)}</div>
            {adxlDiagnostic && <p>{adxlDiagnostic.kind === 'noise' ? `Оси датчика: ${adxlDiagnostic.chipAxes}. Порог нормы не задан.` : 'Показания из ответа датчика; это не временной график.'}</p>}
          </>}
          {procedure === 'extruder' && <><dl className="calibration-rotation-comparison" aria-label="Расчёт rotation distance"><div><dt>{measurementRotation === null ? 'Текущий rotation distance' : 'До замера'}</dt><dd>{(measurementRotation ?? oldRotation)?.toFixed(4) ?? '—'} мм</dd></div><span aria-hidden="true">→</span><div><dt>Расчётный результат</dt><dd>{calculatedRotation?.toFixed(4) ?? '—'} мм</dd></div></dl>{measurementRotation !== null && calculatedRotation !== null && <p>{measurementRotation.toFixed(4)} × {actualExtruded.toFixed(1)} / {measurementRequestedLength} = {calculatedRotation.toFixed(4)} мм</p>}<p>Длина измеряется вручную. Применение действует в текущем сеансе; запись в конфигурацию выполняется отдельно.</p></>}
          {procedure === 'material' && <><p>{selectedMaterialTest?.guidance ?? 'Выберите подготовленный тест материала.'}</p><p>Учебная схема, не результат печати и не геометрия G-code. Температуры и коэффициенты определяются подготовленным тестом.</p></>}
          {procedure === 'service' && <><p>Показания датчика и состояние сохранения.</p><p>TAP, SGT и Z-калибровка: нет данных.</p><p>Код тока — значение настройки катушки, без физической единицы.</p></>}
        </section> : showStudy && <>
          {procedure === 'shaper' && (shaperRecommendation ? <ShaperSpectrum axes={spectra} axis={spectrumAxis} onAxisChange={setSpectrumAxis} loading={spectrumLoading} /> : <MotionStudy diagnostic={shaperAction === 'adxlQuery' ? 'query' : shaperAction === 'adxlNoise' ? 'noise' : null} />)}
          {procedure === 'extruder' && <ExtruderStudy requestedMm={measurementRequestedLength ?? (extruderInputValid ? targetExtrudeLength : null)} measuredMm={measuredLength === '' || measurementRequestedLength === null ? null : actualExtruded} />}
          {procedure === 'material' && selectedMaterialTest && (stage !== 'idle' || materialStep !== 'test') && <MaterialStudy kind={selectedMaterialTest.id} title={selectedMaterialTest.title} compact={materialStep === 'prepare'} />}
        </>}
        <div className="calibration-procedure-details">
        {snapshot.transport.state !== 'online' && procedure !== 'service' && <p role="status">Последние данные; связи нет.</p>}
        {procedure === 'shaper' && <>
          {stage === 'idle' && <section className="calibration-procedure-stage">
            <p>Освободите зону движения. Измеряем резонансы X/Y.</p>
            <div className="calibration-choice-row"><button type="button" aria-pressed={shaperMode === 'full'} disabled={isBlocking || baselinePreparing} onClick={() => setShaperMode('full')}>Полный тест</button><button type="button" aria-pressed={shaperMode === 'light'} disabled={isBlocking || baselinePreparing} onClick={() => setShaperMode('light')}>Лёгкий прогон</button></div>
            {!calibration?.shaper && <p role="status">Нет данных шейпера; сохранение нельзя подтвердить.</p>}
            <div className="calibration-action-row">
              <button type="button" disabled={blockedCommand({ command: 'accelerometerQuery' }) !== null || isBlocking || baselinePreparing} title={blockedCommand({ command: 'accelerometerQuery' }) ?? undefined} onClick={() => void runAdxlDiagnostic('query')}>Считать ADXL</button>
              <button type="button" disabled={blockedCommand({ command: 'accelerometerMeasureNoise' }) !== null || isBlocking || baselinePreparing} title={blockedCommand({ command: 'accelerometerMeasureNoise' }) ?? undefined} onClick={() => void runAdxlDiagnostic('noise')}>Измерить шум</button>
            </div>
            {(blockedCommand({ command: 'accelerometerQuery' }) || blockedCommand({ command: 'accelerometerMeasureNoise' })) && <p className="calibration-blocked-diagnostics" role="status">{blockedCommand({ command: 'accelerometerQuery' }) && <>ADXL: {blockedCommand({ command: 'accelerometerQuery' })}</>}{blockedCommand({ command: 'accelerometerMeasureNoise' }) && blockedCommand({ command: 'accelerometerMeasureNoise' }) !== blockedCommand({ command: 'accelerometerQuery' }) && <> Шум: {blockedCommand({ command: 'accelerometerMeasureNoise' })}</>}</p>}
          </section>}
          {stage === 'running' && <section className="calibration-procedure-stage"><h3>Измеряем…</h3></section>}
          {(stage === 'result' || (shaperAction === 'calibration' && (stage === 'saving' || stage === 'saved'))) && <section className="calibration-procedure-stage"><h3>{shaperAction === 'calibration' ? stage === 'saved' ? 'Калибровка сохранена' : stage === 'saving' ? 'Сохранение калибровки' : 'Результат калибровки' : 'Диагностика ADXL'}</h3>
            {shaperAction === 'calibration' && shaperResultValid && <div className="calibration-primary-readout" role="status" aria-label="Рекомендация по шейперу"><span>Рекомендовано · {spectrumAxis.toUpperCase()}</span><strong>{(spectrumAxis === 'x' ? shaperTarget.typeX : shaperTarget.typeY)?.toUpperCase()}</strong><strong>{(spectrumAxis === 'x' ? shaperTarget.freqXHz : shaperTarget.freqYHz)?.toFixed(1)} <small>Гц</small></strong><p>{spectrumAxis === 'x' ? 'Y' : 'X'} · {(spectrumAxis === 'x' ? shaperTarget.typeY : shaperTarget.typeX)?.toUpperCase()} · {(spectrumAxis === 'x' ? shaperTarget.freqYHz : shaperTarget.freqXHz)?.toFixed(1)} Гц</p></div>}
            {shaperAction !== 'calibration' && adxlDiagnostic && <><p>{adxlDiagnostic.kind === 'query' ? 'Показания датчика' : 'Шум датчика'}</p><dl className="calibration-adxl-values" role="status" aria-label={adxlDiagnostic.kind === 'query' ? 'Показания акселерометра' : 'Шум акселерометра'}><div><dt>X</dt><dd>{adxlDiagnostic.x.toFixed(3)}</dd></div><div><dt>Y</dt><dd>{adxlDiagnostic.y.toFixed(3)}</dd></div><div><dt>Z</dt><dd>{adxlDiagnostic.z.toFixed(3)}</dd></div></dl><div className="calibration-action-row"><button type="button" disabled={blockedCommand({ command: 'accelerometerQuery' }) !== null || isBlocking} title={blockedCommand({ command: 'accelerometerQuery' }) ?? undefined} onClick={() => void runAdxlDiagnostic('query')}>Считать ADXL</button><button type="button" disabled={blockedCommand({ command: 'accelerometerMeasureNoise' }) !== null || isBlocking} title={blockedCommand({ command: 'accelerometerMeasureNoise' }) ?? undefined} onClick={() => void runAdxlDiagnostic('noise')}>Измерить шум</button></div></>}
            {shaperAction === 'calibration' && stage === 'result' && !calibration?.config.pendingSections.includes('input_shaper') && <p role="status">Принтер не подтвердил готовность настроек к сохранению.</p>}
            {shaperAction === 'calibration' && stage === 'result' && calibration?.config.savePending !== true && <p role="status">Настройки ещё не готовы к сохранению.</p>}
            {shaperAction === 'calibration' && stage === 'result' && blockedCommand({ command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' }) && <p role="status">Запись заблокирована: {blockedCommand({ command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' })}</p>}
            {stage === 'saving' && <p role="status">Настройки сохраняются. Ожидаем готовность принтера.</p>}
            {detailsOpen && (spectra.x.error || spectra.y.error) && <p role="alert">{spectra.x.error ?? spectra.y.error}</p>}
          </section>}
        </>}
        {procedure === 'extruder' && <>
          <section className="calibration-procedure-stage">
          {stage === 'idle' && <p>Проверьте свободную подачу. Подготовьте линейку.</p>}
          {stage === 'result' && <p>Измерено вручную, мм · запрошено {measurementRequestedLength} мм</p>}
          <div className="calibration-fields">
            {([['length', 'Запрошенная длина, мм', extrudeLength, stage === 'idle'], ['speed', 'Скорость, мм/с', extrudeSpeed, stage === 'idle'], ['temperature', 'Температура сопла, °C', extrudeTemperature, stage === 'idle'], ['actual', 'Фактическая длина, мм', measuredLength || 'Не введена', stage === 'result']] as const).filter(([field]) => field === 'actual' ? stage === 'result' : stage === 'idle').map(([field, label, value, enabled]) => <label key={field}>{label}<button type="button" className="calibration-field-value" aria-label={label} disabled={!enabled} onClick={() => openField(field)}>{value}</button></label>)}
          </div>
          {calculatedRotation !== null && <div className="calibration-primary-readout" aria-label="Расчётный rotation distance"><span>Расчётный rotation distance</span><strong>{calculatedRotation.toFixed(4)} <small>мм</small></strong></div>}
          {stage === 'running' && <p role="status">Подача выполняется. Дождитесь завершения этапа.</p>}
          {stage === 'applying' && <p role="status">Применяем рассчитанное значение.</p>}
          {stage === 'applied' && blockedCommand(extruderSaveArgs) && <p role="status">Запись заблокирована: {blockedCommand(extruderSaveArgs)}</p>}
          </section>
        </>}
        {procedure === 'material' && <>
          <section className="calibration-procedure-stage">
            {!showStudy && selectedMaterialTest && <p>{selectedMaterialTest.title}</p>}
            {stage === 'idle' && materialStep === 'test' && <><h3>1 · Выберите проверку</h3><div className="calibration-test-options" role="group" aria-label="Профильная проверка материала">{MATERIAL_TESTS.map((item) => <button className="calibration-test-option" key={item.id} type="button" aria-pressed={materialTest === item.id} disabled={activePrint || isBlocking} onClick={() => { setMaterialTest(item.id); setSelectedFile(''); setFilamentChecked(false); setTestChecked(false); setMaterialStep('file'); setMaterialStartedFile(null); setMaterialFinishedState(null); materialObservedActive.current = false }}><CalibrationPreview kind={item.id === 'temperature' ? 'materialTemperature' : item.id} compact /><span>{item.title}</span></button>)}</div></>}
            {stage === 'idle' && materialStep === 'file' && <><h3>Выберите G-code</h3>{snapshot.printFiles.length > 0 ? <div className="calibration-file-list" role="group" aria-label="Загруженные тестовые файлы">{snapshot.printFiles.map((file) => <button className="calibration-file-option" key={file.id} type="button" aria-pressed={selectedFile === file.path} disabled={activePrint || isBlocking} onClick={() => { setSelectedFile(file.path); setTestChecked(false); setMaterialStep('prepare'); setMaterialStartedFile(null); setMaterialFinishedState(null); materialObservedActive.current = false }}><span>{file.name}</span><small>{file.path}</small></button>)}</div> : <p role="status">Список загруженных G-code недоступен. Загрузите тест через раздел файлов.</p>}</>}
            {stage === 'idle' && materialStep === 'prepare' && <><h3>Проверьте запуск</h3><p className="calibration-selected-file">{selectedFileEntry?.path}</p><label className="calibration-check"><input type="checkbox" checked={filamentChecked} disabled={!selectedFileEntry || activePrint || isBlocking} onChange={(event) => setFilamentChecked(event.target.checked)} />Филамент и температура соответствуют тесту.</label><label className="calibration-check"><input type="checkbox" checked={testChecked} disabled={!selectedFileEntry || activePrint || isBlocking} onChange={(event) => setTestChecked(event.target.checked)} />Я проверил G-code и буду наблюдать за печатью.</label></>}
            {stage === 'running' && <><h3>Запуск печати</h3><p role="status">Ожидаем начало выбранной печати.</p></>}
            {stage === 'result' && <><h3>{activeMaterialPrint ? 'Тест печатается' : materialFinishedState === 'complete' ? 'Тест завершён' : materialFinishedState === 'cancelled' ? 'Тест отменён' : 'Ожидаем начало печати'}</h3>{activeMaterialPrint && <div className="calibration-primary-readout" role="status"><strong>{snapshot.printJob.progressPercent} <small>%</small></strong><span className="calibration-selected-file">{materialStartedFile}</span></div>}{materialFinishedState === 'complete' && selectedMaterialTest && <><p className="calibration-evaluation-task">{MATERIAL_TASKS[selectedMaterialTest.id]}</p><p>Результат внесите в слайсер</p></>}{materialFinishedState === 'cancelled' && <p role="status">Результат теста не получен.</p>}{materialStartedFile && !activeMaterialPrint && !materialFinishedState && <p role="status">{activePrint ? 'Печатается другой файл; выбранный тест не наблюдается.' : 'Запуск принят, начало не наблюдалось.'}</p>}</>}
          </section>
          {stage === 'idle' && materialStep === 'prepare' && printArgs && blockedCommand(printArgs, false) && <p role="status">Запуск заблокирован: {blockedCommand(printArgs, false)}</p>}
        </>}
        {procedure === 'service' && <>
          {!ready && <p role="status">Последние данные; связи с готовым принтером нет.</p>}
          <section className="calibration-data-groups"><div className="calibration-data-group"><div className="calibration-primary-readout"><span>Температура Eddy</span><strong>{calibration?.eddy.temperatureC == null ? '—' : calibration.eddy.temperatureC.toFixed(1)} <small>°C</small></strong>{calibration?.eddy.temperatureC == null && <p>Нет данных</p>}</div><dl className="calibration-service-grid"><div><dt>Код тока</dt><dd>{calibration?.eddy.driveCurrent == null ? <><span>—</span><small>Нет данных</small></> : calibration.eddy.driveCurrent.toFixed(0)}</dd></div><div><dt>Компенсация</dt><dd>{calibration?.eddy.compensationEnabled == null ? 'Нет данных' : calibration.eddy.compensationEnabled ? 'Включена' : 'Выключена'}</dd></div><div><dt>Высота</dt><dd>{calibration?.eddy.heightCalibrated == null ? 'Нет данных' : calibration.eddy.heightCalibrated ? 'Подтверждена' : 'Не настроена'}</dd></div></dl></div><div className="calibration-data-group"><h3>Конфигурация</h3><dl className="calibration-service-grid"><div><dt>Ожидает сохранения</dt><dd>{calibration?.config.savePending == null ? 'Нет данных' : calibration.config.savePending ? 'Есть изменения' : 'Нет'}</dd></div></dl>{calibration?.config.pendingSections.length ? <p className="calibration-selected-file">{calibration.config.pendingSections.join(', ')}</p> : null}</div></section>
        </>}
        {message && <p role="alert">{message}</p>}
        {stage === 'stopped' && <p role="status">Аварийная остановка принята. Проверьте принтер до новой калибровки.</p>}
        {procedure === 'shaper' && stage === 'idle' && blockedCommand(shaperArgs) && <p role="status">{blockedCommand(shaperArgs)}</p>}
        {procedure === 'extruder' && stage === 'idle' && blockedCommand(extruderArgs) && <p role="status">{blockedCommand(extruderArgs)}</p>}
        {procedure === 'extruder' && stage === 'result' && extruderApplyBlock && <p role="status">Применение заблокировано: {extruderApplyBlock}</p>}
        </div>
      </main>
      <footer className="calibration-procedure-footer">
        {isBlocking ? <><span role="status">{operationUncertain ? message : message || 'Ожидаем завершения операции'}</span><button type="button" className="is-danger" disabled={commandReason('emergencyStop') !== null} onClick={() => void run({ command: 'emergencyStop' }, () => { pendingSaveKind.current = null; pendingApply.current = false; operationDeadline.current = null; setStage('stopped') }, false)}>Аварийная остановка</button></> : <>
          {sessionActive.current && <button type="button" className="is-danger" disabled={commandReason('emergencyStop') !== null} onClick={() => void run({ command: 'emergencyStop' }, () => { pendingSaveKind.current = null; pendingApply.current = false; operationDeadline.current = null; setStage('stopped') }, false)}>Аварийная остановка</button>}
          {procedure === 'shaper' && <>{stage === 'result' && shaperAction !== 'calibration' ? <button type="button" onClick={() => { setStage('idle'); setShaperAction(null); setAdxlDiagnostic(null); setDetailsOpen(false) }}>К тесту резонансов</button> : stage === 'saved' ? <button type="button" onClick={backToCatalog}>Готово</button> : <><button type="button" disabled={blockedCommand(shaperArgs) !== null || baselinePreparing} title={blockedCommand(shaperArgs) ?? undefined} onClick={() => void startShaper()}>{stage === 'result' ? 'Повторить замер' : stage === 'error' ? 'Повторить прогон' : 'Измерить резонансы'}</button>{stage === 'result' && shaperAction === 'calibration' && <button type="button" disabled={calibration?.config.savePending !== true || !calibration.config.pendingSections.includes('input_shaper') || commandReason('consoleGcode', { command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' }) !== null} title={calibration?.config.savePending !== true ? 'Настройки ещё не готовы к сохранению.' : undefined} onClick={saveShaper}>Сохранить и перезапустить</button>}</>}</>}
          {procedure === 'extruder' && <>{stage === 'idle' && <button type="button" disabled={!extruderInputValid || blockedCommand(extruderArgs) !== null || oldRotation === null} title={!extruderInputValid ? 'Проверьте пределы длины, скорости и температуры.' : oldRotation === null ? 'Текущий rotation distance неизвестен.' : blockedCommand(extruderArgs) ?? undefined} onClick={startExtruderFeed}>Выполнить подачу</button>}{stage === 'result' && <button type="button" disabled={!Number.isFinite(actualExtruded) || actualExtruded < 1 || extruderApplyBlock !== null} title={extruderApplyBlock ?? undefined} onClick={applyExtruderRotation}>Рассчитать и применить</button>}{stage === 'applied' && <button type="button" disabled={!extruderSaveArgs || blockedCommand(extruderSaveArgs) !== null} title={blockedCommand(extruderSaveArgs) ?? undefined} onClick={saveExtruderRotation}>Записать и перезапустить</button>}</>}
          {procedure === 'material' && stage === 'idle' && materialStep !== 'test' && <button type="button" onClick={() => setMaterialStep(materialStep === 'prepare' ? 'file' : 'test')}>{materialStep === 'prepare' ? 'Назад к файлу' : 'Назад к тесту'}</button>}
          {procedure === 'extruder' && stage === 'saved' && <button type="button" onClick={backToCatalog}>Готово</button>}
          {procedure === 'material' && stage === 'result' && materialFinishedState && <button type="button" disabled={activePrint} onClick={backToCatalog}>Готово</button>}
          {procedure === 'service' && <button type="button" disabled={activePrint} onClick={backToCatalog}>Вернуться к списку</button>}
          {procedure === 'material' && stage === 'result' && !materialFinishedState && <span role="status">{activeMaterialPrint ? 'Печать выбранного теста' : 'Ожидаем выбранный файл'}</span>}
          {procedure === 'material' && stage === 'idle' && materialStep === 'prepare' && selectedFileEntry && (!filamentChecked || !testChecked) && <span role="status">Подтвердите обе проверки перед запуском.</span>}
          {procedure === 'material' && stage === 'idle' && materialStep === 'prepare' && printArgs && <button type="button" disabled={!filamentChecked || !testChecked || !selectedMaterialTest || blockedCommand(printArgs, false) !== null || activePrint} title={!filamentChecked || !testChecked || !selectedMaterialTest ? 'Подтвердите подготовку филамента и G-code.' : blockedCommand(printArgs, false) ?? undefined} onClick={() => void run(printArgs, () => { materialObservedActive.current = false; setMaterialFinishedState(null); setMaterialStartedFile(canonicalPrintPath(printArgs.filename)); setStage('result') }, false)}>Запустить тестовую печать</button>}
        </>}
      </footer>
      {editingField && createPortal(<div className="calibration-number-dialog tune-value-workspace is-keyboard-open" role="dialog" aria-modal="true" aria-label={`Изменить: ${fieldLabels[editingField]}`} ref={fieldDialog}>
        <div className="calibration-number-editor">
          <TuneValueEditor label={fieldLabels[editingField]} icon={fieldIcon}>
            <label className="calibration-number-input"><input aria-label={fieldLabels[editingField]} aria-describedby="calibration-field-limits" aria-invalid={fieldDraft !== '' && !fieldDraftValid} type="text" inputMode="decimal" value={fieldDraft} onChange={(event) => { setFieldDraft(event.target.value); replaceFieldDraft.current = false }} onKeyDown={(event) => { if (event.key === 'Enter') submitField() }} /><span>{fieldUnits[editingField]}</span></label>
          </TuneValueEditor>
          <p id="calibration-field-limits">{fieldLimits[editingField]}</p>
          {fieldDraft !== '' && !fieldDraftValid && <p role="status">Значение вне допустимого диапазона.</p>}
          <button type="button" onClick={() => setEditingField(null)}>Назад</button>
        </div>
        <NumericKeypad label={fieldLabels[editingField]} ariaLabel={`Клавиатура: ${fieldLabels[editingField]}`} closeLabel="Закрыть ввод" value={fieldDraft} unit={fieldUnits[editingField]} onDigit={editFieldDigit} onClear={() => { setFieldDraft(''); replaceFieldDraft.current = false }} onBackspace={() => { setFieldDraft((value) => value.slice(0, -1)); replaceFieldDraft.current = false }} onDecimal={editingField === 'speed' || editingField === 'actual' ? editFieldDecimal : undefined} onSubmit={submitField} onClose={() => setEditingField(null)} testIdPrefix="calibration-field" />
      </div>, document.body)}
    </article>
  )
}

export { CalibrationProcedures }
