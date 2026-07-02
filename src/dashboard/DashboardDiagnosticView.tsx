import type { ReactNode } from 'react'
import type { DashboardDiagnostic } from './dashboardDiagnosticState'
import './dashboardDiagnostic.css'

type DashboardDiagnosticViewProps = {
  diagnostic: DashboardDiagnostic
  statusDock: ReactNode
  isActionPending: boolean
  isActionArmed: boolean
  actionError: string | null
  onAction: () => void
}

export function DashboardDiagnosticView({
  diagnostic,
  statusDock,
  isActionPending,
  isActionArmed,
  actionError,
  onAction,
}: DashboardDiagnosticViewProps) {
  const isCommandAction = diagnostic.action.kind === 'command'
  const actionLabel = isActionPending
    ? isCommandAction ? 'Выполнение…' : 'Проверка…'
    : isCommandAction && isActionArmed
      ? `Подтвердить: ${diagnostic.action.label}`
      : diagnostic.action.label

  return (
    <section
      className={`dashboard-diagnostic-screen is-${diagnostic.severity}`}
      data-testid="screen-dashboard-diagnostic"
      role="alert"
      aria-live={diagnostic.severity === 'error' ? 'assertive' : 'polite'}
    >
      <div className="dashboard-diagnostic-main">
        <div className="dashboard-diagnostic-symbol" aria-hidden="true">!</div>
        <p className="dashboard-diagnostic-kicker">Диагностика</p>
        <h2>{diagnostic.title}</h2>
        <p className="dashboard-diagnostic-message" title={diagnostic.message}>
          {diagnostic.message}
        </p>

        <button
          type="button"
          className={`dashboard-diagnostic-action ${isActionArmed ? 'is-armed' : ''}`}
          onClick={onAction}
          disabled={isActionPending}
          data-testid="dashboard-diagnostic-action"
        >
          {actionLabel}
        </button>

        {isCommandAction && !isActionArmed && !isActionPending ? (
          <p className="dashboard-diagnostic-confirm-note">
            Действие потребует повторного нажатия.
          </p>
        ) : null}

        {actionError !== null ? (
          <p className="dashboard-diagnostic-action-error" role="status">
            {actionError}
          </p>
        ) : null}

        <div className="dashboard-diagnostic-status-dock">
          {statusDock}
        </div>
      </div>

      <aside className="dashboard-diagnostic-details" aria-label="Подробности диагностики">
        <header>
          <span>Состояние</span>
          <strong>{diagnostic.severity === 'error' ? 'Ошибка' : 'Предупреждение'}</strong>
        </header>

        {diagnostic.details.length > 0 ? (
          <ul>
            {diagnostic.details.map((detail) => (
              <li key={detail} title={detail}>{detail}</li>
            ))}
          </ul>
        ) : (
          <p>Дополнительных сведений нет.</p>
        )}
      </aside>
    </section>
  )
}
