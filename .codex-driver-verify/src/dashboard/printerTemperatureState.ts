import type { TemperatureMetricDefinition } from './config'
import { clampPercent, rounded } from './helpers'
import type { PrinterSnapshot } from '../core/transport/types'

export type PrinterTemperatureInput = Pick<PrinterSnapshot, 'extruderTemp' | 'bedTemp' | 'modelFanPercent'>

export type TemperatureRuntimeMetric = {
  key: TemperatureMetricDefinition['key']
  label: string
  current: string
  rawCurrent: number
  target: number
  meterTone: TemperatureMetricDefinition['meterTone']
  fillPercent: number
}

export type TemperatureRuntimeState = {
  metrics: TemperatureRuntimeMetric[]
  nozzleCurrent: string
  bedCurrent: string
  modelFanPercent: number
}

type TemperatureTargets = {
  nozzle: number
  bed: number
}

export function createTemperatureRuntimeState(
  snapshot: PrinterTemperatureInput,
  definitions: readonly TemperatureMetricDefinition[],
  targets: TemperatureTargets,
): TemperatureRuntimeState {
  const currentByKey = {
    nozzle: snapshot.extruderTemp,
    bed: snapshot.bedTemp,
  } as const

  const targetByKey = {
    nozzle: targets.nozzle,
    bed: targets.bed,
  } as const

  const metrics = definitions.map((definition) => {
    const rawCurrent = currentByKey[definition.key]
    const target = targetByKey[definition.key]

    return {
      key: definition.key,
      label: definition.label,
      current: rounded(rawCurrent),
      rawCurrent,
      target,
      meterTone: definition.meterTone,
      fillPercent: Math.round(clampPercent(rawCurrent, target)),
    }
  })

  return {
    metrics,
    nozzleCurrent: rounded(snapshot.extruderTemp),
    bedCurrent: rounded(snapshot.bedTemp),
    modelFanPercent: Math.round(snapshot.modelFanPercent),
  }
}
