import { memo, useMemo } from 'react'
import { IconMask, TemperatureMetric } from '../ui'
import { usePrinterStoreSelector } from '../core/store/printerStore'
import type { PrinterSnapshot } from '../core/transport/types'
import { TEMPERATURE_METRIC_DEFINITIONS } from './config'
import {
  createTemperatureRuntimeState,
  type PrinterTemperatureInput,
  type TemperatureRuntimeState,
} from './printerTemperatureState'
import type { DashboardTuneGroupId } from './DashboardPage'

type TemperatureTargets = {
  nozzle: number
  bed: number
}

type DashboardTemperatureMetricGridProps = {
  targets: TemperatureTargets
  onOpenTuneGroup: (groupId: DashboardTuneGroupId) => void
}

const DEFAULT_IDLE_TEMPERATURE_TARGETS: TemperatureTargets = {
  nozzle: TEMPERATURE_METRIC_DEFINITIONS.find((item) => item.key === 'nozzle')?.target ?? 220,
  bed: TEMPERATURE_METRIC_DEFINITIONS.find((item) => item.key === 'bed')?.target ?? 60,
}

function selectPrinterTemperatureInput(snapshot: PrinterSnapshot): PrinterTemperatureInput {
  return {
    extruderTemp: snapshot.extruderTemp,
    bedTemp: snapshot.bedTemp,
    modelFanPercent: snapshot.modelFanPercent,
  }
}

function isPrinterTemperatureInputEqual(
  left: PrinterTemperatureInput,
  right: PrinterTemperatureInput,
): boolean {
  return (
    left.extruderTemp === right.extruderTemp &&
    left.bedTemp === right.bedTemp &&
    left.modelFanPercent === right.modelFanPercent
  )
}

function useDashboardTemperatureState(targets: TemperatureTargets): TemperatureRuntimeState {
  const temperatureInput = usePrinterStoreSelector(
    selectPrinterTemperatureInput,
    isPrinterTemperatureInputEqual,
  )

  return useMemo(
    () => createTemperatureRuntimeState(temperatureInput, TEMPERATURE_METRIC_DEFINITIONS, targets),
    [targets, temperatureInput],
  )
}

export const DashboardTemperatureMetricGrid = memo(function DashboardTemperatureMetricGrid({
  targets,
  onOpenTuneGroup,
}: DashboardTemperatureMetricGridProps) {
  const temperatureState = useDashboardTemperatureState(targets)

  return (
    <div className="temp-grid">
      {temperatureState.metrics.map((metric) => (
        <button
          key={metric.label}
          type="button"
          className="print-tune-hitbox print-tune-hitbox-metric"
          onClick={() => onOpenTuneGroup(metric.key)}
          aria-label={`Открыть параметры: ${metric.label}`}
          data-testid={`print-tune-group-${metric.key}`}
        >
          <TemperatureMetric
            label={metric.label}
            current={metric.current}
            target={metric.target}
            meterTone={metric.meterTone}
            fillPercent={metric.fillPercent}
          />
        </button>
      ))}
    </div>
  )
})

export const DashboardIdleTemperatureWidgetContent = memo(function DashboardIdleTemperatureWidgetContent() {
  const temperatureState = useDashboardTemperatureState(DEFAULT_IDLE_TEMPERATURE_TARGETS)

  return (
    <>
      <p className="idle-mini-label">Температура</p>
      <div className="idle-temp-grid">
        <p>
          <span className="idle-temp-kind" aria-hidden="true">
            <IconMask name="metricNozzle" size={20} className="idle-temp-kind-icon" />
          </span>
          <span className="idle-temp-name">Сопло</span>
          <strong>
            <span className="idle-temp-value-number">{temperatureState.nozzleCurrent}</span>
            <span className="idle-temp-value-unit">°C</span>
          </strong>
        </p>
        <p>
          <span className="idle-temp-kind" aria-hidden="true">
            <IconMask name="metricBed" size={20} className="idle-temp-kind-icon" />
          </span>
          <span className="idle-temp-name">Стол</span>
          <strong>
            <span className="idle-temp-value-number">{temperatureState.bedCurrent}</span>
            <span className="idle-temp-value-unit">°C</span>
          </strong>
        </p>
      </div>
    </>
  )
})
