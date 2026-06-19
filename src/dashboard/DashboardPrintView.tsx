import type { CSSProperties } from 'react'
import {
  ActionSquareButton,
  PlainMetric,
  PrintPreviewIcon,
} from '../ui'
import { BABYSTEP_STEP_OPTIONS, DASHBOARD_VALUES } from './config'
import { DashboardTemperatureMetricGrid } from './DashboardTemperatureWidgets'
import type { DashboardPrintViewProps } from './DashboardPage.types'

export function DashboardPrintView({
  statusDock,
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
  onPrintTuneGroupOpen,
  onPause,
  onStopRequest,
  onBabystepStepChange,
  onBabystepAdjust,
}: DashboardPrintViewProps) {
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
