import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MacrosContainerProps } from './MacrosContainer'
import { subscribePrinterGcodeResponses } from '../core/store/printerNotifications'
import { isPrintJobActive } from '../core/transport/types'
import { NumericKeypad, TemperatureTrendChart, TuneValueEditor, useModalFocus } from '../ui'
import type { TemperatureChartPoint } from '../control/types'
import './pidCalibration.css'

type Stage = 'select' | 'prepare' | 'running' | 'result' | 'saving' | 'finish' | 'error' | 'stopped'
const TITLES: Record<Stage, string> = {
  select: 'Выберите нагреватель', prepare: 'Подготовьте принтер', running: 'Калибровка выполняется',
  result: 'Коэффициенты рассчитаны', saving: 'Сохраняем результат', finish: 'PID сохранён',
  error: 'Результат не подтверждён', stopped: 'Калибровка прервана',
}
const STEP: Record<Stage, number> = { select: 1, prepare: 2, running: 3, result: 4, saving: 5, finish: 5, error: 3, stopped: 3 }
// Klipper ce7002b из printer-core: минимум 12 пиков, то есть 6 циклов нагрева.
const PID_CYCLES = 6

export function PidCalibrationScreen({ snapshot, pendingCommand, executeCommand, getCommandBlockReason, onBackToList }: MacrosContainerProps & { onBackToList: () => void }) {
  const [stage, setStage] = useState<Stage>('select')
  const [heater, setHeater] = useState<'extruder' | 'heater_bed'>('extruder')
  const [target, setTarget] = useState(200)
  const [history, setHistory] = useState<TemperatureChartPoint[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [cycle, setCycle] = useState<number | null>(1)
  const [phase, setPhase] = useState<'heating' | 'cooling'>('heating')
  const startedAt = useRef(0)
  const lastPidTarget = useRef<number | null>(null)
  const savePending = useRef(false)
  const restartSeen = useRef(false)
  const [saveAccepted, setSaveAccepted] = useState(false)
  const [isTemperatureOpen, setTemperatureOpen] = useState(false)
  const [temperatureDraft, setTemperatureDraft] = useState('')
  const [fanEnabled, setFanEnabled] = useState(() => snapshot.modelFanPercent > 0)
  const [isStarting, setStarting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState('')
  const activeRun = useRef(0)
  const coefficients = useRef<string | null>(null)
  const busy = useRef(false)
  const replaceDraft = useRef(true)
  const temperatureDialog = useModalFocus<HTMLDivElement>(isTemperatureOpen, () => setTemperatureOpen(false))
  const nozzle = heater === 'extruder'
  const temperature = nozzle ? snapshot.extruderTemp : snapshot.bedTemp
  const liveTarget = nozzle ? snapshot.thermalTargets.nozzle : snapshot.thermalTargets.bed
  const ready = snapshot.transport.state === 'online' && snapshot.klippy.state === 'ready'
  const maxTemperature = Math.ceil(nozzle ? snapshot.limits.nozzleMaxC : snapshot.limits.bedMaxC) - 1
  const fanPercent = fanEnabled ? 100 : 0
  const draftNumber = Number(temperatureDraft)
  const draftValid = /^\d+$/.test(temperatureDraft) && Number.isInteger(draftNumber) && draftNumber > 0 && draftNumber <= maxTemperature
  const hasActivePrint = isPrintJobActive(snapshot.printJob)
  const args = { command: 'consoleGcode' as const, script: `PID_CALIBRATE HEATER=${heater} TARGET=${target}` }
  const fanArgs = { command: 'setFanPercent' as const, percent: fanPercent }
  const saveArgs = { command: 'consoleGcode' as const, script: 'TREED_SAVE_CONFIG' }
  const saveBlock = ['printing', 'paused'].includes(snapshot.printJob.state)
    ? 'Завершите печать перед сохранением.'
    : !ready ? 'Ожидаем готовность принтера.'
      : pendingCommand !== null ? 'Дождитесь завершения другой команды.'
        : getCommandBlockReason('consoleGcode', saveArgs)
  const block = ['printing', 'paused'].includes(snapshot.printJob.state)
    ? 'Завершите печать перед калибровкой.'
    : snapshot.transport.state !== 'online' || snapshot.klippy.state !== 'ready'
      ? 'Нужно подключение к готовому принтеру.'
      : pendingCommand !== null ? 'Дождитесь завершения другой команды.'
        : !Number.isInteger(target) || target <= 0 || target > maxTemperature
          ? 'Температура должна быть ниже предела нагревателя.'
          : getCommandBlockReason('consoleGcode', args) ?? getCommandBlockReason(nozzle ? 'setNozzleTarget' : 'setBedTarget', { command: nozzle ? 'setNozzleTarget' : 'setBedTarget', targetCelsius: target })
            ?? (fanPercent !== Math.round(snapshot.modelFanPercent) ? getCommandBlockReason('setFanPercent', fanArgs) : null)

  useEffect(() => {
    if (hasActivePrint) setTemperatureOpen(false)
  }, [hasActivePrint])

  useEffect(() => subscribePrinterGcodeResponses((message) => {
    if (!busy.current) return
    const match = message.match(/pid_Kp[=:]\s*([\d.]+)\s+pid_Ki[=:]\s*([\d.]+)\s+pid_Kd[=:]\s*([\d.]+)/i)
    if (match) {
      coefficients.current = `Kp ${match[1]} · Ki ${match[2]} · Kd ${match[3]}`
      setResult(coefficients.current)
    }
  }), [])

  useEffect(() => {
    if (stage !== 'running' || snapshot.transport.state !== 'online' || snapshot.klippy.state !== 'ready' || !Number.isFinite(temperature)) return
    const timestamp = Date.now()
    setHistory((points) => {
      if (timestamp - (points.at(-1)?.timestamp ?? 0) < 1000) return points
      return [...points.slice(-1799), { timestamp, current: temperature, target }]
    })
  }, [stage, temperature, target, snapshot.updatedAt, snapshot.transport.state, snapshot.klippy.state])

  useEffect(() => {
    if (stage !== 'running') return
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [stage])

  useEffect(() => {
    if (stage !== 'running') return
    if (!ready) {
      // После разрыва связи пропущенные циклы восстановить по температуре нельзя.
      setCycle(null)
      lastPidTarget.current = null
      return
    }
    if (liveTarget !== target && liveTarget !== target - 5) return
    if (lastPidTarget.current === target - 5 && liveTarget === target) {
      setCycle((value) => value === null ? null : value + 1)
    }
    lastPidTarget.current = liveTarget
    setPhase(liveTarget === target ? 'heating' : 'cooling')
  }, [stage, ready, liveTarget, target])

  useEffect(() => {
    if (stage !== 'saving') return
    if (!ready) restartSeen.current = true
    if (saveAccepted && restartSeen.current && ready) {
      savePending.current = false
      setStage('finish')
    }
  }, [stage, ready, saveAccepted])

  useEffect(() => {
    if (stage !== 'saving') return
    const timer = window.setTimeout(() => {
      savePending.current = false
      setError('Не удалось подтвердить сохранение и готовность Klipper. Проверьте журнал и состояние принтера перед повтором.')
      setStage('result')
    }, 90_000)
    return () => window.clearTimeout(timer)
  }, [stage])

  function applyCustomTemperature() {
    if (!draftValid) return
    setTarget(draftNumber)
    setTemperatureOpen(false)
  }

  function enterTemperatureDigit(digit: string) {
    const replace = replaceDraft.current
    replaceDraft.current = false
    setTemperatureDraft((value) => (replace ? digit : value + digit).slice(0, 3))
  }

  async function start() {
    if (block || busy.current) return
    busy.current = true
    const run = ++activeRun.current
    coefficients.current = null
    setResult(null)
    setError('')
    setStarting(true)
    try {
      // M106, отправленный после PID_CALIBRATE, ждёт окончания калибровки в очереди Klipper.
      if (fanPercent !== Math.round(snapshot.modelFanPercent) && !await executeCommand(fanArgs)) {
        setError('Не удалось установить обдув. PID-калибровка не запущена.')
        return
      }
      if (activeRun.current !== run) return
      setHistory(Number.isFinite(temperature) ? [{ timestamp: Date.now(), current: temperature, target }] : [])
      startedAt.current = Date.now()
      setElapsed(0)
      setCycle(1)
      setPhase('heating')
      lastPidTarget.current = null
      setStarting(false)
      setStage('running')
      const ok = await executeCommand(args)
      if (activeRun.current !== run) return
      if (ok && coefficients.current !== null) setStage('result')
      else {
        setError(ok ? 'Klipper ответил, но PID-коэффициенты не получены. Проверьте журнал принтера.' : 'Команда завершилась ошибкой или связь потеряна. Нагрев мог продолжиться; проверьте принтер перед повтором.')
        setStage('error')
      }
    } catch (cause) {
      if (activeRun.current !== run) return
      setError(cause instanceof Error ? cause.message : 'Ошибка калибровки. Проверьте состояние принтера.')
      setStage('error')
    } finally {
      if (activeRun.current === run) {
        busy.current = false
        setStarting(false)
      }
    }
  }

  async function stop() {
    if (getCommandBlockReason('emergencyStop') !== null) return
    if (await executeCommand({ command: 'emergencyStop' })) {
      ++activeRun.current
      busy.current = false
      setStarting(false)
      setStage('stopped')
    } else setError('Не удалось подтвердить остановку. Проверьте принтер.')
  }

  async function save() {
    if (saveBlock || savePending.current) return
    savePending.current = true
    restartSeen.current = false
    setSaveAccepted(false)
    setError('')
    setStage('saving')
    try {
      const ok = await executeCommand(saveArgs)
      if (!savePending.current) return
      if (!ok) throw new Error('Сохранение не подтверждено. Проверьте журнал принтера перед повтором.')
      setSaveAccepted(true)
    } catch (cause) {
      if (!savePending.current) return
      savePending.current = false
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить PID.')
      setStage('result')
    }
  }

  return (
    <article className="pid-workflow">
      <header className="pid-header">
        <button type="button" disabled={stage === 'running' || stage === 'saving' || isStarting} onClick={onBackToList}>К списку</button>
        <div><p>Калибровка / PID{snapshot.source === 'mock' ? ' / Симуляция' : ''}</p><h2>{nozzle ? 'Сопло' : 'Стол'} · {target} °C</h2></div>
        <span>ШАГ {STEP[stage]} / 5</span>
      </header>
      <ol className="pid-steps" aria-label="Этапы калибровки">
        {['Выбор', 'Подготовка', 'Калибровка', 'Результат', 'Сохранение'].map((label, index) => <li key={label} aria-current={STEP[stage] === index + 1 ? 'step' : undefined}>{String(index + 1).padStart(2, '0')} {label}</li>)}
      </ol>
      <main className={`pid-body${stage === 'running' ? ' is-running' : ''}`}>
        {stage !== 'running' && <h2>{TITLES[stage]}</h2>}
        {stage === 'select' && <>
          <div className="pid-options">{(['extruder', 'heater_bed'] as const).map((id) => <button type="button" key={id} aria-pressed={heater === id} onClick={() => { setHeater(id); setTarget(id === 'extruder' ? 200 : 60) }}><strong>{id === 'extruder' ? 'Сопло' : 'Стол'}</strong><span>{Math.round(id === 'extruder' ? snapshot.extruderTemp : snapshot.bedTemp)} °C сейчас</span></button>)}</div>
          <div className="pid-presets" role="group" aria-label="Температура калибровки">{(nozzle ? [180, 200, 220, 240] : [50, 60, 80, 100]).map((value) => <button type="button" key={value} disabled={value > maxTemperature} aria-pressed={target === value} onClick={() => setTarget(value)}>{value} °C</button>)}<button type="button" onClick={() => { setTemperatureDraft(String(target)); replaceDraft.current = true; setTemperatureOpen(true) }}>Своя температура</button></div>
          <p>Выберите температуру, которую обычно используете при печати.</p>
        </>}
        {stage === 'prepare' && <>
          <p>Освободите рабочую зону. Убедитесь, что термистор и нагреватель исправны.</p>
          <p>{nozzle ? 'Очистите сопло. Выберите обдув как при обычной печати.' : 'Установите рабочую поверхность и оставьте стол свободным.'}</p>
          <label className="pid-fan"><input type="checkbox" checked={fanEnabled} disabled={isStarting || getCommandBlockReason('setFanPercent', { command: 'setFanPercent', percent: fanEnabled ? 0 : 100 }) !== null} onChange={(event) => setFanEnabled(event.target.checked)} /><span>Включить обдув <small>100% во время калибровки</small></span></label>
          <p>Обдув установится перед нагревом до {target} °C и останется выбранным после калибровки. Не оставляйте принтер без наблюдения.</p>
        </>}
        {stage === 'running' && <>
          <section className="pid-readings" aria-label="Ход калибровки">
            <h2>{TITLES[stage]}</h2>
            <div className="pid-temperature"><span>{nozzle ? 'Сопло' : 'Стол'} сейчас</span><strong>{ready && Number.isFinite(temperature) ? temperature.toFixed(1) : '—'} <small>°C</small></strong><span>Цель {target} °C · обдув {Math.round(snapshot.modelFanPercent)}%</span></div>
            <dl className="pid-progress"><div><dt>Цикл PID</dt><dd>{cycle ?? '—'} / {PID_CYCLES}</dd></div><div><dt>Прошло времени</dt><dd>{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</dd></div></dl>
            <p role="status">{!ready ? 'Нет свежих данных. Проверьте принтер.' : `${phase === 'heating' ? 'Нагрев' : 'Остывание'} · минимум ${PID_CYCLES} циклов`}</p>
          </section>
          <section className="pid-graph-panel" aria-label="Температурный график">
            <div className="pid-chart" role="img" aria-label={`График температуры ${nozzle ? 'сопла' : 'стола'}, цель ${target} °C. Сплошная линия — температура, пунктир — цель.`}>
              <TemperatureTrendChart height={280} testId="pid-temperature-chart" series={[{ id: nozzle ? 'nozzle' : 'bed', label: nozzle ? 'Сопло' : 'Стол', tone: nozzle ? 'orange' : 'green', points: history }]} />
            </div>
            <p className="pid-chart-legend">Температура — сплошная · цель — пунктир</p>
          </section>
        </>}
        {stage === 'result' && <><div className="pid-result">{result}</div><p>Klipper подтвердил окончание калибровки {nozzle ? 'сопла' : 'стола'} при {target} °C.</p><p>Нажмите «Сохранить», чтобы записать коэффициенты и перезапустить Klipper.</p></>}
        {stage === 'saving' && <><div className="pid-result">{result}</div><p role="status">Сохраняем коэффициенты в printer.cfg. Ожидаем перезапуск и готовность Klipper…</p></>}
        {stage === 'finish' && <><div className="pid-result">{result}</div><p role="status">Коэффициенты сохранены. Klipper снова готов к работе.</p></>}
        {stage === 'error' && <p role="alert">{error}</p>}
        {stage === 'stopped' && <p role="status">Отправлена аварийная остановка. До новой калибровки проверьте принтер и перезапустите Klipper.</p>}
        {stage !== 'error' && error && <p role="alert">{error}</p>}
      </main>
      <footer className="pid-footer">
        {stage === 'running' ? <><span>Ожидаем подтверждение Klipper</span><button type="button" className="pid-danger" disabled={getCommandBlockReason('emergencyStop') !== null} onClick={() => void stop()}>Аварийная остановка</button></> : <>
          <button type="button" disabled={isStarting || stage === 'saving'} onClick={() => stage === 'select' || stage === 'finish' || stage === 'stopped' ? onBackToList() : setStage('select')}>{stage === 'select' || stage === 'finish' || stage === 'stopped' ? 'К списку' : 'Назад'}</button>
          {stage === 'select' && <button type="button" onClick={() => setStage('prepare')}>Далее →</button>}
          {stage === 'prepare' && <button type="button" disabled={block !== null || isStarting} onClick={() => void start()}>{isStarting ? 'Устанавливаем обдув…' : 'Запустить калибровку'}</button>}
          {stage === 'result' && <button type="button" disabled={saveBlock !== null} onClick={() => void save()}>Сохранить</button>}
          {stage === 'saving' && <button type="button" disabled>Сохранение…</button>}
          {stage === 'finish' && <button type="button" onClick={() => { setStage('select'); setResult(null) }}>Другой нагреватель</button>}
          {stage === 'error' && <button type="button" onClick={() => setStage('prepare')}>Проверить и повторить</button>}
        </>}
      </footer>
      {stage === 'prepare' && block && <p className="pid-block" role="status">{block}</p>}
      {stage === 'result' && saveBlock && <p className="pid-block" role="status">{saveBlock}</p>}
      {isTemperatureOpen && createPortal(<div className="pid-temperature-dialog tune-value-workspace is-keyboard-open" role="dialog" aria-modal="true" aria-label="Своя температура калибровки" ref={temperatureDialog}>
        <div className="pid-temperature-editor">
          <TuneValueEditor label={`${nozzle ? 'Сопло' : 'Стол'} · PID`} icon={nozzle ? 'metricNozzle' : 'metricBed'}>
            <label className="pid-temperature-field"><input aria-label="Температура калибровки, °C" aria-describedby="pid-temperature-limits" aria-invalid={!draftValid} type="text" inputMode="numeric" value={temperatureDraft} maxLength={3} onChange={(event) => { setTemperatureDraft(event.target.value); replaceDraft.current = false }} onKeyDown={(event) => { if (event.key === 'Enter') applyCustomTemperature() }} /><span>°C</span></label>
          </TuneValueEditor>
          <p id="pid-temperature-limits" role={draftValid ? undefined : 'status'}>Целое число от 1 до {maxTemperature} °C</p>
          <button type="button" onClick={() => setTemperatureOpen(false)}>Назад</button>
        </div>
        <NumericKeypad label="Температура PID" ariaLabel="Клавиатура температуры PID" closeLabel="Закрыть ввод температуры" value={temperatureDraft} showValue={false} showHeader={false} onDigit={enterTemperatureDigit} onClear={() => { setTemperatureDraft(''); replaceDraft.current = false }} onBackspace={() => { setTemperatureDraft((value) => value.slice(0, -1)); replaceDraft.current = false }} onSubmit={applyCustomTemperature} onClose={() => setTemperatureOpen(false)} />
      </div>, document.body)}
    </article>
  )
}
