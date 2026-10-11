import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MacrosContainerProps } from './MacrosContainer'
import { isPrintJobActive } from '../core/transport/types'
import { subscribePrinterGcodeResponses } from '../core/store/printerNotifications'
import { NumericKeypad, TuneValueEditor, useModalFocus } from '../ui'
import './calibrationProcedures.css'

type EddyProcedure = 'overview' | 'screws' | 'mesh' | 'firstLayer'
type Procedure = 'catalog' | 'shaper' | 'extruder' | 'material' | 'service'
type MaterialTest = 'pa' | 'flow' | 'temperature' | 'retraction' | 'maxFlow'
type ExtruderField = 'length' | 'speed' | 'temperature' | 'actual'
type ShaperTarget = { typeX: string; typeY: string; freqXHz: number; freqYHz: number }
const OPERATION_TIMEOUT_MS = 90_000
const MATERIAL_TESTS: Array<{ id: MaterialTest; title: string; guidance: string }> = [
  { id: 'pa', title: 'Pressure Advance', guidance: 'Сравните углы и переходы теста; выбранный коэффициент запишите в профиль материала слайсера.' },
  { id: 'flow', title: 'Расход', guidance: 'Сравните поверхность и геометрию образца; корректировку расхода внесите в профиль слайсера.' },
  { id: 'temperature', title: 'Температура', guidance: 'Сравните участки температурной башни по мостам, нависаниям и нитям.' },
  { id: 'retraction', title: 'Ретракт', guidance: 'Сравните тестовые столбики по нитям и пропускам после перемещения.' },
  { id: 'maxFlow', title: 'Макс. поток', guidance: 'Найдите участок с ухудшением заполнения/поверхности; внесите найденный предел в слайсер.' },
]

type Props = MacrosContainerProps & {
  completedRequiredCount: number
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

function canonicalPrintPath(path: string): string {
  return path.replace(/^\/+/, '')
}

function CalibrationProcedures({ snapshot, pendingCommand, executeCommand, getCommandBlockReason, completedRequiredCount, onOpenPid, onOpenEddy }: Props) {
  const [procedure, setProcedure] = useState<Procedure>('catalog')
  const [message, setMessage] = useState('')
  const [stage, setStage] = useState<'idle' | 'running' | 'result' | 'applying' | 'saving' | 'applied' | 'saved' | 'error' | 'stopped'>('idle')
  const [shaperMode, setShaperMode] = useState<'full' | 'light'>('full')
  const [shaperTarget, setShaperTarget] = useState<Partial<ShaperTarget>>({})
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
  const [filamentChecked, setFilamentChecked] = useState(false)
  const [testChecked, setTestChecked] = useState(false)
  const [materialStartedFile, setMaterialStartedFile] = useState<string | null>(null)
  const [materialFinishedState, setMaterialFinishedState] = useState<'complete' | 'cancelled' | null>(null)
  const [response, setResponse] = useState('')
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
    latestResponse.current = next
    setResponse(next)
    const target = parseShaperTarget(next, latestShaperTarget.current)
    latestShaperTarget.current = target
    setShaperTarget(target)
  }), [])

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

  async function run(args: Parameters<Props['executeCommand']>[0], onComplete?: () => void, requiresCalibration = true) {
    const emergency = args.command === 'emergencyStop'
    if ((running.current && !emergency) || (!emergency && (blockedBase || (requiresCalibration && !calibration) || pendingCommand !== null)) || getCommandBlockReason(args.command, args)) return
    if (emergency) ++runId.current
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
      onComplete?.()
      if (emergency) setOperationUncertain(false)
    } catch (cause) {
      if (runId.current === id) {
        setMessage(cause instanceof Error ? `${cause.message} Команда могла продолжиться на принтере; используйте аварийную остановку и проверьте состояние.` : 'Команда завершилась с ошибкой и могла продолжиться на принтере; используйте аварийную остановку.')
      }
    } finally {
      if (runId.current === id) running.current = false
    }
  }

  async function startShaper() {
    if (calibrationBlock || commandReason(shaperArgs.command, shaperArgs)) return
    setShaperTarget({})
    setResponse('')
    latestResponse.current = ''
    latestShaperTarget.current = {}
    await run(shaperArgs, () => {
      const result = latestShaperTarget.current
      if (Number.isFinite(result.freqXHz) && Number.isFinite(result.freqYHz) && result.typeX && result.typeY) {
        setShaperTarget(result)
        setStage('result')
      } else {
        setMessage('Klipper не вернул рекомендации для обеих осей. Результат не подтверждён.')
        setStage('error')
      }
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
    <div className="macros-manager-list calibration-catalog" data-testid="calibration-catalog">
      <header className="macros-manager-list-head"><div className="macros-manager-title"><p>Калибровки</p><h1>Выберите процедуру</h1></div></header>
      <div className="calibration-catalog-groups">
        <section aria-label="Калибровка PID"><h2>Нагреватели</h2><button type="button" className="macros-manager-workflow" onClick={onOpenPid}><span>PID-калибровка</span><em>Сопло или стол: нагрев, расчёт и отдельное сохранение.</em><strong>PID</strong></button></section>
        <section aria-label="Калибровка Eddy"><h2>Датчик и стол · Eddy</h2><div className="calibration-catalog-cards">
          {[['overview', 'Калибровка Eddy', 'Ток катушки, высота, температура и смещения.'], ['screws', 'Винты стола', 'Измерить отклонения и повторно проверить винты.'], ['mesh', 'Карта стола', 'Построить карту и проверить измеренные значения.'], ['firstLayer', 'Первый слой', 'Проверить заранее подготовленный тестовый G-code.']].map(([procedureId, title, detail]) => <button type="button" className="macros-manager-workflow" key={procedureId} onClick={() => onOpenEddy(procedureId as EddyProcedure)}><span>{title}</span><em>{detail}</em><strong>Eddy · {completedRequiredCount}/5</strong></button>)}
        </div></section>
        <section aria-label="Кинематика и датчики"><h2>Кинематика и датчики</h2><div className="calibration-catalog-cards">
          <button type="button" className="macros-manager-workflow" onClick={() => { setProcedure('shaper'); setStage('idle') }}><span>Шейпер и ADXL</span><em>Полный расчёт, лёгкая сессия и отдельное сохранение.</em><strong>ADXL345</strong></button>
          <button type="button" className="macros-manager-workflow" onClick={() => { setProcedure('extruder'); setStage('idle'); setMeasuredLength(''); setRotationDraft(null) }}><span>Подача экструдера</span><em>Реальный замер подачи и пересчёт rotation distance.</em><strong>Экструдер</strong></button>
        </div></section>
        <section aria-label="Материал и сервис"><h2>Материал и сервис</h2><div className="calibration-catalog-cards">
          <button type="button" className="macros-manager-workflow" onClick={() => { setProcedure('material'); setStage('idle'); setMaterialStartedFile(null); setMaterialFinishedState(null); materialObservedActive.current = false; setMaterialTest(null); setFilamentChecked(false); setTestChecked(false) }}><span>Профиль материала</span><em>Подготовленный G-code и ручной разбор результата печати.</em><strong>Материал</strong></button>
          <button type="button" className="macros-manager-workflow" onClick={() => { setProcedure('service'); setStage('idle') }}><span>Сервисная телеметрия</span><em>Только доступные данные; аппаратные подтверждения не имитируются.</em><strong>Экспериментально</strong></button>
        </div></section>
      </div>
    </div>
  )

  const title = procedure === 'shaper' ? 'Шейпер и ADXL' : procedure === 'extruder' ? 'Подача экструдера' : procedure === 'material' ? 'Профиль материала' : 'Сервисная телеметрия'
  const isBlocking = stage === 'running' || stage === 'applying' || stage === 'saving' || operationUncertain
  return (
    <article className="calibration-procedure">
      <header className="calibration-procedure-header"><button type="button" disabled={isBlocking || activePrint} onClick={backToCatalog}>К списку</button><div><p>Калибровки / {title}</p><h2>{title}</h2></div><span>{operationUncertain ? 'Нужна проверка принтера' : isBlocking ? 'Команда выполняется' : stage === 'error' ? 'Нет подтверждения' : stage === 'stopped' ? 'Остановлено' : stage === 'saved' ? 'Подтверждено' : stage === 'result' ? 'Результат' : 'Подготовка'}</span></header>
      <main className="calibration-procedure-body">
        {procedure === 'shaper' && <>
          <p>Полная калибровка выполняет разгонный тест по X/Y, но не сохраняет результат автоматически. Сохранение доступно отдельно и подтверждается перезапуском и совпадением обоих значений.</p>
          <div className="calibration-choice-row"><button type="button" aria-pressed={shaperMode === 'full'} disabled={isBlocking} onClick={() => setShaperMode('full')}>Полная калибровка</button><button type="button" aria-pressed={shaperMode === 'light'} disabled={isBlocking} onClick={() => setShaperMode('light')}>Лёгкий прогон</button></div>
          {calibration?.shaper && <p>Сейчас: X {calibration.shaper.typeX ?? '—'} / {calibration.shaper.freqXHz?.toFixed(1) ?? '—'} Гц · Y {calibration.shaper.typeY ?? '—'} / {calibration.shaper.freqYHz?.toFixed(1) ?? '—'} Гц</p>}
          {shaperResultValid && <div className="calibration-result" role="status"><strong>Рекомендация Klipper</strong><span>X {shaperTarget.typeX} · {shaperTarget.freqXHz?.toFixed(1)} Гц</span><span>Y {shaperTarget.typeY} · {shaperTarget.freqYHz?.toFixed(1)} Гц</span></div>}
          {stage === 'result' && !calibration?.config.pendingSections.includes('input_shaper') && <p role="status">Klipper не сообщает ожидающий input_shaper; отдельная запись пока заблокирована.</p>}
          {stage === 'saving' && <p role="status">Сохранение принято; ждём перезапуск, готовность, отсутствие pending config и совпадение эффективных значений.</p>}
          {stage === 'saved' && <p role="status">Новые значения X/Y загружены после перезапуска.</p>}
          {stage === 'applying' && <p role="status">Применение принято. Ждём обновлённый снимок эффективного rotation distance…</p>}
          {!calibration?.shaper && <p role="status">Снимок шейпера неизвестен; сохранение нельзя подтвердить.</p>}
          <div className="calibration-action-row">
            <button type="button" disabled={blockedCommand({ command: 'accelerometerQuery' }) !== null || isBlocking} title={blockedCommand({ command: 'accelerometerQuery' }) ?? undefined} onClick={() => { latestResponse.current = ''; setResponse(''); void run({ command: 'accelerometerQuery' }, () => { const received = /accelerometer values/i.test(latestResponse.current); setMessage(received ? 'Ответ ADXL получен.' : 'Ответ ADXL не распознан; состояние осталось неподтверждённым.'); setStage(received ? 'result' : 'error') }) }}>Считать ADXL</button>
            <button type="button" disabled={blockedCommand({ command: 'accelerometerMeasureNoise' }) !== null || isBlocking} title={blockedCommand({ command: 'accelerometerMeasureNoise' }) ?? undefined} onClick={() => { latestResponse.current = ''; setResponse(''); void run({ command: 'accelerometerMeasureNoise' }, () => { const received = /axes_noise/i.test(latestResponse.current); setMessage(received ? 'Измерение шума ADXL получено.' : 'Ответ измерения ADXL не распознан; состояние осталось неподтверждённым.'); setStage(received ? 'result' : 'error') }) }}>Измерить шум</button>
          </div>
          {blockedCommand({ command: 'accelerometerQuery' }) && <p role="status">ADXL query: {blockedCommand({ command: 'accelerometerQuery' })}</p>}
          {blockedCommand({ command: 'accelerometerMeasureNoise' }) && <p role="status">ADXL noise: {blockedCommand({ command: 'accelerometerMeasureNoise' })}</p>}
          {response && <p role="status">Последний ответ: {response}</p>}
        </>}
        {procedure === 'extruder' && <>
          <p>Проверьте свободную подачу филамента и подготовьте измерительный инструмент. После команды измерьте фактически выданную длину; результат рассчитывается как старый rotation distance × фактическая длина / запрошенная длина.</p>
          <div className="calibration-fields">
            {([['length', 'Запрошенная длина, мм', extrudeLength, stage === 'idle'], ['speed', 'Скорость, мм/с', extrudeSpeed, stage === 'idle'], ['temperature', 'Температура сопла, °C', extrudeTemperature, stage === 'idle'], ['actual', 'Фактическая длина, мм', measuredLength || 'Не введена', stage === 'result']] as const).map(([field, label, value, enabled]) => <label key={field}>{label}<button type="button" className="calibration-field-value" aria-label={label} disabled={!enabled} onClick={() => openField(field)}>{value}</button></label>)}
          </div>
          <p>Текущий rotation distance: {oldRotation?.toFixed(4) ?? 'неизвестен'} мм.</p>
          {calculatedRotation !== null && <p>Расчётный результат: {calculatedRotation.toFixed(4)} мм.</p>}
          {stage === 'applying' && <p role="status">Применение принято. Ждём обновлённый снимок эффективной конфигурации…</p>}
          {stage === 'applied' && <p role="status">Сессионное значение подтверждено снимком Klipper. Для записи на диск требуется отдельное сохранение.</p>}
          {stage === 'applied' && blockedCommand(extruderSaveArgs) && <p role="status">Запись заблокирована: {blockedCommand(extruderSaveArgs)}</p>}
          {stage === 'saved' && <p role="status">После перезапуска снимок подтверждает сохранённый rotation distance.</p>}
        </>}
        {procedure === 'material' && <>
          <p>Выберите загруженный тестовый G-code для материала. До запуска вручную проверьте, что тест подготовлен под выбранный филамент и безопасен для текущего принтера. Профиль PA, расход, температуру, ретракт и максимальный объёмный поток оценивайте в слайсере по результату печати.</p>
          <div className="calibration-choice-row" role="group" aria-label="Профильная проверка материала">{MATERIAL_TESTS.map((item) => <button key={item.id} type="button" aria-pressed={materialTest === item.id} disabled={activePrint || isBlocking} onClick={() => { setMaterialTest(item.id); setTestChecked(false); setMaterialStartedFile(null); setMaterialFinishedState(null); materialObservedActive.current = false }}>{item.title}</button>)}</div>
          {selectedMaterialTest && <p>{selectedMaterialTest.guidance}</p>}
          {snapshot.printFiles.length > 0 ? <label className="calibration-file-select">Тестовый файл<select value={selectedFile} disabled={activePrint || isBlocking} onChange={(event) => { setSelectedFile(event.target.value); setTestChecked(false); setMaterialStartedFile(null); setMaterialFinishedState(null); materialObservedActive.current = false }}><option value="">Выберите загруженный G-code</option>{snapshot.printFiles.map((file) => <option key={file.id} value={file.path}>{file.name}</option>)}</select></label> : <p role="status">Список загруженных G-code недоступен.</p>}
          <label className="calibration-check"><input type="checkbox" checked={filamentChecked} disabled={!selectedFileEntry || !selectedMaterialTest || activePrint || isBlocking} onChange={(event) => setFilamentChecked(event.target.checked)} />Филамент и температура в тесте соответствуют подготовке.</label>
          <label className="calibration-check"><input type="checkbox" checked={testChecked} disabled={!selectedFileEntry || !selectedMaterialTest || activePrint || isBlocking} onChange={(event) => setTestChecked(event.target.checked)} />Я проверил файл {selectedMaterialTest?.title ?? 'теста'} и готов наблюдать за печатью.</label>
          {selectedFileEntry && <p>Выбран файл: {selectedFileEntry.name}. Запуск сам по себе не подтверждает качество или сохранение профиля.</p>}
          {activePrint && <p role="status">Печать: {snapshot.printJob.filename} · {snapshot.printJob.progressPercent}% · результат оцените после завершения.</p>}
          {printArgs && !activePrint && blockedCommand(printArgs, false) && <p role="status">Запуск заблокирован: {blockedCommand(printArgs, false)}</p>}
          {materialFinishedState === 'complete' && <p role="status">Наблюдавшаяся печать выбранного файла завершена. Зафиксируйте измерения и выводы в профиле материала или заметках слайсера. Интерфейс не определяет качество и не подтверждает настройки.</p>}
          {materialFinishedState === 'cancelled' && <p role="status">Наблюдавшаяся печать выбранного файла отменена. Результат теста не получен.</p>}
        </>}
        {procedure === 'service' && <>
          <p>Только read-only телеметрия. Снимок не доказывает SGT, Z-калибровку или наличие TAP, поэтому аппаратные проверки не запускаются.</p>
          <dl className="calibration-service-grid"><div><dt>Eddy</dt><dd>{calibration?.eddy.available ? 'Доступен' : calibration ? 'Не доступен' : 'Неизвестно'}</dd></div><div><dt>Температура Eddy</dt><dd>{calibration?.eddy.temperatureC?.toFixed(1) ?? 'Неизвестно'} °C</dd></div><div><dt>Код тока катушки</dt><dd>{calibration?.eddy.driveCurrent?.toFixed(0) ?? 'Неизвестно'}</dd></div><div><dt>Компенсация</dt><dd>{calibration?.eddy.compensationEnabled === null || !calibration ? 'Неизвестно' : calibration.eddy.compensationEnabled ? 'Включена' : 'Выключена'}</dd></div><div><dt>Калибровка высоты</dt><dd>{calibration?.eddy.heightCalibrated === null || !calibration ? 'Неизвестно' : calibration.eddy.heightCalibrated ? 'Подтверждена' : 'Не настроена'}</dd></div><div><dt>Pending config</dt><dd>{calibration?.config.savePending === undefined ? 'Неизвестно' : calibration.config.savePending ? calibration.config.pendingSections.join(', ') || 'Есть изменения' : 'Нет'}</dd></div></dl>
          <p>TAP в текущем профиле не подтверждён. Не выполняйте SGT/TAP только по этому экрану.</p>
        </>}
        {message && <p role="alert">{message}</p>}
        {stage === 'stopped' && <p role="status">Аварийная остановка принята. Проверьте принтер до новой калибровки.</p>}
        {procedure === 'shaper' && stage === 'idle' && blockedCommand(shaperArgs) && <p role="status">{blockedCommand(shaperArgs)}</p>}
        {procedure === 'extruder' && stage === 'idle' && blockedCommand(extruderArgs) && <p role="status">{blockedCommand(extruderArgs)}</p>}
        {procedure === 'extruder' && stage === 'result' && extruderApplyBlock && <p role="status">{extruderApplyBlock}</p>}
        {procedure === 'material' && selectedFileEntry && (!filamentChecked || !testChecked) && <p role="status">Подтвердите подготовку филамента и содержимого тестового файла.</p>}
        {response && procedure === 'shaper' && stage === 'error' && <p>Ответ Klipper: {response}</p>}
      </main>
      <footer className="calibration-procedure-footer">
        {isBlocking ? <><span role="status">{operationUncertain ? message : message || 'Ожидаем подтверждение Klipper'}</span><button type="button" className="is-danger" disabled={commandReason('emergencyStop') !== null} onClick={() => void run({ command: 'emergencyStop' }, () => { pendingSaveKind.current = null; pendingApply.current = false; operationDeadline.current = null; setStage('stopped') }, false)}>Аварийная остановка</button></> : <>
          <button type="button" disabled={activePrint} onClick={backToCatalog}>К списку</button>
          {procedure === 'shaper' && <><button type="button" disabled={blockedCommand(shaperArgs) !== null} title={blockedCommand(shaperArgs) ?? undefined} onClick={() => void startShaper()}>{stage === 'error' ? 'Повторить прогон' : shaperMode === 'full' ? 'Запустить полный тест' : 'Запустить лёгкий прогон'}</button>{stage === 'result' && <button type="button" disabled={calibration?.config.savePending !== true || commandReason('consoleGcode', { command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' }) !== null} title={calibration?.config.savePending !== true ? 'Сначала дождитесь pending config от рекомендации.' : undefined} onClick={saveShaper}>Сохранить и перезапустить</button>}</>}
          {procedure === 'extruder' && <>{stage === 'idle' && <button type="button" disabled={!extruderInputValid || blockedCommand(extruderArgs) !== null || oldRotation === null} title={!extruderInputValid ? 'Проверьте пределы длины, скорости и температуры.' : oldRotation === null ? 'Текущий rotation distance неизвестен.' : blockedCommand(extruderArgs) ?? undefined} onClick={startExtruderFeed}>Выполнить подачу</button>}{stage === 'result' && <button type="button" disabled={!Number.isFinite(actualExtruded) || actualExtruded < 1 || extruderApplyBlock !== null} title={extruderApplyBlock ?? undefined} onClick={applyExtruderRotation}>Рассчитать и применить</button>}{stage === 'applied' && <button type="button" disabled={!extruderSaveArgs || blockedCommand(extruderSaveArgs) !== null} title={blockedCommand(extruderSaveArgs) ?? undefined} onClick={saveExtruderRotation}>Записать и перезапустить</button>}</>}
          {procedure === 'material' && printArgs && <button type="button" disabled={!filamentChecked || !testChecked || !selectedMaterialTest || blockedCommand(printArgs, false) !== null || activePrint} title={!filamentChecked || !testChecked || !selectedMaterialTest ? 'Выберите тип теста и подтвердите подготовку филамента и файла.' : blockedCommand(printArgs, false) ?? undefined} onClick={() => void run(printArgs, () => { materialObservedActive.current = false; setMaterialFinishedState(null); setMaterialStartedFile(canonicalPrintPath(printArgs.filename)); setMessage('Команда запуска подтверждена. Ждём наблюдения выбранного файла в активной печати.'); setStage('result') }, false)}>Запустить тестовую печать</button>}
        </>}
      </footer>
      {procedure === 'extruder' && stage === 'result' && <p className="calibration-inline-note">Введите фактическую длину до применения. Данные и формула перепроверяются перед отправкой.</p>}
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
