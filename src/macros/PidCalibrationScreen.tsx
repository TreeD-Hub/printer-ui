import { useEffect, useRef, useState } from 'react'
import type { MacrosContainerProps } from './MacrosContainer'
import { subscribePrinterGcodeResponses } from '../core/store/printerNotifications'
import './pidCalibration.css'

type Stage = 'select' | 'prepare' | 'running' | 'result' | 'finish' | 'error' | 'stopped'
const TITLES: Record<Stage, string> = {
  select: 'Выберите нагреватель', prepare: 'Подготовьте принтер', running: 'Калибровка выполняется',
  result: 'Коэффициенты рассчитаны', finish: 'Сохранение результата',
  error: 'Результат не подтверждён', stopped: 'Калибровка прервана',
}
const STEP: Record<Stage, number> = { select: 1, prepare: 2, running: 3, result: 4, finish: 5, error: 3, stopped: 3 }

export function PidCalibrationScreen({ snapshot, pendingCommand, executeCommand, getCommandBlockReason, onBackToList }: MacrosContainerProps & { onBackToList: () => void }) {
  const [stage, setStage] = useState<Stage>('select')
  const [heater, setHeater] = useState<'extruder' | 'heater_bed'>('extruder')
  const [target, setTarget] = useState(200)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState('')
  const activeRun = useRef(0)
  const coefficients = useRef<string | null>(null)
  const busy = useRef(false)
  const nozzle = heater === 'extruder'
  const temperature = nozzle ? snapshot.extruderTemp : snapshot.bedTemp
  const args = { command: 'consoleGcode' as const, script: `PID_CALIBRATE HEATER=${heater} TARGET=${target}` }
  const block = ['printing', 'paused'].includes(snapshot.printJob.state)
    ? 'Завершите печать перед калибровкой.'
    : snapshot.transport.state !== 'online' || snapshot.klippy.state !== 'ready'
      ? 'Нужно подключение к готовому принтеру.'
      : pendingCommand !== null ? 'Дождитесь завершения другой команды.'
        : target >= (nozzle ? snapshot.limits.nozzleMaxC : snapshot.limits.bedMaxC)
          ? 'Температура должна быть ниже предела нагревателя.'
          : getCommandBlockReason('consoleGcode', args) ?? getCommandBlockReason(nozzle ? 'setNozzleTarget' : 'setBedTarget', { command: nozzle ? 'setNozzleTarget' : 'setBedTarget', targetCelsius: target })

  useEffect(() => subscribePrinterGcodeResponses((message) => {
    if (!busy.current) return
    const match = message.match(/pid_Kp[=:]\s*([\d.]+)\s+pid_Ki[=:]\s*([\d.]+)\s+pid_Kd[=:]\s*([\d.]+)/i)
    if (match) {
      coefficients.current = `Kp ${match[1]} · Ki ${match[2]} · Kd ${match[3]}`
      setResult(coefficients.current)
    }
  }), [])

  useEffect(() => {
    if (stage !== 'running') return
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [stage])

  async function start() {
    if (block || busy.current) return
    busy.current = true
    const run = ++activeRun.current
    coefficients.current = null
    setResult(null)
    setElapsed(0)
    setError('')
    setStage('running')
    try {
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
      if (activeRun.current === run) busy.current = false
    }
  }

  async function stop() {
    if (getCommandBlockReason('emergencyStop') !== null) return
    if (await executeCommand({ command: 'emergencyStop' })) {
      ++activeRun.current
      busy.current = false
      setStage('stopped')
    } else setError('Не удалось подтвердить остановку. Проверьте принтер.')
  }

  return (
    <article className="pid-workflow">
      <header className="pid-header">
        <button type="button" disabled={stage === 'running'} onClick={onBackToList}>К списку</button>
        <div><p>Калибровка / PID{snapshot.source === 'mock' ? ' / Симуляция' : ''}</p><h2>{nozzle ? 'Сопло' : 'Стол'} · {target} °C</h2></div>
        <span>ШАГ {STEP[stage]} / 5</span>
      </header>
      <ol className="pid-steps" aria-label="Этапы калибровки">
        {['Выбор', 'Подготовка', 'Калибровка', 'Результат', 'Сохранение'].map((label, index) => <li key={label} aria-current={STEP[stage] === index + 1 ? 'step' : undefined}>{String(index + 1).padStart(2, '0')} {label}</li>)}
      </ol>
      <main className="pid-body">
        <h2>{TITLES[stage]}</h2>
        {stage === 'select' && <>
          <div className="pid-options">{(['extruder', 'heater_bed'] as const).map((id) => <button type="button" key={id} aria-pressed={heater === id} onClick={() => { setHeater(id); setTarget(id === 'extruder' ? 200 : 60) }}><strong>{id === 'extruder' ? 'Сопло' : 'Стол'}</strong><span>{Math.round(id === 'extruder' ? snapshot.extruderTemp : snapshot.bedTemp)} °C сейчас</span></button>)}</div>
          <div className="pid-presets" role="group" aria-label="Температура калибровки">{(nozzle ? [180, 200, 220, 240] : [50, 60, 80, 100]).map((value) => <button type="button" key={value} aria-pressed={target === value} onClick={() => setTarget(value)}>{value} °C</button>)}</div>
          <p>Выберите температуру, которую обычно используете при печати.</p>
        </>}
        {stage === 'prepare' && <>
          <p>Освободите рабочую зону. Убедитесь, что термистор и нагреватель исправны.</p>
          <p>{nozzle ? 'Очистите сопло. Установите обдув модели как при обычной печати.' : 'Установите рабочую поверхность и оставьте стол свободным.'}</p>
          <p>Принтер нагреет {nozzle ? 'сопло' : 'стол'} до {target} °C и выполнит несколько циклов нагрева. Не оставляйте его без наблюдения.</p>
        </>}
        {stage === 'running' && <>
          <div className="pid-readings"><div><strong>{temperature.toFixed(1)} °C</strong><span>Температура · цель {target} °C</span></div><div><strong>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</strong><span>Время ожидания</span></div></div>
          <progress aria-label="Ожидание PID-калибровки" />
          <p role="status">{snapshot.transport.state !== 'online' ? 'Связь потеряна. Нагрев мог продолжиться — проверьте принтер.' : 'Klipper выполняет циклы нагрева и рассчитывает PID. Обычно это занимает несколько минут.'}</p>
          <p>Аварийная остановка отключит нагрев и остановит Klipper; затем потребуется его перезапуск.</p>
        </>}
        {stage === 'result' && <><div className="pid-result">{result}</div><p>Klipper подтвердил окончание калибровки {nozzle ? 'сопла' : 'стола'} при {target} °C.</p><p>Коэффициенты ещё не сохранены в профиль. Перейдите к инструкции сохранения.</p></>}
        {stage === 'finish' && <><div className="pid-result">{result}</div><p>Перенесите Kp, Ki и Kd в секцию [{heater}] файла <strong>{nozzle ? 'ebb42_can.cfg' : 'bed_heater_dc.cfg'}</strong>.</p><p>В этом профиле PID находится в подключаемых файлах. Автоматическое SAVE_CONFIG может конфликтовать с ними. После переноса перезапустите Klipper и проверьте нагрев.</p><p>Менеджер не меняет файлы профиля. Результат рассчитан, сохранение выполняется отдельно.</p></>}
        {stage === 'error' && <p role="alert">{error}</p>}
        {stage === 'stopped' && <p role="status">Отправлена аварийная остановка. До новой калибровки проверьте принтер и перезапустите Klipper.</p>}
        {stage !== 'error' && error && <p role="alert">{error}</p>}
      </main>
      <footer className="pid-footer">
        {stage === 'running' ? <><span>Ожидаем подтверждение Klipper</span><button type="button" className="pid-danger" disabled={getCommandBlockReason('emergencyStop') !== null} onClick={() => void stop()}>Аварийная остановка</button></> : <>
          <button type="button" onClick={() => stage === 'select' || stage === 'finish' || stage === 'stopped' ? onBackToList() : setStage('select')}>{stage === 'select' || stage === 'finish' || stage === 'stopped' ? 'К списку' : 'Назад'}</button>
          {stage === 'select' && <button type="button" onClick={() => setStage('prepare')}>Далее →</button>}
          {stage === 'prepare' && <button type="button" disabled={block !== null} onClick={() => void start()}>Запустить калибровку</button>}
          {stage === 'result' && <button type="button" onClick={() => setStage('finish')}>Как сохранить →</button>}
          {stage === 'finish' && <button type="button" onClick={() => { setStage('select'); setResult(null) }}>Другой нагреватель</button>}
          {stage === 'error' && <button type="button" onClick={() => setStage('prepare')}>Проверить и повторить</button>}
        </>}
      </footer>
      {stage === 'prepare' && block && <p className="pid-block" role="status">{block}</p>}
    </article>
  )
}
