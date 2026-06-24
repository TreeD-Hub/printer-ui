import { type ChangeEvent } from 'react'
import { joinClassNames } from './classNames'

type TuneNumberControlProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  fractionDigits?: number
  onChange: (nextValue: number) => void
  testIdPrefix?: string
  displayValue?: string
  readOnly?: boolean
  onInputFocus?: () => void
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function snapValue(value: number, min: number, max: number, step: number, fractionDigits: number): number {
  const safeStep = Math.max(Number.EPSILON, step)
  const clamped = clampValue(value, min, max)
  const stepped = Math.round((clamped - min) / safeStep)
  const snapped = min + (stepped * safeStep)
  const fixed = Number(snapped.toFixed(Math.max(0, fractionDigits)))
  return clampValue(fixed, min, max)
}

export function TuneNumberControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  fractionDigits = 0,
  onChange,
  testIdPrefix,
  displayValue,
  readOnly = false,
  onInputFocus,
}: TuneNumberControlProps) {
  function applyDelta(direction: -1 | 1): void {
    const nextValue = snapValue(value + (direction * step), min, max, step, fractionDigits)
    onChange(nextValue)
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const normalized = event.target.value.replace(',', '.')
    const parsed = Number(normalized)
    if (Number.isNaN(parsed)) {
      return
    }

    const nextValue = clampValue(parsed, min, max)
    onChange(Number(nextValue.toFixed(Math.max(0, fractionDigits))))
  }

  return (
    <section className="print-tune-number-control">
      <p className="label">{label}</p>
      <div className="print-tune-number-row">
        <button
          type="button"
          className="settings-network-btn print-tune-control-btn"
          onClick={() => applyDelta(-1)}
          aria-label={`Уменьшить: ${label}`}
          data-testid={testIdPrefix ? `${testIdPrefix}-minus` : undefined}
        >
          -
        </button>
        <label className="print-tune-input-wrap">
          <input
            type="number"
            className="print-tune-input"
            value={displayValue ?? value.toFixed(Math.max(0, fractionDigits))}
            min={min}
            max={max}
            step={step}
            readOnly={readOnly}
            onChange={handleInputChange}
            onFocus={onInputFocus}
            onClick={onInputFocus}
            data-testid={testIdPrefix ? `${testIdPrefix}-input` : undefined}
          />
          {unit ? <span>{unit}</span> : null}
        </label>
        <button
          type="button"
          className="settings-network-btn print-tune-control-btn"
          onClick={() => applyDelta(1)}
          aria-label={`Увеличить: ${label}`}
          data-testid={testIdPrefix ? `${testIdPrefix}-plus` : undefined}
        >
          +
        </button>
      </div>
    </section>
  )
}

type TemperatureTrendSeries = {
  id: 'nozzle' | 'bed'
  label: string
  tone: 'orange' | 'green'
  points: Array<{
    timestamp: number
    current: number
    target: number
  }>
  unit?: string
}

type TemperatureTrendChartProps = {
  series: TemperatureTrendSeries[]
  testId?: string
}

type TuneCompactStepperInputProps = {
  value: number
  min: number
  max: number
  step: number
  unit?: string
  fractionDigits?: number
  onChange: (nextValue: number) => void
  inputAriaLabel: string
  testIdPrefix?: string
  displayValue?: string
  readOnly?: boolean
  onInputFocus?: () => void
  disabled?: boolean
  onBlocked?: () => void
}

const CHART_WIDTH = 520
const CHART_HEIGHT = 160
const CHART_PADDING = {
  top: 10,
  right: 8,
  bottom: 22,
  left: 38,
} as const

function formatNumericValue(value: number, fractionDigits: number): string {
  return value.toFixed(Math.max(0, fractionDigits))
}

function resolveChartX(timestamp: number, minTime: number, maxTime: number): number {
  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
  const ratio = (timestamp - minTime) / Math.max(1, maxTime - minTime)
  return CHART_PADDING.left + (ratio * plotWidth)
}

function buildPolylinePoints(
  points: TemperatureTrendSeries['points'],
  min: number,
  max: number,
  minTime: number,
  maxTime: number,
): string {
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
  const safeRange = Math.max(1, max - min)

  return points
    .map((point) => {
      const x = resolveChartX(point.timestamp, minTime, maxTime)
      const y = CHART_PADDING.top + plotHeight - (((point.current - min) / safeRange) * plotHeight)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function buildAreaPoints(
  points: TemperatureTrendSeries['points'],
  min: number,
  max: number,
  minTime: number,
  maxTime: number,
): string {
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
  const polylinePoints = buildPolylinePoints(points, min, max, minTime, maxTime)
  const firstX = resolveChartX(points[0]?.timestamp ?? minTime, minTime, maxTime)
  const lastX = resolveChartX(points.at(-1)?.timestamp ?? maxTime, minTime, maxTime)
  const bottomY = CHART_PADDING.top + plotHeight
  return `${firstX.toFixed(2)},${bottomY.toFixed(2)} ${polylinePoints} ${lastX.toFixed(2)},${bottomY.toFixed(2)}`
}

function formatChartTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function buildTimeTickLabels(minTime: number, maxTime: number): Array<{ timestamp: number; label: string }> {
  if (minTime === maxTime) {
    return [{ timestamp: minTime, label: formatChartTime(minTime) }]
  }

  const durationMinutes = Math.max(1, Math.ceil((maxTime - minTime) / 60_000))
  const visibleTickCount = Math.min(6, durationMinutes + 1)

  return Array.from({ length: visibleTickCount }, (_, tickIndex) => {
    const ratio = tickIndex / Math.max(1, visibleTickCount - 1)
    const timestamp = minTime + ((maxTime - minTime) * ratio)
    return {
      timestamp,
      label: formatChartTime(timestamp),
    }
  })
}

function buildYAxisTicks(minValue: number, maxValue: number): number[] {
  const range = Math.max(1, maxValue - minValue)
  const tickStep = range >= 140 ? 50 : 25
  const start = Math.max(0, Math.floor(minValue / tickStep) * tickStep)
  const end = Math.ceil(maxValue / tickStep) * tickStep
  const ticks: number[] = []

  for (let value = start; value <= end; value += tickStep) {
    ticks.push(value)
  }

  return ticks
}

export function TuneCompactStepperInput({
  value,
  min,
  max,
  step,
  unit,
  fractionDigits = 0,
  onChange,
  inputAriaLabel,
  testIdPrefix,
  displayValue,
  readOnly = false,
  onInputFocus,
  disabled = false,
  onBlocked,
}: TuneCompactStepperInputProps) {
  function applyDelta(direction: -1 | 1): void {
    if (disabled) {
      onBlocked?.()
      return
    }

    const nextValue = snapValue(value + (direction * step), min, max, step, fractionDigits)
    onChange(nextValue)
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    if (disabled) {
      onBlocked?.()
      return
    }

    const normalized = event.target.value.replace(',', '.')
    const parsed = Number(normalized)
    if (Number.isNaN(parsed)) {
      return
    }

    onChange(clampValue(parsed, min, max))
  }

  function handleInputActivation(): void {
    if (disabled) {
      onBlocked?.()
      return
    }

    onInputFocus?.()
  }

  return (
    <div className="print-tune-compact-stepper">
      <div className="print-tune-compact-stepper-main">
        <label className="print-tune-compact-stepper-input-wrap">
          <input
            type="number"
            className="print-tune-compact-stepper-input"
            aria-label={inputAriaLabel}
            value={displayValue ?? formatNumericValue(value, fractionDigits)}
            min={min}
            max={max}
            step={step}
            readOnly={readOnly}
            aria-disabled={disabled || undefined}
            onChange={handleInputChange}
            onFocus={handleInputActivation}
            onClick={handleInputActivation}
            data-testid={testIdPrefix ? `${testIdPrefix}-input` : undefined}
          />
        </label>
        {unit ? <span className="print-tune-compact-stepper-unit">{unit}</span> : null}
      </div>
      <div className="print-tune-compact-stepper-controls" role="group" aria-label={`Кнопки шага: ${inputAriaLabel}`}>
        <button
          type="button"
          className="settings-network-btn print-tune-compact-stepper-btn"
          onClick={() => applyDelta(-1)}
          aria-label={`Уменьшить: ${inputAriaLabel}`}
          aria-disabled={disabled || undefined}
          data-testid={testIdPrefix ? `${testIdPrefix}-minus` : undefined}
        >
          -
        </button>
        <button
          type="button"
          className="settings-network-btn print-tune-compact-stepper-btn"
          onClick={() => applyDelta(1)}
          aria-label={`Увеличить: ${inputAriaLabel}`}
          aria-disabled={disabled || undefined}
          data-testid={testIdPrefix ? `${testIdPrefix}-plus` : undefined}
        >
          +
        </button>
      </div>
    </div>
  )
}

export function TemperatureTrendChart({ series, testId }: TemperatureTrendChartProps) {
  const normalizedSeries = series.filter((item) => item.points.length > 0)
  const allPoints = normalizedSeries.flatMap((item) => item.points)
  const allValues = allPoints.flatMap((point) => point.target > 0
    ? [point.current, point.target]
    : [point.current])
  const rawMaxValue = allValues.length > 0 ? Math.max(...allValues) : 100
  const rawMinValue = allValues.length > 0 ? Math.min(...allValues) : 0
  const yTicks = buildYAxisTicks(rawMinValue - 4, rawMaxValue + 4)
  const minValue = yTicks[0] ?? 0
  const maxValue = yTicks[yTicks.length - 1] ?? 100
  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
  const minTime = allPoints.length > 0 ? Math.min(...allPoints.map((point) => point.timestamp)) : 0
  const maxTime = allPoints.length > 0 ? Math.max(...allPoints.map((point) => point.timestamp)) : minTime
  const timeTicks = buildTimeTickLabels(minTime, maxTime)

  function resolveY(value: number): number {
    return CHART_PADDING.top + plotHeight - (((value - minValue) / Math.max(1, maxValue - minValue)) * plotHeight)
  }

  return (
    <section className="print-temp-chart" data-testid={testId}>
      <svg className="print-temp-chart-svg" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none">
        <rect
          x={CHART_PADDING.left}
          y={CHART_PADDING.top}
          width={plotWidth}
          height={plotHeight}
          className="print-temp-chart-frame"
        />

        {yTicks.map((tick) => (
          <g key={`y-tick-${tick}`}>
            <line
              x1={CHART_PADDING.left}
              y1={resolveY(tick)}
              x2={CHART_WIDTH - CHART_PADDING.right}
              y2={resolveY(tick)}
              className="print-temp-chart-grid"
            />
            <text
              x={CHART_PADDING.left - 8}
              y={resolveY(tick) + 4}
              className="print-temp-chart-axis-label"
              textAnchor="end"
            >
              {tick}
            </text>
          </g>
        ))}

        {timeTicks.map((tick) => {
          const x = resolveChartX(tick.timestamp, minTime, maxTime)
          const textAnchor =
            tick.timestamp === minTime
              ? 'start'
              : tick.timestamp === maxTime
                ? 'end'
                : 'middle'
          return (
            <g key={`time-tick-${tick.timestamp}`}>
              <line
                x1={x}
                y1={CHART_PADDING.top}
                x2={x}
                y2={CHART_PADDING.top + plotHeight}
                className="print-temp-chart-grid is-vertical"
              />
              <text
                x={x}
                y={CHART_HEIGHT - 6}
                className="print-temp-chart-time-label"
                textAnchor={textAnchor}
              >
                {tick.label}
              </text>
            </g>
          )
        })}

        {normalizedSeries.map((item) => {
          const lastPoint = item.points.at(-1)
          const toneClassName = item.tone === 'orange' ? 'is-orange' : 'is-green'

          return (
            <g key={item.id}>
              <polygon
                points={buildAreaPoints(item.points, minValue, maxValue, minTime, maxTime)}
                className={joinClassNames('print-temp-chart-area', toneClassName)}
              />
              <polyline
                points={buildPolylinePoints(item.points, minValue, maxValue, minTime, maxTime)}
                className={joinClassNames('print-temp-chart-line', toneClassName)}
                data-testid={`chart-current-${item.id}`}
              />
              {lastPoint !== undefined && lastPoint.target > 0 ? (
                <polyline
                  points={`${CHART_PADDING.left},${resolveY(lastPoint.target).toFixed(2)} ${CHART_WIDTH - CHART_PADDING.right},${resolveY(lastPoint.target).toFixed(2)}`}
                  className={joinClassNames('print-temp-chart-target', toneClassName)}
                  data-testid={`chart-target-${item.id}`}
                />
              ) : null}
              {lastPoint !== undefined ? (
                <circle
                  cx={resolveChartX(lastPoint.timestamp, minTime, maxTime)}
                  cy={resolveY(lastPoint.current)}
                  r="3.5"
                  className={joinClassNames('print-temp-chart-marker', toneClassName)}
                />
              ) : null}
            </g>
          )
        })}
      </svg>
    </section>
  )
}

type TuneModeOption = {
  id: string
  label: string
}

type TuneModeToggleProps = {
  options: TuneModeOption[]
  value: string
  onChange: (nextValue: string) => void
  testIdPrefix?: string
  layout?: 'fill' | 'compact'
}

export function TuneModeToggle({
  options,
  value,
  onChange,
  testIdPrefix,
  layout = 'fill',
}: TuneModeToggleProps) {
  return (
    <div
      className={joinClassNames('print-tune-mode-toggle', layout === 'compact' && 'is-compact')}
      role="group"
      aria-label="Режим отображения графика"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={joinClassNames('print-tune-mode-btn', value === option.id && 'is-active')}
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          data-testid={testIdPrefix ? `${testIdPrefix}-${option.id}` : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
