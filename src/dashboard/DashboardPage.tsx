import {
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  ActionSquareButton,
  PlainMetric,
  PrintPreviewIcon,
} from '../ui'
import type { PrinterCommandId } from '../core/commands'
import { BABYSTEP_STEP_OPTIONS, DASHBOARD_VALUES } from './config'
import {
  DashboardIdleTemperatureWidgetContent,
  DashboardTemperatureMetricGrid,
} from './DashboardTemperatureWidgets'

export type DashboardTuneGroupId =
  | 'nozzle'
  | 'bed'
  | 'fan'
  | 'flow'
  | 'speed'
  | 'accel'
  | 'kFactor'
  | 'retract'

export type DashboardIdleWidgetId = 'temperature' | 'maintenance'

type DashboardQuickMetric = {
  key: Extract<DashboardTuneGroupId, 'fan' | 'flow'>
  label: string
  unit: string
  value: number
  valueClassName: 'process-value' | 'percent'
}

type DashboardProcessMetric = {
  key: Extract<DashboardTuneGroupId, 'speed' | 'accel' | 'kFactor' | 'retract'>
  label: string
  unit?: string
  value: number
}

type MaintenanceSummary = {
  runtimeHours: number
  hoursLeft: number
}

type IdleWidgetRefs = {
  current: Record<DashboardIdleWidgetId, HTMLElement | null>
}

type DashboardPageProps = {
  statusDock: ReactNode
  logoSrc: string
  hasActivePrint: boolean
  displayPrintFileName: string | null
  printFill: number
  adjustedEtaTime: string
  displayLayerCurrent: number
  displayLayerTotal: number
  temperatureTargets: {
    nozzle: number
    bed: number
  }
  quickMetrics: DashboardQuickMetric[]
  processMetrics: DashboardProcessMetric[]
  isPrintPaused: boolean
  pendingCommand: PrinterCommandId | null
  isBusy: boolean
  printPauseBlockReason: string | null
  printCancelBlockReason: string | null
  babystepStep: number
  babystepActiveIndex: number
  zOffsetMm: number
  babystepBlockReason: string | null
  idleHeroStatusLabel: string
  idleWidgetOrder: DashboardIdleWidgetId[]
  armedIdleWidgetId: DashboardIdleWidgetId | null
  draggingIdleWidgetId: DashboardIdleWidgetId | null
  idleWidgetRefs: IdleWidgetRefs
  maintenanceSummary: MaintenanceSummary
  idleNotesInputRef: RefObject<HTMLTextAreaElement | null>
  idleNotesText: string
  isIdleNotesKeyboardOpen: boolean
  idleNotesKeyboardRows: string[][]
  onPrintTuneGroupOpen: (groupId: DashboardTuneGroupId) => void
  onPause: () => void
  onStopRequest: () => void
  onBabystepStepChange: (step: number) => void
  onBabystepAdjust: (deltaMm: number) => void
  onIdleWidgetTargetOpen: (widgetId: DashboardIdleWidgetId) => void
  onIdleWidgetDragPointerDown: (event: PointerEvent<HTMLButtonElement>, widgetId: DashboardIdleWidgetId) => void
  onIdleWidgetDragPointerMove: (event: PointerEvent<HTMLButtonElement>, widgetId: DashboardIdleWidgetId) => void
  onIdleWidgetDragPointerEnd: (event: PointerEvent<HTMLButtonElement>) => void
  onIdleWidgetDragHandleClick: (event: MouseEvent<HTMLButtonElement>) => void
  onIdleNotesKeyboardOpen: () => void
  onIdleNotesChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onIdleNotesKeyMouseDown: (event: MouseEvent<HTMLButtonElement>) => void
  onIdleNotesVirtualKey: (key: string) => void
  onIdleNotesKeyboardClose: () => void
}

export function DashboardPage({
  statusDock,
  logoSrc,
  hasActivePrint,
  displayPrintFileName,
  printFill,
  adjustedEtaTime,
  displayLayerCurrent,
  displayLayerTotal,
  temperatureTargets,
  quickMetrics,
  processMetrics,
  isPrintPaused,
  pendingCommand,
  isBusy,
  printPauseBlockReason,
  printCancelBlockReason,
  babystepStep,
  babystepActiveIndex,
  zOffsetMm,
  babystepBlockReason,
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
  onPrintTuneGroupOpen,
  onPause,
  onStopRequest,
  onBabystepStepChange,
  onBabystepAdjust,
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
}: DashboardPageProps) {
  if (hasActivePrint) {
    return (
      <>
        <section className="job-card">
          {statusDock}
          <div className="preview-panel">
            <div className="preview-inner">
              <PrintPreviewIcon />
            </div>
          </div>

          <div className="job-info">
            <p className="job-name">{displayPrintFileName ?? DASHBOARD_VALUES.fileName}</p>

            <div className="print-tune-hitbox print-tune-hitbox-progress" data-testid="print-progress-summary">
              <div className="job-metrics">
                <div>
                  <p className="label">Прогресс</p>
                  <p className="job-main-value">{printFill}%</p>
                </div>
                <div className="job-metrics-right">
                  <p className="label">Конец</p>
                  <p className="job-main-value">{adjustedEtaTime}</p>
                </div>
              </div>

              <div className="job-meter">
                <div className="job-meter-fill" style={{ width: `${printFill}%` }} />
              </div>
            </div>

            <div className="print-tune-hitbox print-tune-hitbox-layer" data-testid="print-layer-summary">
              <div className="job-layer-row">
                <span className="label">Слой</span>
                <strong>
                  {displayLayerCurrent} / {displayLayerTotal}
                </strong>
              </div>
            </div>
          </div>
        </section>

        <section className="right-column">
          <div className="stats-actions-row">
            <article className="stats-card">
              <DashboardTemperatureMetricGrid
                targets={temperatureTargets}
                onOpenTuneGroup={onPrintTuneGroupOpen}
              />

              <div className="three-up-grid">
                {quickMetrics.map((metric) => (
                  <button
                    key={metric.label}
                    type="button"
                    className="print-tune-hitbox print-tune-hitbox-metric"
                    onClick={() => onPrintTuneGroupOpen(metric.key)}
                    aria-label={`Открыть параметры: ${metric.label}`}
                    data-testid={`print-tune-group-${metric.key}`}
                  >
                    <PlainMetric
                      label={metric.label}
                      value={metric.value}
                      unit={metric.unit}
                      valueClassName={metric.valueClassName}
                    />
                  </button>
                ))}
              </div>
            </article>

            <div className="action-stack" role="group" aria-label="действия печати">
              <ActionSquareButton
                icon={isPrintPaused || pendingCommand === 'resume' ? 'actionResume' : 'actionPause'}
                label={
                  pendingCommand === 'pause'
                    ? 'Пауза...'
                    : pendingCommand === 'resume'
                      ? 'Продолжение...'
                      : isPrintPaused
                        ? 'Продолжить'
                        : 'Пауза'
                }
                onClick={onPause}
                disabled={isBusy || printPauseBlockReason !== null}
              />
              <ActionSquareButton
                icon="actionStopCritical"
                tone="danger"
                label={pendingCommand === 'cancel' ? 'Стоп...' : 'Стоп'}
                onClick={onStopRequest}
                disabled={isBusy || printCancelBlockReason !== null}
              />
            </div>
          </div>

          <div className="process-row">
            <article className="process-card">
              <div className="process-grid">
                {processMetrics.map((metric) => (
                  <button
                    key={metric.label}
                    type="button"
                    className="print-tune-hitbox print-tune-hitbox-metric"
                    onClick={() => onPrintTuneGroupOpen(metric.key)}
                    aria-label={`Открыть параметры: ${metric.label}`}
                    data-testid={`print-tune-group-${metric.key}`}
                  >
                    <PlainMetric
                      label={metric.label}
                      value={metric.value}
                      unit={metric.unit}
                      valueClassName="process-value"
                    />
                  </button>
                ))}
              </div>
            </article>

            <aside className="zoffset-card">
              <div className="zoffset-head">
                <p className="label">Z-offset</p>
                <p className="value zoffset-value">
                  {zOffsetMm.toFixed(3)}<span>мм</span>
                </p>
              </div>
              <div
                className="step-selector"
                role="group"
                aria-label="шаг babystep"
                style={{ '--step-active-index': String(babystepActiveIndex) } as CSSProperties}
              >
                <span className="step-selector-indicator" aria-hidden="true" />
                {BABYSTEP_STEP_OPTIONS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    className={`step-btn ${babystepStep === step ? 'is-active' : ''}`}
                    onClick={() => onBabystepStepChange(step)}
                    aria-pressed={babystepStep === step}
                  >
                    {step}
                  </button>
                ))}
              </div>
              <div className="babystep-controls" role="group" aria-label="управление babystep">
                <button
                  type="button"
                  className="babystep-btn"
                  aria-label={`Babystep минус ${babystepStep}`}
                  onClick={() => onBabystepAdjust(-babystepStep)}
                  disabled={isBusy || babystepBlockReason !== null}
                >
                  -
                </button>
                <button
                  type="button"
                  className="babystep-btn"
                  aria-label={`Babystep плюс ${babystepStep}`}
                  onClick={() => onBabystepAdjust(babystepStep)}
                  disabled={isBusy || babystepBlockReason !== null}
                >
                  +
                </button>
              </div>
            </aside>
          </div>
        </section>
      </>
    )
  }

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
                      <p><span>Пробег</span><strong>{maintenanceSummary.runtimeHours} ч</strong></p>
                      <p><span>До Т.О</span><strong>{maintenanceSummary.hoursLeft} ч</strong></p>
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
