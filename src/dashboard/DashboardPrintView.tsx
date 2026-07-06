import { useState, type CSSProperties } from 'react'
import {
  ActionSquareButton,
  IconMask,
  PlainMetric,
  PrintPreviewIcon,
  joinClassNames,
} from '../ui'
import { getPreferredPreviewImage, getPreviewSrcSet } from '../ui/printFilePreview'
import { BABYSTEP_STEP_OPTIONS, DASHBOARD_VALUES } from './config'
import { DashboardTemperatureMetricGrid } from './DashboardTemperatureWidgets'
import type { DashboardPrintViewProps } from './DashboardPage.types'

export function DashboardPrintView({
  statusDock,
  displayPrintFileName,
  displayPrintFileNameScrollDistanceCh,
  isDisplayPrintFileNameScrollable,
  printFilePreview,
  printFill,
  adjustedEtaTime,
  displayLayerCurrent,
  displayLayerTotal,
  temperatureTargets,
  quickMetrics,
  processMetrics,
  isPrintPaused,
  pendingCommands,
  printPauseBlockReason,
  printCancelBlockReason,
  excludeObjectOpenBlockReason,
  babystepStep,
  babystepActiveIndex,
  zOffsetMm,
  babystepBlockReason,
  onPrintTuneGroupOpen,
  onPause,
  onStopRequest,
  onExcludeObjectOpen,
  onBabystepStepChange,
  onBabystepAdjust,
}: DashboardPrintViewProps) {
  const preferredPreview = getPreferredPreviewImage(printFilePreview)
  const [failedPreviewSrc, setFailedPreviewSrc] = useState<string | null>(null)
  const previewImage = preferredPreview !== null && preferredPreview.src !== failedPreviewSrc
    ? preferredPreview
    : null
  const displayName = displayPrintFileName ?? DASHBOARD_VALUES.fileName
  const printPendingCommand = pendingCommands.print ?? null
  const criticalPendingCommand = pendingCommands.critical ?? null
  const isPrintActionBusy = printPendingCommand !== null && printPendingCommand !== 'adjustZOffset'

  return (
    <>
      <section className="job-card">
        {statusDock}
        <div className="preview-panel">
          <div className={joinClassNames('preview-inner', previewImage !== null && 'has-image')} aria-hidden={previewImage === null ? 'true' : undefined}>
            {previewImage !== null ? (
              <img
                className="preview-image"
                src={previewImage.src}
                srcSet={getPreviewSrcSet(printFilePreview)}
                sizes="300px"
                width={previewImage.width}
                height={previewImage.height}
                alt={`Предпросмотр ${displayName}`}
                decoding="async"
                draggable={false}
                onError={() => setFailedPreviewSrc(previewImage.src)}
              />
            ) : (
              <PrintPreviewIcon />
            )}
          </div>
          <button
            type="button"
            className="exclude-object-open-button"
            aria-label="Исключить объект"
            aria-describedby={excludeObjectOpenBlockReason !== null ? 'exclude-object-open-block-reason' : undefined}
            data-testid="open-exclude-object-modal"
            disabled={excludeObjectOpenBlockReason !== null}
            onClick={onExcludeObjectOpen}
          >
            <IconMask name="actionExcludeObject" size={24} />
          </button>
          {excludeObjectOpenBlockReason !== null ? (
            <span id="exclude-object-open-block-reason" className="visually-hidden">
              {excludeObjectOpenBlockReason}
            </span>
          ) : null}
        </div>

        <div className="job-info">
          <p className="job-name">
            <span
              className={joinClassNames('job-name-text', isDisplayPrintFileNameScrollable && 'is-scrollable')}
              style={{ '--job-name-scroll-distance': `${displayPrintFileNameScrollDistanceCh}ch` } as CSSProperties}
            >
              {displayName}
            </span>
          </p>

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
              icon={isPrintPaused || printPendingCommand === 'resume' ? 'actionResume' : 'actionPause'}
              label={
                printPendingCommand === 'pause'
                  ? 'Пауза...'
                  : printPendingCommand === 'resume'
                    ? 'Продолжение...'
                    : isPrintPaused
                      ? 'Продолжить'
                      : 'Пауза'
              }
              onClick={onPause}
              disabled={isPrintActionBusy || printPauseBlockReason !== null}
            />
            <ActionSquareButton
              icon="actionStopCritical"
              tone="danger"
              label={criticalPendingCommand === 'cancel' ? 'Стоп...' : 'Стоп'}
              onClick={onStopRequest}
              disabled={printCancelBlockReason !== null}
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
                    valueTestId={`print-process-metric-${metric.key}-value`}
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
                disabled={isPrintActionBusy || babystepBlockReason !== null}
              >
                -
              </button>
              <button
                type="button"
                className="babystep-btn"
                aria-label={`Babystep плюс ${babystepStep}`}
                onClick={() => onBabystepAdjust(babystepStep)}
                disabled={isPrintActionBusy || babystepBlockReason !== null}
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
