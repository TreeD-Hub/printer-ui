import { DashboardIdleTemperatureWidgetContent } from './DashboardTemperatureWidgets'
import { DashboardDiagnosticView } from './DashboardDiagnosticView'
import type { DashboardIdleViewProps } from './DashboardPage.types'

export function DashboardIdleView({
  statusDock,
  logoSrc,
  idleHeroStatusLabel,
  idleWidgetOrder,
  armedIdleWidgetId,
  draggingIdleWidgetId,
  idleWidgetRefs,
  maintenanceSummary,
  idleNotesInputRef,
  idleNotesText,
  diagnostic,
  pendingCommand,
  onIdleWidgetTargetOpen,
  onIdleWidgetDragPointerDown,
  onIdleWidgetDragPointerMove,
  onIdleWidgetDragPointerEnd,
  onIdleWidgetDragHandleClick,
  onIdleNotesKeyboardOpen,
  onIdleNotesChange,
  onDiagnosticAction,
}: DashboardIdleViewProps) {
  const maintenanceRuntimeLabel = maintenanceSummary.isRuntimeBacked
    ? `${maintenanceSummary.runtimeHours} ч`
    : '—'
  const maintenanceDueLabel = maintenanceSummary.isRuntimeBacked
    ? `${maintenanceSummary.hoursLeft} ч`
    : '—'

  return (
    <section className="dashboard-idle-screen" data-testid="screen-dashboard-idle">
      <div className="dashboard-idle-hero">
        {statusDock}
        {diagnostic === null ? (
          <>
            <div className="dashboard-idle-logo" aria-hidden="true">
              <img className="dashboard-idle-logo-image" src={logoSrc} alt="" />
            </div>
            <p className="dashboard-idle-title">{idleHeroStatusLabel}</p>
          </>
        ) : (
          <DashboardDiagnosticView
            key={diagnostic.id}
            diagnostic={diagnostic}
            isActionPending={
              diagnostic.action.kind === 'command' &&
              pendingCommand === diagnostic.action.command
            }
            onAction={onDiagnosticAction}
          />
        )}
      </div>

      <aside className="dashboard-idle-sidebar">
        {idleWidgetOrder.map((widgetId) => {
          const isTemperatureWidget = widgetId === 'temperature'
          const isArmed = armedIdleWidgetId === widgetId
          const isDragging = draggingIdleWidgetId === widgetId

          return (
            <article
              key={widgetId}
              ref={(node) => {
                idleWidgetRefs.current[widgetId] = node
              }}
              className={[
                'idle-mini-widget',
                isTemperatureWidget ? 'idle-mini-widget-temps' : 'idle-mini-widget-service',
                isArmed ? 'is-arming' : '',
                isDragging ? 'is-dragging' : '',
              ].filter(Boolean).join(' ')}
            >
              <button
                type="button"
                className="idle-mini-widget-nav"
                data-testid={`idle-widget-${widgetId}`}
                aria-label={isTemperatureWidget ? 'Открыть управление нагревом' : 'Открыть раздел Т.О'}
                onClick={() => onIdleWidgetTargetOpen(widgetId)}
              >
                {isTemperatureWidget ? (
                  <DashboardIdleTemperatureWidgetContent />
                ) : (
                  <>
                    <div className="idle-maintenance-head">
                      <p className="idle-mini-label idle-maintenance-label">
                        <span>Т.О</span>
                        <span className={`idle-maintenance-status is-${maintenanceSummary.systemTone}`}>
                          {maintenanceSummary.systemLabel}
                        </span>
                      </p>
                      {maintenanceSummary.systemTone !== 'ok' ? (
                        <p className="idle-maintenance-notice" title={maintenanceSummary.systemNotice}>
                          {maintenanceSummary.systemNotice}
                        </p>
                      ) : null}
                    </div>
                    <div className="idle-service-metrics">
                      <p><span>Пробег</span><strong>{maintenanceRuntimeLabel}</strong></p>
                      <p><span>До Т.О</span><strong>{maintenanceDueLabel}</strong></p>
                    </div>
                  </>
                )}
              </button>

              <button
                type="button"
                className="idle-widget-drag-handle"
                data-testid={`idle-widget-${widgetId}-drag-handle`}
                aria-label={isTemperatureWidget ? 'Переместить виджет температуры' : 'Переместить виджет Т.О'}
                onPointerDown={(event) => onIdleWidgetDragPointerDown(event, widgetId)}
                onPointerMove={(event) => onIdleWidgetDragPointerMove(event, widgetId)}
                onPointerUp={onIdleWidgetDragPointerEnd}
                onPointerCancel={onIdleWidgetDragPointerEnd}
                onClick={onIdleWidgetDragHandleClick}
              >
                <span className="idle-widget-drag-handle-mark" aria-hidden="true" />
              </button>
            </article>
          )
        })}

        <article className="dashboard-idle-notes" aria-label="Заметки">
          <h3>Заметки</h3>
          <textarea
            ref={idleNotesInputRef}
            className="settings-console-input dashboard-idle-notes-input"
            value={idleNotesText}
            onFocus={onIdleNotesKeyboardOpen}
            onChange={onIdleNotesChange}
            placeholder="Введите заметку..."
            aria-label="Текст заметки"
            spellCheck={false}
            data-testid="idle-notes-input"
          />
        </article>
      </aside>
    </section>
  )
}
