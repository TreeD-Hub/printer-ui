import { type CSSProperties, useMemo, useState } from 'react'
import { usePrinterCommands } from './core/commands'
import { usePrinterSnapshot } from './core/store/usePrinterSnapshot'
import {
  BABYSTEP_STEP_OPTIONS,
  BOTTOM_NAV_ITEMS,
  DASHBOARD_VALUES,
  PROCESS_METRIC_DEFINITIONS,
  QUICK_METRIC_DEFINITIONS,
  TEMPERATURE_METRIC_DEFINITIONS,
  TOP_STATUS_BUTTONS,
} from './dashboard/config'
import {
  calculatePreviewZoom,
  clampPercent,
  resolvePreviewSettings,
  rounded,
  statusLabel,
} from './dashboard/helpers'
import {
  ActionSquareButton,
  NavItemButton,
  PlainMetric,
  PrintPreviewIcon,
  StatusIconButton,
  TemperatureMetric,
} from './ui'
import './App.css'

function App() {
  const { snapshot, refresh } = usePrinterSnapshot()
  const { pendingCommand, executeCommand } = usePrinterCommands()
  const [babystepStep, setBabystepStep] = useState<number>(BABYSTEP_STEP_OPTIONS[1])
  const previewSettings = useMemo(
    () => resolvePreviewSettings(typeof window === 'undefined' ? '' : window.location.search),
    [],
  )
  const hasPreviewScale = previewSettings.mode !== 'none'
  const previewZoom = useMemo(
    () =>
      calculatePreviewZoom(
        previewSettings,
        typeof window === 'undefined' ? 1 : (window.devicePixelRatio ?? 1),
      ),
    [previewSettings],
  )
  const previewStyle: CSSProperties | undefined = hasPreviewScale
    ? ({ '--preview-zoom': String(previewZoom) } as CSSProperties)
    : undefined

  const printFill = Math.max(0, Math.min(100, DASHBOARD_VALUES.progressPercent))
  const isBusy = pendingCommand !== null

  const temperatureValueByKey = {
    nozzle: snapshot.extruderTemp,
    bed: snapshot.bedTemp,
  } as const

  const temperatureMetrics = TEMPERATURE_METRIC_DEFINITIONS.map((definition) => {
    const currentValue = temperatureValueByKey[definition.key]

    return {
      ...definition,
      current: rounded(currentValue),
      fillPercent: clampPercent(currentValue, definition.target),
    }
  })

  const quickMetricValueByKey = {
    volumetricFlow: DASHBOARD_VALUES.volumetricFlowMm3S,
    fan: rounded(snapshot.modelFanPercent),
    flow: DASHBOARD_VALUES.flowPercent,
  } as const

  const quickMetrics = QUICK_METRIC_DEFINITIONS.map((definition) => ({
    ...definition,
    value: quickMetricValueByKey[definition.key],
  }))

  const processMetricValueByKey = {
    speed: DASHBOARD_VALUES.speedMmS,
    accel: DASHBOARD_VALUES.accelMmS2,
    kFactor: DASHBOARD_VALUES.kFactorLaPa,
    retract: DASHBOARD_VALUES.retractMm,
  } as const

  const processMetrics = PROCESS_METRIC_DEFINITIONS.map((definition) => ({
    ...definition,
    value: processMetricValueByKey[definition.key],
  }))

  async function handlePause(): Promise<void> {
    const ok = await executeCommand({ command: 'pause' })
    if (ok) {
      await refresh()
    }
  }

  async function handleStop(): Promise<void> {
    const ok = await executeCommand({ command: 'cancel' })
    if (ok) {
      await refresh()
    }
  }

  return (
    <main className={`app-root ${hasPreviewScale ? 'is-one-to-one' : ''}`} style={previewStyle}>
      <section className="screen-shell" data-testid="screen-shell">
        <header className="top-bar">
          <div className="brand-wrap">
            <h1>TreeD Принтер</h1>
            <span className="print-state">{statusLabel(snapshot.state)}</span>
          </div>
          <div className="top-icons" aria-label="иконки статуса">
            {TOP_STATUS_BUTTONS.map((item) => (
              <StatusIconButton
                key={item.label}
                icon={item.icon}
                label={item.label}
                tone={item.tone}
                showNotificationDot={item.showNotificationDot}
              />
            ))}
          </div>
        </header>

        <div className="content-grid">
          <section className="job-card">
            <div className="preview-panel">
              <div className="preview-inner">
                <PrintPreviewIcon />
              </div>
            </div>

            <div className="job-info">
              <p className="job-name">{DASHBOARD_VALUES.fileName}</p>

              <div className="job-metrics">
                <div>
                  <p className="label">Прогресс</p>
                  <p className="job-main-value">{DASHBOARD_VALUES.progressPercent}%</p>
                </div>
                <div className="job-metrics-right">
                  <p className="label">Конец</p>
                  <p className="job-main-value">{DASHBOARD_VALUES.etaTime}</p>
                </div>
              </div>

              <div className="job-meter">
                <div className="job-meter-fill" style={{ width: `${printFill}%` }} />
              </div>

              <div className="job-layer-row">
                <span className="label">Слой</span>
                <strong>
                  {DASHBOARD_VALUES.layerCurrent} / {DASHBOARD_VALUES.layerTotal}
                </strong>
              </div>
            </div>
          </section>

          <section className="right-column">
            <div className="stats-actions-row">
              <article className="stats-card">
                <div className="temp-grid">
                  {temperatureMetrics.map((metric) => (
                    <TemperatureMetric
                      key={metric.label}
                      label={metric.label}
                      current={metric.current}
                      target={metric.target}
                      meterTone={metric.meterTone}
                      fillPercent={metric.fillPercent}
                    />
                  ))}
                </div>

                <div className="three-up-grid">
                  {quickMetrics.map((metric) => (
                    <PlainMetric
                      key={metric.label}
                      label={metric.label}
                      value={metric.value}
                      unit={metric.unit}
                      valueClassName={metric.valueClassName}
                    />
                  ))}
                </div>
              </article>

              <div className="action-stack" role="group" aria-label="действия печати">
                <ActionSquareButton
                  icon="actionPause"
                  label={pendingCommand === 'pause' ? 'Пауза...' : 'Пауза'}
                  onClick={() => void handlePause()}
                  disabled={isBusy}
                />
                <ActionSquareButton
                  icon="actionStopCritical"
                  tone="danger"
                  label={pendingCommand === 'cancel' ? 'Стоп...' : 'Стоп'}
                  onClick={() => void handleStop()}
                  disabled={isBusy}
                />
              </div>
            </div>

            <div className="process-row">
              <article className="process-card">
                <div className="process-grid">
                  {processMetrics.map((metric) => (
                    <PlainMetric
                      key={metric.label}
                      label={metric.label}
                      value={metric.value}
                      unit={metric.unit}
                      valueClassName="process-value"
                    />
                  ))}
                </div>
              </article>

              <aside className="zoffset-card">
                <div className="zoffset-head">
                  <p className="label">Z-offset</p>
                  <p className="value zoffset-value">
                    {DASHBOARD_VALUES.zOffsetMm.toFixed(2)}<span>мм</span>
                  </p>
                </div>
                <div className="step-selector" role="group" aria-label="шаг babystep">
                  {BABYSTEP_STEP_OPTIONS.map((step) => (
                    <button
                      key={step}
                      type="button"
                      className={`step-btn ${babystepStep === step ? 'is-active' : ''}`}
                      onClick={() => setBabystepStep(step)}
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
                  >
                    -
                  </button>
                  <button
                    type="button"
                    className="babystep-btn"
                    aria-label={`Babystep плюс ${babystepStep}`}
                  >
                    +
                  </button>
                </div>
              </aside>
            </div>
          </section>
        </div>

        <nav className="bottom-nav" aria-label="Основная навигация">
          {BOTTOM_NAV_ITEMS.map((item) => (
            <NavItemButton key={item.label} label={item.label} icon={item.icon} active={item.active} />
          ))}
        </nav>
      </section>
    </main>
  )
}

export default App
