import type { ReactNode } from 'react'
import type { PrinterCommandId } from '../core/commands'
import type { AxisId, UiIconName } from '../ui'

export type ControlGroupId = 'movement' | 'heating' | 'fans' | 'lighting' | 'maintenance'
export type ParkingMode = 'all' | 'axis'
export type MovementMode = 'buttons' | 'joystick'
export type MoveStepKey = '1' | '10' | '25' | '100'
export type TemperatureKeyboardTarget = 'nozzle' | 'bed'
export type MaintenanceIconName = 'runtime' | 'due' | 'interval' | 'wrench'

export type PrintHeadPosition = {
  x: number
  y: number
  z: number
  e: number
}

export type ControlOption<T extends string> = {
  id: T
  label: string
}

export type MoveStepOption = ControlOption<MoveStepKey> & {
  valueMm: number
}

export type MovementCommandBlockReasons = {
  parking: {
    all: string | null
    axis: Record<AxisId, string | null>
  }
  moveAxis: Record<AxisId, {
    negative: string | null
    positive: string | null
  }>
  disableMotors: string | null
  loadFilament: string | null
  unloadFilament: string | null
}

export type HeatingCommandBlockReasons = {
  nozzleTarget: string | null
  bedTarget: string | null
  turnOffHeaters: string | null
}

export type HeatingControlRow = {
  id: TemperatureKeyboardTarget
  keyboardTarget: TemperatureKeyboardTarget
  icon: UiIconName
  uiLabel: string
  tone: 'orange' | 'green'
  current: number
  target: number
  maxTarget: number
  onTargetChange: (nextValue: number) => void
  testIdPrefix: string
}

export type TemperatureChartPoint = {
  timestamp: number
  current: number
  target: number
}

export type TemperatureChartSeries = {
  id: 'nozzle' | 'bed'
  label: string
  tone: 'orange' | 'green'
  points: TemperatureChartPoint[]
}

export type MaintenanceStatus = {
  runtimeHours: number
  hoursLeft: number
  intervalHours: number
  isRuntimeBacked: boolean
  notice: string
}

export type MaintenanceHistoryItem = {
  id: string
  date: string
  runtimeHours: number
  label: string
}

export type MaintenanceChecklistItem = {
  id: string
  label: string
}

export type MovementControlPanelProps = {
  pendingCommand: PrinterCommandId | null
  isBusy: boolean
  activeControlFlashKey: string | null
  movementMode: MovementMode
  moveStepKey: MoveStepKey
  commandBlockReasons: MovementCommandBlockReasons
  zBounds: {
    min: number
    max: number
  }
  onParkingTargetSelect: (nextMode: ParkingMode, nextAxis?: AxisId) => Promise<boolean>
  onServiceModeToggle: () => void
  onMotorsDisable: () => Promise<boolean>
  onMovementModeChange: (nextMode: MovementMode) => void
  onMoveStepChange: (nextStep: MoveStepKey) => void
  onAxisMove: (axis: AxisId, distanceMm: number) => Promise<boolean>
  onFilamentMove: (direction: -1 | 1, distanceMm: number) => Promise<boolean>
  getLastCommandError: () => string
}

export type HeatingControlPanelProps = {
  rows: HeatingControlRow[]
  chartSeries: TemperatureChartSeries[]
  temperatureKeyboardTarget: TemperatureKeyboardTarget | null
  temperatureKeyboardValue: string
  printNozzleTargetTemp: number
  printBedTargetTemp: number
  commandBlockReasons: HeatingCommandBlockReasons
  renderTemperatureKeyboardPanel: (className?: string) => ReactNode
  onTemperatureKeyboardOpen: (target: TemperatureKeyboardTarget) => void
  onHeatingPresetApply: (nozzle: number, bed: number) => void
  onHeatingDisable: () => void
}

export type FanControlPanelProps = {
  printFanPercent: number
  isBusy: boolean
  commandBlockReason: string | null
  onFanPercentChange: (nextValue: number) => void
}

export type LightingControlPanelProps = {
  isMainLightEnabled: boolean
  isToolheadLightEnabled: boolean
  onMainLightToggle: () => void
  onToolheadLightToggle: () => void
}

export type MaintenanceControlPanelProps = {
  status: MaintenanceStatus
  historyItems: readonly MaintenanceHistoryItem[]
  checklistItems: readonly MaintenanceChecklistItem[]
  progressTicks: readonly number[]
  progressPercent: number
  checklistState: Record<string, boolean>
  isChecklistComplete: boolean
  onChecklistItemChange: (itemId: string, checked: boolean) => void
  onChecklistComplete: () => void
}
