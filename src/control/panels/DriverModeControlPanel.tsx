import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DriverMode, DriverModeSnapshot } from '@treed/printer-logic'
import type { ExecuteCommandArgs, PrinterCommandId, PrinterPendingCommands } from '../../core/commands'
import './DriverModeControlPanel.css'

type ModeCommand = 'setDriverMode' | 'setDriverFanMode'
export type DriverControlsProps = {
  mode?: DriverModeSnapshot
  fanMode?: DriverModeSnapshot
  pendingCommands: PrinterPendingCommands
  isRestarting?: boolean
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
  getLastCommandError: () => string
  onApply: (command: ModeCommand, mode: DriverMode, percent?: number) => Promise<boolean>
  onRestart: () => Promise<boolean>
}

export function DriverModeControlPanel({ controls, kind }: {
  controls: DriverControlsProps
  kind: 'drivers' | 'fan'
}) {
  const status = kind === 'drivers' ? controls.mode : controls.fanMode
  const command: ModeCommand = kind === 'drivers' ? 'setDriverMode' : 'setDriverFanMode'
  const domain = kind === 'drivers' ? 'motion' : 'fan'
  const title = kind === 'drivers' ? 'Драйверы XYZ' : 'Обдув драйверов'
  const headingId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogStatusRef = useRef<DriverModeSnapshot | null>(null)
  const [target, setTarget] = useState<DriverMode | null>(null)
  const [targetPower, setTargetPower] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [awaiting, setAwaiting] = useState(false)
  const [error, setError] = useState('')
  const pending = Boolean(controls.pendingCommands[domain] || controls.pendingCommands.system || controls.pendingCommands.critical || controls.isRestarting)
  const busy = submitting || awaiting || pending
  const reason = target ? controls.getCommandBlockReason(command, command === 'setDriverFanMode'
    ? { command, mode: target, percent: targetPower ?? undefined } : { command, mode: target }) : null
  const dialogStatus = status?.supported ? status : dialogStatusRef.current
  const minPower = status?.minPowerPercent ?? 100
  const maxPower = status?.maxPowerPercent ?? 100
  const powerEditable = kind === 'fan' && status?.powerControlSupported === true && minPower < maxPower
  const loadLabel: Record<string, string> = {
    idle: 'Нет нагрузки', manual_delay: 'Короткое ручное перемещение', motor_timeout: 'Длительное включение XYZ',
    preparing: 'Подготовка печати', printing: 'Печать', paused: 'Удержание на паузе',
    calibrating: 'Калибровка', auto_remove: 'Автосъём', cooldown: 'Охлаждение после нагрузки',
    unknown_state: 'Защитный обдув',
  }

  useEffect(() => {
    // Контекст окна переживает очистку snapshot при shutdown, но не разрешает применение.
    if (target && status?.supported) dialogStatusRef.current = status
  }, [status, target])

  useEffect(() => {
    if (!awaiting || submitting || pending) return
    if (status?.state === 'ready' && status.mode === target
      && (targetPower === null || status.activePercent === targetPower)) {
      setAwaiting(false)
      setTarget(null)
      setError('')
    } else if (status?.state === 'fault' || controls.getLastCommandError()) {
      setAwaiting(false)
      setError(controls.getLastCommandError() || status?.message || 'Ошибка применения режима.')
    }
  }, [awaiting, submitting, pending, status, target, targetPower, controls])

  useEffect(() => {
    if (!awaiting) return
    const timeout = window.setTimeout(() => {
      setAwaiting(false)
      setError('Подтверждение режима не получено. Проверьте соединение и повторите применение.')
    }, 13000)
    return () => window.clearTimeout(timeout)
  }, [awaiting])

  useEffect(() => {
    if (!target) return
    const previousFocus = triggerRef.current
    return () => previousFocus?.focus()
  }, [target])

  if (!status?.supported && target === null) return null
  const apply = async () => {
    if (!target || busy || reason || !status?.supported || status.state !== 'ready'
      || !status.availableModes.includes(target)) return
    setSubmitting(true)
    setError('')
    try {
      const accepted = targetPower === null ? await controls.onApply(command, target)
        : await controls.onApply(command, target, targetPower)
      if (accepted) setAwaiting(true)
      else setError(controls.getLastCommandError() || 'Не удалось применить режим.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось применить режим.')
    } finally {
      setSubmitting(false)
    }
  }
  const restart = async () => {
    if (busy || !dialogStatus?.needsRestart || controls.getCommandBlockReason('firmwareRestart')) return
    setSubmitting(true)
    setError('')
    try {
      if (!await controls.onRestart()) setError(controls.getLastCommandError() || 'Не удалось перезапустить Klipper.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось перезапустить Klipper.')
    } finally {
      setSubmitting(false)
    }
  }

  return <>
    {status?.supported && <section className="control-card driver-mode-card" aria-label={title}>
    <div><strong>{title}</strong><p>Режим: {status.mode === 'quiet' ? 'тихий' : status.mode === 'normal' ? (kind === 'fan' ? 'обычный' : 'громкий') : 'неизвестен'}</p>
      {kind === 'fan' && <>
        <p>Сейчас: {status.speedPercent ?? '—'}% · При нагрузке: {status.activePercent ?? '—'}%</p>
        {status.loadReason && <p>{loadLabel[status.loadReason] ?? 'Состояние нагрузки неизвестно'}</p>}
      </>}
    </div>
    <div className="driver-mode-actions">
      {(['quiet', 'normal'] as const).filter(mode => kind !== 'fan' || status.availableModes.includes(mode)).map(mode => <button key={mode} type="button" className="control-driver-mode-btn"
        aria-pressed={status.mode === mode} disabled={busy || status.mode === mode}
        onClick={event => { triggerRef.current = event.currentTarget; dialogStatusRef.current = status; setTargetPower(null); setTarget(mode); setError('') }}>
        {mode === 'quiet' ? 'Тихий' : kind === 'fan' ? 'Обычный' : 'Громкий'}
      </button>)}
      {kind === 'fan' && status.powerControlSupported && <button type="button" disabled={busy || !powerEditable || status.state !== 'ready'}
        onClick={event => {
          triggerRef.current = event.currentTarget; dialogStatusRef.current = status
          setTargetPower(Math.max(minPower, Math.min(maxPower, status.activePercent ?? maxPower)))
          setTarget(status.mode ?? 'normal'); setError('')
        }}>Мощность</button>}
    </div>
    {kind === 'fan' && status.powerControlSupported && !powerEditable && <p className="driver-mode-hint">Устройство разрешает только фиксированную мощность обдува.</p>}
    {status.state === 'fault' && <p role="alert">{status.message}</p>}
    </section>}
    {target && createPortal(<div className="driver-mode-overlay" onKeyDown={event => {
      if (event.key === 'Escape' && !busy) setTarget(null)
      if (event.key === 'Tab') {
        const buttons = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
        if (!buttons?.length) { event.preventDefault(); return }
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }}>
      <section ref={dialogRef} className="driver-mode-dialog" role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <h2 id={headingId}>{targetPower === null ? `${title}: ${target === 'quiet' ? 'тихий' : kind === 'fan' ? 'обычный' : 'громкий'} режим` : 'Мощность обдува при нагрузке'}</h2>
        <p>{kind === 'drivers'
          ? 'Изменится режим XYZ. Экструдер не затрагивается. Переключение доступно после завершения движения и печати.'
          : 'Обдув включается при нагрузке или длительном удержании XYZ. После нагрузки вентилятор продолжает охлаждать драйверы.'}</p>
        {targetPower !== null && <div className="driver-fan-power-editor">
          <label htmlFor={`${headingId}-power`}>Мощность при нагрузке: {targetPower}%</label>
          <div>
            <button type="button" aria-label="Уменьшить мощность обдува" disabled={busy || !powerEditable || targetPower <= minPower}
              onClick={() => setTargetPower(Math.max(minPower, targetPower - 5))}>−</button>
            <input id={`${headingId}-power`} type="range" min={minPower} max={maxPower} step={1}
              value={targetPower} disabled={busy || !powerEditable} onChange={event => setTargetPower(Number(event.target.value))} />
            <button type="button" aria-label="Увеличить мощность обдува" disabled={busy || !powerEditable || targetPower >= maxPower}
              onClick={() => setTargetPower(Math.min(maxPower, targetPower + 5))}>+</button>
          </div>
          <p>Диапазон устройства: {minPower}–{maxPower}%. Настройка не включает вентилятор без нагрузки.</p>
        </div>}
        <p>Настройка сохранится. Обычно применяется без перезапуска Klipper.</p>
        {(error || dialogStatus?.message || reason) && <p role="alert">{error || dialogStatus?.message || reason}</p>}
        {!status?.supported && <p role="status">Текущее состояние принтера недоступно. Выбранный режим сохранён в окне; применение заблокировано до восстановления состояния.</p>}
        {busy && <p role="status">Ожидание подтверждения принтера…</p>}
        <div className="driver-mode-actions">
          <button autoFocus type="button" disabled={busy} onClick={() => setTarget(null)}>Отмена</button>
          {dialogStatus?.needsRestart ? <button type="button" disabled={busy || Boolean(controls.getCommandBlockReason('firmwareRestart'))}
            onClick={() => void restart()}>Перезапустить Klipper</button>
            : <button type="button" disabled={busy || Boolean(reason) || !status?.supported || status.state !== 'ready' || !status.availableModes.includes(target)}
              onClick={() => void apply()}>Применить</button>}
        </div>
      </section>
    </div>, document.body)}
  </>
}
