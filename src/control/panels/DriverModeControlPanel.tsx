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
  onApply: (command: ModeCommand, mode: DriverMode) => Promise<boolean>
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
  const [submitting, setSubmitting] = useState(false)
  const [awaiting, setAwaiting] = useState(false)
  const [error, setError] = useState('')
  const pending = Boolean(controls.pendingCommands[domain] || controls.pendingCommands.system || controls.pendingCommands.critical || controls.isRestarting)
  const busy = submitting || awaiting || pending
  const reason = target ? controls.getCommandBlockReason(command, { command, mode: target }) : null
  const dialogStatus = status?.supported ? status : dialogStatusRef.current

  useEffect(() => {
    // Контекст окна переживает очистку snapshot при shutdown, но не разрешает применение.
    if (target && status?.supported) dialogStatusRef.current = status
  }, [status, target])

  useEffect(() => {
    if (!awaiting || submitting || pending) return
    if (status?.state === 'ready' && status.mode === target) {
      setAwaiting(false)
      setTarget(null)
      setError('')
    } else if (status?.state === 'fault' || controls.getLastCommandError()) {
      setAwaiting(false)
      setError(controls.getLastCommandError() || status?.message || 'Ошибка применения режима.')
    }
  }, [awaiting, submitting, pending, status, target, controls])

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
      const accepted = await controls.onApply(command, target)
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
    <div><strong>{title}</strong><p>Режим: {status.mode === 'quiet' ? 'тихий' : status.mode === 'normal' ? 'громкий' : 'неизвестен'}</p></div>
    <div className="driver-mode-actions">
      {(['quiet', 'normal'] as const).map(mode => <button key={mode} type="button" className="control-driver-mode-btn"
        aria-pressed={status.mode === mode} disabled={busy || status.mode === mode}
        onClick={event => { triggerRef.current = event.currentTarget; dialogStatusRef.current = status; setTarget(mode); setError('') }}>
        {mode === 'quiet' ? 'Тихий' : 'Громкий'}
      </button>)}
    </div>
    {status.state === 'fault' && <p role="alert">{status.message}</p>}
    </section>}
    {target && createPortal(<div className="driver-mode-overlay" onKeyDown={event => {
      if (event.key === 'Escape' && !busy) setTarget(null)
      if (event.key === 'Tab') {
        const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        if (!buttons?.length) { event.preventDefault(); return }
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }}>
      <section ref={dialogRef} className="driver-mode-dialog" role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <h2 id={headingId}>{title}: {target === 'quiet' ? 'тихий' : 'громкий'} режим</h2>
        <p>{kind === 'drivers'
          ? 'Изменится режим XYZ. Экструдер не затрагивается. Переключение доступно после завершения движения и печати.'
          : 'Изменится профиль скорости. Автоматическое включение и задержка выключения сохранятся.'}</p>
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
