import { useState } from 'react'
import type {
  DashboardDiagnostic,
  DashboardDiagnosticAction,
} from './dashboardDiagnosticState'
import './dashboardDiagnostic.css'

type DashboardDiagnosticViewProps = {
  diagnostic: DashboardDiagnostic
  isActionPending: boolean
  onAction: (action: DashboardDiagnosticAction) => Promise<string | null>
}

export function DashboardDiagnosticView({
  diagnostic,
  isActionPending,
  onAction,
}: DashboardDiagnosticViewProps) {
  const [armedDiagnosticId, setArmedDiagnosticId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const isCommandAction = diagnostic.action.kind === 'command'
  const isActionArmed = armedDiagnosticId === diagnostic.id
  const isPending = isActionPending || isSubmitting
  const actionLabel = isPending
    ? isCommandAction ? 'Выполнение…' : 'Проверка…'
    : isCommandAction && isActionArmed
      ? `Подтвердить: ${diagnostic.action.label}`
      : diagnostic.action.label

  async function handleAction(): Promise<void> {
    if (isPending) {
      return
    }

    setActionError(null)

    if (isCommandAction && !isActionArmed) {
      setArmedDiagnosticId(diagnostic.id)
      return
    }

    setArmedDiagnosticId(null)
    setIsSubmitting(true)
    try {
      setActionError(await onAction(diagnostic.action))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось выполнить действие.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className={`dashboard-diagnostic is-${diagnostic.severity}`}
      data-testid="dashboard-diagnostic"
      role="alert"
      aria-live={diagnostic.severity === 'error' ? 'assertive' : 'polite'}
    >
      <div className="dashboard-diagnostic-symbol" aria-hidden="true">!</div>
      <div className="dashboard-diagnostic-copy">
        <p className="dashboard-diagnostic-kicker">Диагностика</p>
        <h2>{diagnostic.title}</h2>
        <p className="dashboard-diagnostic-message" title={diagnostic.message}>
          {diagnostic.message}
        </p>
        {actionError !== null ? (
          <p className="dashboard-diagnostic-action-error" role="status">
            {actionError}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        className={`dashboard-diagnostic-action ${isActionArmed ? 'is-armed' : ''}`}
        onClick={() => void handleAction()}
        disabled={isPending}
        data-testid="dashboard-diagnostic-action"
      >
        {actionLabel}
      </button>
    </div>
  )
}
