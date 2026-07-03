import { memo, type CSSProperties } from 'react'
import type { MaintenanceControlPanelProps, MaintenanceIconName } from '../types'
import '../maintenance.css'

const HOURS_FORMATTER = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 1,
})

export const MaintenanceControlPanel = memo(function MaintenanceControlPanel({
  status,
  progressTicks,
  progressPercent,
}: MaintenanceControlPanelProps) {
  const safeProgressPercent = Math.max(0, Math.min(100, progressPercent))
  const progressTickDenominator = Math.max(1, progressTicks.length - 1)
  const runtimeHoursLabel = status.isRuntimeBacked ? `${HOURS_FORMATTER.format(status.runtimeHours)} ч` : '—'
  const hoursLeftLabel = status.isRuntimeBacked ? `${HOURS_FORMATTER.format(status.hoursLeft)} ч` : '—'
  const intervalHoursLabel = `${HOURS_FORMATTER.format(status.intervalHours)} ч`
  const progressStatusLabel = status.isRuntimeBacked
    ? status.hoursLeft > 0
      ? `До планового обслуживания осталось ${hoursLeftLabel}`
      : 'Плановое обслуживание требуется сейчас'
    : status.notice

  return (
    <div className="maintenance-overview">
      <section className="maintenance-overview-metrics" aria-label="Сводка технического обслуживания">
        <article
          className="maintenance-overview-metric control-subpanel"
          title={status.isRuntimeBacked ? undefined : status.notice}
        >
          <span className="maintenance-overview-icon" aria-hidden="true">
            <MaintenanceLineIcon name="runtime" />
          </span>
          <div className="maintenance-overview-metric-copy">
            <span className="maintenance-overview-metric-label">Общий пробег</span>
            <strong className="maintenance-overview-metric-value">{runtimeHoursLabel}</strong>
            {!status.isRuntimeBacked ? (
              <small data-testid="maintenance-runtime-notice">Данные Moonraker недоступны</small>
            ) : null}
          </div>
        </article>

        <article className="maintenance-overview-metric control-subpanel">
          <span className="maintenance-overview-icon" aria-hidden="true">
            <MaintenanceLineIcon name="due" />
          </span>
          <div className="maintenance-overview-metric-copy">
            <span className="maintenance-overview-metric-label">До планового ТО</span>
            <strong className="maintenance-overview-metric-value">{hoursLeftLabel}</strong>
            <small>Интервал {intervalHoursLabel}</small>
          </div>
        </article>

        <article
          className={`maintenance-overview-metric maintenance-overview-system is-${status.systemTone} control-subpanel`}
          title={status.systemNotice}
        >
          <span className="maintenance-overview-icon" aria-hidden="true">
            <MaintenanceLineIcon name="system" />
          </span>
          <div className="maintenance-overview-metric-copy">
            <span className="maintenance-overview-metric-label">Состояние системы</span>
            <strong className="maintenance-overview-metric-value">{status.systemLabel}</strong>
            <small>{status.systemNotice}</small>
          </div>
        </article>
      </section>

      <section
        className="maintenance-overview-progress control-subpanel"
        aria-label="Прогресс межсервисного интервала"
        style={
          {
            '--maintenance-progress': `${safeProgressPercent}%`,
          } as CSSProperties
        }
      >
        <header className="maintenance-overview-progress-head">
          <div>
            <p>Текущий цикл</p>
            <h3>Межсервисный интервал</h3>
          </div>
          <strong className="maintenance-overview-progress-percent">
            {status.isRuntimeBacked ? `${Math.round(safeProgressPercent)}%` : '—'}
          </strong>
        </header>

        <div className="maintenance-overview-progress-summary">
          <div>
            <strong className="maintenance-overview-progress-value">{runtimeHoursLabel}</strong>
            <span>из {intervalHoursLabel}</span>
          </div>
          <p>{progressStatusLabel}</p>
        </div>

        <div className="maintenance-overview-ruler" aria-hidden="true">
          <span className="maintenance-overview-track" />
          <span className="maintenance-overview-fill" />
          <span className="maintenance-overview-marker" />
          <span className="maintenance-overview-ticks">
            {progressTicks.map((tick, index) => {
              const isMajor = index === 0 || index === Math.floor(progressTicks.length / 2) || index === progressTicks.length - 1

              return (
                <span
                  key={tick}
                  className={isMajor ? 'is-major' : undefined}
                  style={
                    {
                      '--maintenance-tick-position': `${(index / progressTickDenominator) * 100}%`,
                    } as CSSProperties
                  }
                />
              )
            })}
          </span>
        </div>

        <div className="maintenance-overview-scale" aria-hidden="true">
          <span>0 ч</span>
          <span>{HOURS_FORMATTER.format(status.intervalHours / 2)} ч</span>
          <span>{intervalHoursLabel}</span>
        </div>
      </section>
    </div>
  )
})

function MaintenanceLineIcon({ name }: { name: MaintenanceIconName }) {
  if (name === 'runtime') {
    return (
      <svg className="maintenance-overview-line-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.2" />
        <path d="M12 7.9v4.5l3.1 2" />
      </svg>
    )
  }

  if (name === 'due') {
    return (
      <svg className="maintenance-overview-line-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.8 18.9 7.8v8.1L12 20 5.1 15.9V7.8L12 3.8Z" />
        <circle cx="12" cy="10" r="2.1" />
        <path d="M8.6 15.2c.8-1.6 1.9-2.4 3.4-2.4s2.6.8 3.4 2.4" />
      </svg>
    )
  }

  return (
    <svg className="maintenance-overview-line-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="4.5" width="14" height="6" rx="1.5" />
      <rect x="5" y="13.5" width="14" height="6" rx="1.5" />
      <path d="M8 7.5h.01M8 16.5h.01M11 7.5h5M11 16.5h5" />
    </svg>
  )
}
