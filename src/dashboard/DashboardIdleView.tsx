import { DashboardIdleTemperatureWidgetContent } from './DashboardTemperatureWidgets'
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
  isIdleNotesKeyboardOpen,
  idleNotesKeyboardRows,
  onIdleWidgetTargetOpen,
  onIdleWidgetDragPointerDown,
  onIdleWidgetDragPointerMove,
  onIdleWidgetDragPointerEnd,
  onIdleWidgetDragHandleClick,
  onIdleNotesKeyboardOpen,
  onIdleNotesChange,
  onIdleNotesKeyMouseDown,
  onIdleNotesVirtualKey,
  onIdleNotesKeyboardClose,
}: DashboardIdleViewProps) {
  const maintenanceRuntimeLabel = maintenanceSummary.isRuntimeBacked
    ? `${maintenanceSummary.runtimeHours} ч`
    : '—'
  const maintenanceDueLabel = maintenanceSummary.isRuntimeBacked
    ? `${maintenanceSummary.hoursLeft} ч`
    : 'Не подключено'

  return (
    <section className="dashboard-idle-screen" data-testid="screen-dashboard-idle">
      <div className="dashboard-idle-hero">
        <div className="dashboard-idle-logo" aria-hidden="true">
          <img className="dashboard-idle-logo-image" src={logoSrc} alt="" />
        </div>
        <p className="dashboard-idle-title">{idleHeroStatusLabel}</p>
        {statusDock}
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
                    <p className="idle-mini-label">Т.О</p>
                    <div className="idle-service-metrics">
                      <p><span>Пробег</span><strong>{maintenanceRuntimeLabel}</strong></p>
                      <p><span>Т.О</span><strong>{maintenanceDueLabel}</strong></p>
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
            className="dashboard-idle-notes-input"
            value={idleNotesText}
            onFocus={onIdleNotesKeyboardOpen}
            onChange={onIdleNotesChange}
            spellCheck={false}
            data-testid="idle-notes-input"
          />
        </article>
      </aside>

      {isIdleNotesKeyboardOpen ? (
        <div className="idle-notes-keyboard" data-testid="idle-notes-keyboard">
          {idleNotesKeyboardRows.map((row, rowIndex) => (
            <div className="idle-notes-keyboard-row" key={`idle-notes-keyboard-row-${rowIndex}`}>
              {row.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="idle-notes-keyboard-key"
                  aria-label={`Символ ${label}`}
                  onMouseDown={onIdleNotesKeyMouseDown}
                  onClick={() => onIdleNotesVirtualKey(label.toLocaleLowerCase('ru-RU'))}
                >
                  {label}
                </button>
              ))}
            </div>
          ))}

          <div className="idle-notes-keyboard-row idle-notes-keyboard-row-actions">
            <button
              type="button"
              className="idle-notes-keyboard-key idle-notes-keyboard-key-action"
              aria-label="Удалить символ"
              onMouseDown={onIdleNotesKeyMouseDown}
              onClick={() => onIdleNotesVirtualKey('backspace')}
            >
              ⌫
            </button>
            <button
              type="button"
              className="idle-notes-keyboard-key idle-notes-keyboard-key-space"
              aria-label="Пробел"
              onMouseDown={onIdleNotesKeyMouseDown}
              onClick={() => onIdleNotesVirtualKey('space')}
            >
              Пробел
            </button>
            <button
              type="button"
              className="idle-notes-keyboard-key idle-notes-keyboard-key-action"
              aria-label="Новая строка"
              onMouseDown={onIdleNotesKeyMouseDown}
              onClick={() => onIdleNotesVirtualKey('enter')}
            >
              ↵
            </button>
            <button
              type="button"
              className="idle-notes-keyboard-key idle-notes-keyboard-key-close"
              aria-label="Скрыть клавиатуру"
              onMouseDown={onIdleNotesKeyMouseDown}
              onClick={onIdleNotesKeyboardClose}
            >
              Скрыть
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
