import { memo, type CSSProperties } from 'react'
import { IconMask } from '../../ui'
import type { MaintenanceControlPanelProps, MaintenanceIconName } from '../types'

export const MaintenanceControlPanel = memo(function MaintenanceControlPanel({
  status,
  historyItems,
  checklistItems,
  progressTicks,
  progressPercent,
  checklistState,
  isChecklistComplete,
  onChecklistItemChange,
  onChecklistComplete,
}: MaintenanceControlPanelProps) {
  const runtimeHoursLabel = status.isRuntimeBacked ? `${status.runtimeHours} ч` : '—'
  const hoursLeftLabel = status.isRuntimeBacked ? `${status.hoursLeft} ч` : '—'
  const intervalHoursLabel = status.isRuntimeBacked ? `${status.intervalHours} ч` : '—'
  const nextActionLabel = status.isRuntimeBacked
    ? `Рекомендуется через ${status.hoursLeft} ч`
    : 'Runtime ТО не подключен'

  return (
    <div className="control-maintenance-grid">
      {!status.isRuntimeBacked ? (
        <p className="control-maintenance-runtime-notice" data-testid="maintenance-runtime-notice">
          {status.notice}
        </p>
      ) : null}

      <section className="control-maintenance-metrics" aria-label="Сводка технического обслуживания">
        <article className="control-maintenance-panel control-maintenance-metric-card control-subpanel">
          <span className="control-maintenance-icon-box" aria-hidden="true">
            <MaintenanceLineIcon name="runtime" />
          </span>
          <p>
            <span>Пробег</span>
            <strong>{runtimeHoursLabel}</strong>
          </p>
        </article>

        <article className="control-maintenance-panel control-maintenance-metric-card control-subpanel">
          <span className="control-maintenance-icon-box" aria-hidden="true">
            <MaintenanceLineIcon name="due" />
          </span>
          <p>
            <span>До Т.О</span>
            <strong>{hoursLeftLabel}</strong>
          </p>
        </article>

        <article className="control-maintenance-panel control-maintenance-metric-card control-subpanel">
          <span className="control-maintenance-icon-box" aria-hidden="true">
            <MaintenanceLineIcon name="interval" />
          </span>
          <p>
            <span>Интервал ТО</span>
            <strong>{intervalHoursLabel}</strong>
          </p>
        </article>
      </section>

      <section
        className="control-maintenance-panel control-maintenance-progress-panel control-subpanel"
        aria-label="Прогресс межсервисного интервала"
        style={
          {
            '--maintenance-progress': `${progressPercent}%`,
          } as CSSProperties
        }
      >
        <h3>Прогресс межсервисного интервала</h3>
        <div className="control-maintenance-progress-ruler" aria-hidden="true">
          <span className="control-maintenance-progress-line" />
          <span className="control-maintenance-progress-fill" />
          <span className="control-maintenance-progress-marker">
            <span>{runtimeHoursLabel}</span>
          </span>
          <span className="control-maintenance-progress-ticks">
            {progressTicks.map((tick) => (
              <span
                key={tick}
                className={tick === 0 || tick === 15 || tick === 30 ? 'is-major' : undefined}
                style={
                  {
                    '--maintenance-tick-position': `${(tick / (progressTicks.length - 1)) * 100}%`,
                  } as CSSProperties
                }
              />
            ))}
          </span>
          <span className="control-maintenance-progress-labels">
            <span>0</span>
            <span>500</span>
            <span>{intervalHoursLabel}</span>
          </span>
        </div>
      </section>

      <aside className="control-maintenance-panel control-maintenance-checklist control-subpanel" aria-label="Чек-лист ТО">
        <h3>Чек-лист ТО</h3>
        <div className="control-maintenance-checklist-list">
          {checklistItems.map((item) => {
            const isChecked = checklistState[item.id] ?? false

            return (
              <label
                key={item.id}
                className={`control-maintenance-check-row${isChecked ? ' is-checked' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(event) => onChecklistItemChange(item.id, event.currentTarget.checked)}
                />
                <span className="control-maintenance-check-box" aria-hidden="true" />
                <span className="control-maintenance-check-label">{item.label}</span>
                <span className="control-maintenance-info-icon" aria-hidden="true">i</span>
              </label>
            )
          })}
        </div>
        <button
          type="button"
          className="control-maintenance-complete-btn"
          onClick={onChecklistComplete}
          disabled={isChecklistComplete}
        >
          <span aria-hidden="true" />
          Отметить все выполненные
        </button>
      </aside>

      <div className="control-maintenance-bottom">
        <section className="control-maintenance-panel control-maintenance-history control-subpanel" aria-label="История ТО">
          <h3>История ТО</h3>
          {historyItems.map((item) => (
            <button key={item.id} type="button" className="control-maintenance-history-row control-subpanel">
              <span className="control-maintenance-history-dot" aria-hidden="true" />
              <span>#{item.id}</span>
              <span>{item.date}</span>
              <span>{item.runtimeHours} ч</span>
              <strong>{item.label}</strong>
              <IconMask name="utilityChevron" size={18} className="control-maintenance-chevron" />
            </button>
          ))}
        </section>

        <section className="control-maintenance-panel control-maintenance-next control-subpanel" aria-label="Следующее действие ТО">
          <h3>
            Следующее действие
            <span aria-hidden="true" />
          </h3>
          <button type="button" className="control-maintenance-next-row control-subpanel">
            <span className="control-maintenance-icon-box" aria-hidden="true">
              <MaintenanceLineIcon name="wrench" />
            </span>
            <span className="control-maintenance-next-copy">
              <strong>Плановое ТО</strong>
              <span>{nextActionLabel}</span>
            </span>
            <IconMask name="utilityChevron" size={18} className="control-maintenance-chevron" />
          </button>
        </section>
      </div>
    </div>
  )
})

function MaintenanceLineIcon({ name }: { name: MaintenanceIconName }) {
  if (name === 'runtime') {
    return (
      <svg className="control-maintenance-line-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.2" />
        <path d="M12 7.9v4.5l3.1 2" />
      </svg>
    )
  }

  if (name === 'due') {
    return (
      <svg className="control-maintenance-line-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.8 18.9 7.8v8.1L12 20 5.1 15.9V7.8L12 3.8Z" />
        <circle cx="12" cy="10" r="2.1" />
        <path d="M8.6 15.2c.8-1.6 1.9-2.4 3.4-2.4s2.6.8 3.4 2.4" />
      </svg>
    )
  }

  if (name === 'interval') {
    return (
      <svg className="control-maintenance-line-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18.2 8.4A7 7 0 0 0 6 7.5" />
        <path d="M18.2 4.7v3.7h-3.7" />
        <path d="M5.8 15.6A7 7 0 0 0 18 16.5" />
        <path d="M5.8 19.3v-3.7h3.7" />
      </svg>
    )
  }

  return (
    <svg className="control-maintenance-line-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.9 6.2a4.4 4.4 0 0 0-5.2 5.2L4.6 16.5a2.1 2.1 0 0 0 3 3l5.1-5.1a4.4 4.4 0 0 0 5.2-5.2l-3 3-2.1-2.1 3-3Z" />
    </svg>
  )
}
