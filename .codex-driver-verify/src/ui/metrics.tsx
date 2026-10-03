import type { ReactNode } from 'react'
import { joinClassNames } from './classNames'

type PlainMetricProps = {
  label: string
  value: ReactNode
  unit?: string
  className?: string
  valueClassName?: string
  valueTestId?: string
}

export function PlainMetric({ label, value, unit, className, valueClassName, valueTestId }: PlainMetricProps) {
  return (
    <div className={joinClassNames('metric compact', className)}>
      <p className="label">{label}</p>
      <p className={joinClassNames('value', valueClassName)} data-testid={valueTestId}>
        {value}
        {unit ? <span>{unit}</span> : null}
      </p>
    </div>
  )
}

type TemperatureMetricProps = {
  label: string
  current: string
  target: number
  meterTone: 'heat'
  fillPercent: number
  meterFillTestId?: string
}

export function TemperatureMetric({
  label,
  current,
  target,
  meterTone,
  fillPercent,
  meterFillTestId,
}: TemperatureMetricProps) {
  return (
    <div className="metric">
      <p className="label">{label}</p>
      <p className="value temp">
        <span className="temp-current">{current}</span>
        <span className="temp-separator">/</span>
        <span className="temp-target">{target}</span>
        <span className="temp-unit">°C</span>
      </p>
      <div className={joinClassNames('meter', meterTone)}>
        <div className="fill" data-testid={meterFillTestId} style={{ width: `${fillPercent}%` }} />
      </div>
    </div>
  )
}
