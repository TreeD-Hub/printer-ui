import { useState } from 'react'
import { describeAutoPrinterReason, describeAutoPrinterState, type AutoPrinterActionType } from '@treed/printer-logic/autoprinter'
import type { AutoPrinterController } from '../core/store/useAutoPrinter'
import { useCurrentTime } from './useCurrentTime'
import { formatUiDateTime, useTimeZoneOffset } from '../ui/timeZone'

type AutoPrinterPanelProps = {
  controller: AutoPrinterController
  moonrakerConnected: boolean
  onOpenDashboard: () => void
}

type View = 'queue' | 'connection'

const PENDING_LABELS: Record<AutoPrinterActionType, string> = {
  pause_queue: 'Приостановка очереди',
  resume_queue: 'Продолжение очереди',
  stop_after_current: 'Остановка после текущего запуска',
  pause_current_print: 'Пауза печати',
  cancel_current_print: 'Отмена печати',
  recheck_bed: 'Проверка стола',
  cancel_package: 'Отмена оставшихся заданий',
}

function stateLabel(state: AutoPrinterController['availability'], stale: boolean): string {
  if (state === 'loading') return 'Загрузка'
  if (state === 'unsupported') return 'Не поддерживается'
  if (state === 'error' || stale) return 'Нет свежих данных'
  return 'Доступен'
}

function bedLabel(status: NonNullable<AutoPrinterController['status']>, now: number): string {
  const check = status.bed_check?.last_check
  if (check?.state === 'occupied') return 'Стол занят'
  if (check?.state === 'unavailable') return 'Проверка стола ещё не выполнялась'
  const checkedAt = check?.checked_at === null || check?.checked_at === undefined ? Number.NaN : Date.parse(check.checked_at)
  const checkIsFresh = Number.isFinite(checkedAt) && checkedAt <= now && now - checkedAt <= 30_000
  if (check?.state === 'empty' && status.capabilities?.bed_check === true && status.bed_check?.live_qualified === true && checkIsFresh) {
    return 'Стол свободен · квалифицировано'
  }
  return 'Состояние стола неизвестно'
}

function bedCheckedAt(status: NonNullable<AutoPrinterController['status']>, timezoneOffsetMinutes: number): string {
  const checkedAt = status.bed_check?.last_check?.checked_at
  return checkedAt ? `Проверено: ${formatUiDateTime(checkedAt, timezoneOffsetMinutes, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Время проверки неизвестно'
}

function resultLabel(state: NonNullable<AutoPrinterController['lastAction']>['state']): string {
  if (state === 'executed') return 'Действие подтверждено.'
  if (state === 'rejected') return 'Система отклонила действие.'
  return 'Результат действия пока неизвестен.'
}

export function AutoPrinterPanel({ controller, moonrakerConnected, onOpenDashboard }: AutoPrinterPanelProps) {
  const timezoneOffsetMinutes = useTimeZoneOffset()
  const [view, setView] = useState<View>('queue')
  const { status, availability, stale, error, pending, lastAction } = controller
  const isCurrent = availability === 'available' && !stale && status !== null
  const isManaged = isCurrent && status.enabled && status.configured && status.binding_state === 'paired' && status.unlink_pending !== true
  const hasSeriesHold = isCurrent && (status.hold !== null || status.recovery_required)
  const canControlLocalSeries = isCurrent && moonrakerConnected && status?.capabilities?.offline_packages_v1 === true
  const activeRun = status?.current_run_id === null || status?.current_run_id === undefined
    ? null
    : status.queue.find((run) => run.run_id === status.current_run_id) ?? null
  const upcomingRuns = status?.queue.filter((run) => run.run_id !== status.current_run_id && run.state === 'queued') ?? []
  const activeState = status?.run_state ?? activeRun?.state ?? null
  const activeStateKnown = status?.executionSnapshotAvailable === true
  const now = useCurrentTime()

  const run = (type: Exclude<AutoPrinterActionType, 'cancel_package'>) => { void controller.control(type) }
  const pendingLabel = pending === null
    ? null
    : pending.type === 'pairing'
      ? 'Получение кода привязки'
      : pending.type === 'account_unlink'
        ? 'Сохранение запроса на отвязку'
      : PENDING_LABELS[pending.type as AutoPrinterActionType]
  const pendingText = pendingLabel === null ? null : `${pendingLabel}…`
  const feedback = pendingText ?? (lastAction === null ? null : `${resultLabel(lastAction.state)}${lastAction.message ? ` ${lastAction.message}` : ''}`)

  return (
    <section className="autoprinter-panel" aria-labelledby="autoprinter-title" data-testid="autoprinter-panel">
      <header className="autoprinter-head">
        <h2 id="autoprinter-title">AutoPrinter</h2>
        <div className="autoprinter-switch" aria-label="Раздел AutoPrinter">
          <button type="button" aria-pressed={view === 'queue'} onClick={() => setView('queue')}>Очередь</button>
          <button type="button" aria-pressed={view === 'connection'} onClick={() => setView('connection')}>Связь</button>
        </div>
        {view === 'queue' && (status?.capabilities?.queue === true || activeState === 'printing') && (
          <div className="autoprinter-head-actions">
            {status?.capabilities?.queue === true && <button className="autoprinter-head-action" type="button" disabled={!isManaged || pending !== null || status.stop_after_current === true || status.queue_control === 'stop_after_current'} onClick={() => run('stop_after_current')}>
              {status.stop_after_current || status.queue_control === 'stop_after_current' ? 'Остановка включена' : 'Остановить после текущего'}
            </button>}
            {activeState === 'printing' && <button className="autoprinter-head-action" type="button" onClick={onOpenDashboard}>К печати</button>}
          </div>
        )}
      </header>

      <div className="autoprinter-status-grid">
        <div><span>Принтер</span><strong>{moonrakerConnected ? 'Подключён' : 'Нет связи'}</strong></div>
        <div><span>TreeD</span><strong>{!isCurrent ? status === null ? 'Нет данных' : 'Последние данные' : status.connection === 'online' || status.connection === 'connected' ? 'Подключён' : status.connection === 'offline' || status.connection === 'disconnected' ? 'Нет связи' : 'Нет данных'}</strong></div>
        <div><span>Стол</span><strong>{status === null || availability !== 'available' || stale ? 'Неизвестно' : bedLabel(status, now)}</strong></div>
      </div>

      {view === 'queue' ? (
        <div className="autoprinter-body">
          <div className="autoprinter-queue-content">
            <div className="autoprinter-current">
              <span>Сейчас</span>
              {status?.current_run_id && activeState && activeStateKnown ? (
                <><strong>{describeAutoPrinterState(activeState)}</strong><small>Запуск {status.current_run_id}</small></>
              ) : <strong>{isCurrent && activeStateKnown ? 'Нет текущего запуска' : isCurrent ? 'Состояние запуска недоступно' : stateLabel(availability, stale)}</strong>}
            </div>
            <div className="autoprinter-next">
            <div className="autoprinter-section-label"><span>Следующие</span><span>{status?.queueAvailable && isCurrent ? `Всего запусков: ${status.queue_total}` : '—'}</span></div>
            {!isCurrent ? (
              <p>{availability === 'unsupported' ? 'Эта версия системы не поддерживает AutoPrinter.' : error ?? 'Получаем состояние AutoPrinter.'}</p>
            ) : status?.enabled === false ? (
              <p>AutoPrinter выключен в системе.</p>
            ) : status?.configured === false ? (
              <p>AutoPrinter не настроен в системе.</p>
            ) : status?.binding_state !== 'paired' ? (
              <p>Устройство не привязано.</p>
            ) : !status.queueAvailable ? (
              <p>Список запусков недоступен в этой версии.</p>
            ) : status.queue_total === 0 ? (
              <p>В очереди нет запусков.</p>
            ) : upcomingRuns.length === 0 ? (
              <p>Следующих запусков нет.</p>
            ) : upcomingRuns.slice(0, 2).map((run, index) => (
              <div className="autoprinter-run" key={run.run_id}>
                <span>{index + 1}</span><strong>Запуск {run.run_id}</strong><small>{describeAutoPrinterState(run.state)}</small>
              </div>
            ))}
            {isCurrent && status?.queueAvailable && status.queue_truncated && <small>Список ограничен первыми 1000 запусками.</small>}
            {isCurrent && status.active_package && (
              <div className="autoprinter-package-info">
                <p>Локальный пакет v{status.active_package.version} · {status.active_package.state}</p>
                <p>Выполнено: {status.active_package.run_count} · Осталось: {status.active_package.remaining_count}</p>
                {(status.hold || status.recovery_required) && (
                  <p role="alert">{status.recovery_required ? 'Требуется восстановление очереди.' : 'Серия удерживается.'}{status.hold?.reason ? ` Причина: ${status.hold.reason}` : ''}</p>
                )}
                <button type="button" disabled={!canControlLocalSeries || pending !== null || status.active_package.remaining_count < 1}
                  onClick={() => { void controller.cancelRemaining() }}>
                  {pending?.type === 'cancel_package' ? 'Отменяем…' : 'Отменить оставшиеся задания'}
                </button>
              </div>
            )}
            {isCurrent && !status.active_package && (status.hold || status.recovery_required) && (
              <p role="alert">{status.recovery_required ? 'Требуется восстановление очереди.' : 'Очередь удерживается.'}{status.hold?.reason ? ` Причина: ${status.hold.reason}` : ''}</p>
            )}
            {hasSeriesHold && (
              <button className="autoprinter-local-resume" type="button" disabled={!canControlLocalSeries || pending !== null}
                onClick={() => run('resume_queue')}>
                {pending?.type === 'resume_queue' ? 'Продолжаем серию…' : 'Продолжить серию'}
              </button>
            )}
            </div>
          </div>
        </div>
      ) : (
        <div className="autoprinter-body autoprinter-connection">
          <p><span>Состояние системы</span><strong>{stateLabel(availability, stale)}</strong></p>
          <p><span>Управление очередью</span><strong>{!isCurrent ? 'Нет свежих данных' : isManaged ? 'Активно' : 'Не активно'}</strong></p>
          <p><span>Привязка</span><strong>{!isCurrent ? 'Последние данные: привязка неизвестна' : `${status?.binding_state === 'paired' ? 'Привязано' : status?.binding_state === 'revoked' ? 'Отозвана' : status?.binding_state === 'unpaired' ? 'Не привязано' : 'Нет данных'}${status?.unlink_pending ? ' · ожидает отвязки' : ''}`}</strong></p>
          <p><span>Стол</span><strong>{status === null || availability !== 'available' || stale ? 'Состояние стола неизвестно' : `${bedLabel(status, now)} · ${bedCheckedAt(status, timezoneOffsetMinutes)}`}</strong></p>
          <div className="autoprinter-inline-actions">
            <button type="button" disabled={!isCurrent || pending !== null || status?.capabilities?.bed_check_diagnostic !== true} onClick={() => run('recheck_bed')}>
              Повторить проверку стола
            </button>
          </div>
        </div>
      )}

      <footer className="autoprinter-footer">
        <p role={error || lastAction?.state === 'rejected' || lastAction?.state === 'uncertain' ? 'alert' : 'status'}>
          {pendingText ?? error ?? feedback ?? (status?.blocked_reason ? describeAutoPrinterReason(status.blocked_reason) : null) ?? (status?.local_pause ? 'Следующий запуск проверит условия старта.' : 'Текущая печать продолжится.')}
        </p>
        {!hasSeriesHold && <button type="button" disabled={!isManaged || pending !== null || status?.local_pause === null || status?.local_pause === undefined || !status?.capabilities?.queue} onClick={() => run(status?.local_pause ? 'resume_queue' : 'pause_queue')}>
          {pending?.type === 'pause_queue' ? 'Приостановка…' : pending?.type === 'resume_queue' ? 'Продолжение…' : status?.local_pause ? 'Продолжить очередь' : 'Приостановить очередь'}
        </button>}
      </footer>

    </section>
  )
}
