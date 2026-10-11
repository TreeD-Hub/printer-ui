import { useEffect, useRef, useState } from 'react'
import type { MacrosContainerProps } from './MacrosContainer'
import { CalibrationPreview } from './CalibrationPreview'
import { MotionStudy, ShaperSpectrum } from './ProcedureVisuals'
import { parseShaperSpectrumCsv } from './shaperResonanceCsv'
import type { ShaperSpectrumAxis } from './ProcedureVisuals'
import type { PrinterShaperResonanceReport } from '../core/transport/types'
import { isPrintJobActive } from '../core/transport/types'
import { subscribePrinterGcodeResponses } from '../core/store/printerNotifications'
import './calibrationProcedures.css'

type EddyProcedure = 'overview' | 'screws' | 'mesh' | 'firstLayer'
type Procedure = 'catalog' | 'shaper'
type ShaperAction = 'calibration' | 'adxlQuery' | 'adxlNoise'
type ShaperTarget = { typeX: string; typeY: string; freqXHz: number; freqYHz: number }
type AdxlDiagnostic = { kind: 'query' | 'noise'; chipAxes: string; x: number; y: number; z: number }
const OPERATION_TIMEOUT_MS = 90_000
const emptySpectra = (): Record<'x' | 'y', ShaperSpectrumAxis> => ({ x: { points: [], error: null }, y: { points: [], error: null } })

type Props = MacrosContainerProps & {
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

function CalibrationProcedures({ snapshot, pendingCommand, executeCommand, getCommandBlockReason, fetchShaperResonances, onCalibrationActivityChange, onCalibrationViewChange, catalogFolder, onCatalogFolderChange, onOpenPid, onOpenEddy }: Props) {
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
  const latestResponse = useRef('')
  const latestShaperTarget = useRef<Partial<ShaperTarget>>({})
  const runId = useRef(0)
  const running = useRef(false)
  const saveRestartSeen = useRef(false)
  const pendingSaveKind = useRef<'shaper' | null>(null)
  const operationDeadline = useRef<number | null>(null)
  const [operationUncertain, setOperationUncertain] = useState(false)
  const activePrint = isPrintJobActive(snapshot.printJob)
  const ready = READY(snapshot)
  const calibration = snapshot.calibration
  const blockedBase = activePrint ? 'Завершите печать перед калибровкой.'
    : !ready ? 'Нужно подключение к готовому принтеру.'
      : pendingCommand !== null ? 'Дождитесь завершения другой команды.' : null
  const calibrationBlock = blockedBase ?? (!calibration ? 'Данные калибровки недоступны в снимке принтера.' : null)
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
    if (pendingSaveKind.current && !ready) saveRestartSeen.current = true
  }, [ready, snapshot.updatedAt])

  useEffect(() => {
    if (stage !== 'saving') return
    if (!ready) saveRestartSeen.current = true
    if (!saveRestartSeen.current || !ready || calibration?.config.savePending !== false) return
    if (pendingSaveKind.current === 'shaper' && shaperMatchesTarget) {
      pendingSaveKind.current = null
      operationDeadline.current = null
      setStage('saved')
    }
  }, [stage, ready, calibration?.config.savePending, shaperMatchesTarget, snapshot.updatedAt])

  useEffect(() => {
    const isPending = pendingSaveKind.current !== null && (stage === 'running' || stage === 'saving')
    if (!isPending || operationDeadline.current === null) return
    const timeout = window.setTimeout(() => {
      if (operationDeadline.current === null) return
      ++runId.current
      running.current = false
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
    setDetailsOpen(false)
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

  function saveShaper() {
    if (stage !== 'result' || shaperSaveBlock) return
    const saveArgs = { command: 'consoleGcode' as const, script: 'TREED_SAVE_CONFIG' }
    saveRestartSeen.current = false
    pendingSaveKind.current = 'shaper'
    operationDeadline.current = Date.now() + OPERATION_TIMEOUT_MS
    void run(saveArgs, () => setStage('saving'))
  }

  function backToCatalog() {
    if (stage === 'running' || stage === 'applying' || stage === 'saving' || operationUncertain || activePrint) return
    setProcedure('catalog')
    onCalibrationViewChange?.(false)
    setStage('idle')
    setMessage('')
    ++spectrumToken.current
    preparingShaper.current = false
    setBaselinePreparing(false)
    ownedShaperRun.current = null
    publishActivity(false)
  }

  const blockedCommand = (args: Parameters<Props['executeCommand']>[0] | null, requiresCalibration = true): string | null => args === null
    ? 'Команда недоступна в текущем состоянии.'
    : blockedBase ?? (requiresCalibration && !calibration ? 'Данные калибровки недоступны в снимке принтера.' : null) ?? getCommandBlockReason(args.command, args)
  const shaperSaveBlock = blockedCommand({ command: 'consoleGcode', script: 'TREED_SAVE_CONFIG' })
    ?? (!shaperResultValid ? 'Рекомендации для обеих осей не получены.' : null)
    ?? (calibration?.config.savePending !== true ? 'Настройки ещё не готовы к сохранению.' : null)
    ?? (!calibration?.config.pendingSections.includes('input_shaper') ? 'Принтер не подтвердил готовность настроек к сохранению.' : null)
    ?? (currentShaper?.typeX == null || currentShaper.typeY == null || currentShaper.freqXHz == null || currentShaper.freqYHz == null ? 'Принтер ещё не передал настройки обеих осей. Дождитесь обновления данных.' : null)
  if (procedure === 'catalog') return (
    <div className={`macros-manager-list calibration-catalog${catalogFolder === 'eddy' ? ' is-eddy-folder' : ''}`} data-testid="calibration-catalog">
      <header className="macros-manager-list-head calibration-catalog-header">
        {catalogFolder === 'eddy' && <button type="button" className="calibration-catalog-back" onClick={() => onCatalogFolderChange('root')}>Назад</button>}
        <div className="macros-manager-title"><p>{catalogFolder === 'eddy' ? 'Калибровки / Eddy' : 'Калибровки'}{snapshot.source === 'mock' ? ' / Симуляция' : ''}</p><h1>{catalogFolder === 'eddy' ? 'Eddy' : 'Выберите процедуру'}</h1></div>
      </header>
      <div className="calibration-catalog-cards">
        {catalogFolder === 'eddy' ? <>
          <button type="button" className="macros-manager-workflow" onClick={() => onOpenEddy('overview')}><CalibrationPreview kind="eddy" /><span>Калибровка Eddy</span></button>
          <button type="button" className="macros-manager-workflow" onClick={() => onOpenEddy('screws')}><CalibrationPreview kind="screws" /><span>Винты стола</span></button>
          <button type="button" className="macros-manager-workflow" onClick={() => onOpenEddy('mesh')}><CalibrationPreview kind="mesh" /><span>Карта стола</span></button>
          <button type="button" className="macros-manager-workflow" onClick={() => onOpenEddy('firstLayer')}><CalibrationPreview kind="firstLayer" /><span>Первый слой</span></button>
        </> : <>
          <button type="button" className="macros-manager-workflow" onClick={onOpenPid}><CalibrationPreview kind="pid" /><span>PID-калибровка</span><em>Сопло и стол</em></button>
          <button type="button" className="macros-manager-workflow" aria-label="Датчик Eddy" onClick={() => onCatalogFolderChange('eddy')}><CalibrationPreview kind="eddyFolder" /><span>Eddy</span><em>Датчик и стол</em></button>
          <button type="button" className="macros-manager-workflow" onClick={() => { onCalibrationViewChange?.(true); setProcedure('shaper'); setStage('idle'); setShaperAction(null); setAdxlDiagnostic(null); setMessage('') }}><CalibrationPreview kind="shaper" /><span>Шейпер и ADXL</span><em>Резонансы X и Y</em></button>
        </>}
      </div>
    </div>
  )

  const title = 'Шейпер и ADXL'
  const isBlocking = stage === 'running' || stage === 'applying' || stage === 'saving' || operationUncertain
  const savingShaper = pendingSaveKind.current === 'shaper' || stage === 'saving'
  const shaperRecommendation = shaperAction === 'calibration' && shaperResultValid && (savingShaper || ['result', 'saved'].includes(stage))
  const workflowSteps = ['Подготовка', 'Измерение', 'Результат', 'Сохранение']
  const activeWorkflowStep = savingShaper || stage === 'saved' ? 3 : stage === 'running' ? 1 : stage === 'result' ? 2 : 0
  return (
    <article className="calibration-procedure">
      <header className="calibration-procedure-header"><button type="button" disabled={isBlocking || activePrint} onClick={backToCatalog}>К списку</button><div>{snapshot.source === 'mock' && <p>Симуляция</p>}<h2>{title}</h2></div><button type="button" aria-expanded={detailsOpen} aria-controls="calibration-technical-details" onClick={() => setDetailsOpen((value) => !value)}>{detailsOpen ? 'Скрыть' : 'Подробнее'}</button></header>
      {workflowSteps.length > 0 && <ol className="calibration-workflow-steps" aria-label="Этапы процедуры">{workflowSteps.map((label, index) => <li key={label} aria-current={activeWorkflowStep === index ? 'step' : undefined}>{String(index + 1).padStart(2, '0')} {label}</li>)}</ol>}
      <main className="calibration-procedure-body has-study">
        {detailsOpen ? <section id="calibration-technical-details" className="calibration-technical-details" aria-label="Подробности процедуры">
          {procedure === 'shaper' && <>
            <p>Спектр показывает измеренный PSD_xyz из CSV текущего запуска. Частота — в Гц; физическая единица PSD источником не задана.</p>
            <div className="calibration-shaper-comparison" aria-label="Сейчас и рекомендовано"><div className="calibration-comparison-head"><span>Ось</span><span>Сейчас</span><span>Рекомендовано</span></div>{(['x', 'y'] as const).map((axis) => <div key={axis}><strong>{axis.toUpperCase()}</strong><span>{axis === 'x' ? currentShaper?.typeX ?? '—' : currentShaper?.typeY ?? '—'} · {(axis === 'x' ? currentShaper?.freqXHz : currentShaper?.freqYHz)?.toFixed(1) ?? '—'} Гц</span><span>{axis === 'x' ? shaperTarget.typeX ?? '—' : shaperTarget.typeY ?? '—'} · {(axis === 'x' ? shaperTarget.freqXHz : shaperTarget.freqYHz)?.toFixed(1) ?? '—'} Гц</span></div>)}</div>
            {adxlDiagnostic && <p>{adxlDiagnostic.kind === 'noise' ? `Оси датчика: ${adxlDiagnostic.chipAxes}. Порог нормы не задан.` : 'Показания из ответа датчика; это не временной график.'}</p>}
            {adxlDiagnostic && <dl className="calibration-adxl-values" role="status" aria-label={adxlDiagnostic.kind === 'query' ? 'Показания акселерометра' : 'Шум акселерометра'}><div><dt>X</dt><dd>{adxlDiagnostic.x.toFixed(3)}</dd></div><div><dt>Y</dt><dd>{adxlDiagnostic.y.toFixed(3)}</dd></div><div><dt>Z</dt><dd>{adxlDiagnostic.z.toFixed(3)}</dd></div></dl>}
            <div className="calibration-action-row"><button type="button" disabled={blockedCommand({ command: 'accelerometerQuery' }) !== null || isBlocking || baselinePreparing} title={blockedCommand({ command: 'accelerometerQuery' }) ?? undefined} onClick={() => void runAdxlDiagnostic('query')}>Считать ADXL</button><button type="button" disabled={blockedCommand({ command: 'accelerometerMeasureNoise' }) !== null || isBlocking || baselinePreparing} title={blockedCommand({ command: 'accelerometerMeasureNoise' }) ?? undefined} onClick={() => void runAdxlDiagnostic('noise')}>Измерить шум</button></div>
            {(blockedCommand({ command: 'accelerometerQuery' }) || blockedCommand({ command: 'accelerometerMeasureNoise' })) && <p className="calibration-blocked-diagnostics" role="status">{blockedCommand({ command: 'accelerometerQuery' }) && <>ADXL: {blockedCommand({ command: 'accelerometerQuery' })}</>}{blockedCommand({ command: 'accelerometerMeasureNoise' }) && blockedCommand({ command: 'accelerometerMeasureNoise' }) !== blockedCommand({ command: 'accelerometerQuery' }) && <> Шум: {blockedCommand({ command: 'accelerometerMeasureNoise' })}</>}</p>}
            {message && <p role="alert">{message}</p>}
          </>}
        </section> : <>
        <section className="calibration-procedure-visual" aria-label="Измерение резонансов">
          {shaperRecommendation ? <ShaperSpectrum axes={spectra} axis={spectrumAxis} onAxisChange={setSpectrumAxis} loading={spectrumLoading} /> : <MotionStudy diagnostic={shaperAction === 'adxlQuery' ? 'query' : shaperAction === 'adxlNoise' ? 'noise' : null} />}
        </section>
        <div className="calibration-procedure-details">
        {snapshot.transport.state !== 'online' && <p role="status">Последние данные; связи нет.</p>}
        {procedure === 'shaper' && <>
          {stage === 'idle' && <section className="calibration-procedure-stage">
            <p>Освободите зону движения. Измеряем резонансы X/Y.</p>
            <div className="calibration-choice-row"><button type="button" aria-pressed={shaperMode === 'full'} disabled={isBlocking || baselinePreparing} onClick={() => setShaperMode('full')}>Полный тест</button><button type="button" aria-pressed={shaperMode === 'light'} disabled={isBlocking || baselinePreparing} onClick={() => setShaperMode('light')}>Лёгкий прогон</button></div>
            {!calibration?.shaper && <p role="status">Нет данных шейпера; сохранение нельзя подтвердить.</p>}
          </section>}
          {stage === 'running' && !savingShaper && <section className="calibration-procedure-stage"><h3>Измеряем…</h3></section>}
          {(stage === 'result' || shaperRecommendation) && <section className="calibration-procedure-stage"><h3>{shaperAction === 'calibration' ? stage === 'saved' ? 'Калибровка сохранена' : savingShaper ? 'Сохранение калибровки' : 'Результат калибровки' : 'Диагностика ADXL'}</h3>
            {shaperAction === 'calibration' && shaperResultValid && <div className="calibration-primary-readout" role="status" aria-label="Рекомендация по шейперу"><span>Рекомендовано · {spectrumAxis.toUpperCase()}</span><strong>{(spectrumAxis === 'x' ? shaperTarget.typeX : shaperTarget.typeY)?.toUpperCase()}</strong><strong>{(spectrumAxis === 'x' ? shaperTarget.freqXHz : shaperTarget.freqYHz)?.toFixed(1)} <small>Гц</small></strong></div>}
            {shaperAction === 'calibration' && stage === 'result' && shaperSaveBlock && <p role="status">{shaperSaveBlock}</p>}
            {stage === 'saving' && <p role="status">Настройки сохраняются. Ожидаем готовность принтера.</p>}
          </section>}
        </>}
        {stage === 'stopped' && <p role="status">Аварийная остановка принята. Проверьте принтер до новой калибровки.</p>}
        {message && <p role="alert">{message}</p>}
        </div>
        </>}
      </main>
      <div className="calibration-procedure-status" role="status">{operationUncertain || message ? 'Нет подтверждения. Проверьте принтер перед продолжением.' : savingShaper ? 'Ожидаем сохранения и перезапуска принтера.' : baselinePreparing ? 'Читаем исходные данные.' : stage === 'running' ? 'Измерение выполняется. Не трогайте принтер.' : stage === 'saved' ? 'Сохранено.' : stage === 'result' && shaperAction === 'calibration' ? 'Сохранение перезапустит принтер.' : stage === 'error' ? 'Нет подтверждения от принтера.' : stage === 'stopped' ? 'Остановлено. Проверьте принтер.' : blockedCommand(shaperArgs) ?? ''}</div>
      <footer className="calibration-procedure-footer">
        <div className="calibration-footer-emergency">{sessionActive.current && <button type="button" className="is-danger" disabled={commandReason('emergencyStop') !== null} onClick={() => void run({ command: 'emergencyStop' }, () => { pendingSaveKind.current = null; operationDeadline.current = null; setStage('stopped') }, false)}>Аварийная остановка</button>}</div>
        <div className="calibration-footer-secondary">{stage === 'result' && shaperAction === 'calibration' && <button type="button" className="is-secondary" disabled={blockedCommand(shaperArgs) !== null || baselinePreparing} onClick={() => void startShaper()}>Повторить замер</button>}</div>
        <div className="calibration-footer-primary">
          {isBlocking ? <button type="button" className="is-primary" disabled>{savingShaper ? 'Сохранение…' : 'Ожидаем завершения'}</button>
            : stage === 'saved' ? <button type="button" className="is-primary" onClick={backToCatalog}>Готово</button>
              : stage === 'result' && shaperAction !== 'calibration' ? <button type="button" className="is-primary" onClick={() => { setStage('idle'); setShaperAction(null); setAdxlDiagnostic(null); setDetailsOpen(false) }}>К тесту резонансов</button>
              : stage === 'result' && shaperAction === 'calibration' ? <button type="button" className="is-primary" disabled={shaperSaveBlock !== null} title={shaperSaveBlock ?? undefined} onClick={saveShaper}>Сохранить и перезапустить</button>
                : <button type="button" className="is-primary" disabled={blockedCommand(shaperArgs) !== null || baselinePreparing} title={blockedCommand(shaperArgs) ?? undefined} onClick={() => void startShaper()}>{stage === 'error' ? 'Повторить прогон' : 'Измерить резонансы'}</button>}
        </div>
      </footer>
    </article>
  )
}

export { CalibrationProcedures }
