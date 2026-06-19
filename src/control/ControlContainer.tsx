import { type Dispatch, type SetStateAction, useMemo } from 'react'
import { ControlPage } from './ControlPage'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import { clampPercent } from '../dashboard/helpers'
import type { AxisId } from '../ui'
import type {
  ControlGroupId,
  FanControlPanelProps,
  HeatingControlPanelProps,
  MaintenanceChecklistItem,
  MaintenanceHistoryItem,
  MaintenanceStatus,
  MovementCommandBlockReasons,
  MovementMode,
  MoveStepKey,
  ParkingMode,
} from './types'

const HEAD_Z_BOUNDS_MM = { min: 0, max: 200 } as const

export type ControlContainerProps = {
  activeControlGroup: ControlGroupId
  isControlMenuCompact: boolean
  pendingCommand: PrinterCommandId | null
  isBusy: boolean
  activeControlFlashKey: string | null
  movementMode: MovementMode
  moveStepKey: MoveStepKey
  heating: HeatingControlPanelProps
  fan: FanControlPanelProps
  isMainLightEnabled: boolean
  isToolheadLightEnabled: boolean
  onMainLightEnabledChange: Dispatch<SetStateAction<boolean>>
  onToolheadLightEnabledChange: Dispatch<SetStateAction<boolean>>
  maintenanceStatus: MaintenanceStatus
  maintenanceHistoryItems: readonly MaintenanceHistoryItem[]
  maintenanceChecklistItems: readonly MaintenanceChecklistItem[]
  maintenanceProgressTicks: readonly number[]
  maintenanceChecklistState: Record<string, boolean>
  onMaintenanceChecklistItemChange: (itemId: string, checked: boolean) => void
  onMaintenanceChecklistComplete: () => void
  onControlGroupChange: (groupId: ControlGroupId) => void
  onControlMenuCompactToggle: () => void
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
  onParkingTargetSelect: (nextMode: ParkingMode, nextAxis?: AxisId) => Promise<boolean>
  onServiceModeToggle: () => void
  onMotorsDisable: () => void
  onMovementModeChange: (nextMode: MovementMode) => void
  onMoveStepChange: (nextStep: MoveStepKey) => void
  onAxisMove: (axis: AxisId, distanceMm: number) => Promise<boolean>
  onFilamentMove: (direction: -1 | 1) => Promise<boolean>
}

export function ControlContainer({
  activeControlGroup,
  isControlMenuCompact,
  pendingCommand,
  isBusy,
  activeControlFlashKey,
  movementMode,
  moveStepKey,
  heating,
  fan,
  isMainLightEnabled,
  isToolheadLightEnabled,
  onMainLightEnabledChange,
  onToolheadLightEnabledChange,
  maintenanceStatus,
  maintenanceHistoryItems,
  maintenanceChecklistItems,
  maintenanceProgressTicks,
  maintenanceChecklistState,
  onMaintenanceChecklistItemChange,
  onMaintenanceChecklistComplete,
  onControlGroupChange,
  onControlMenuCompactToggle,
  getCommandBlockReason,
  onParkingTargetSelect,
  onServiceModeToggle,
  onMotorsDisable,
  onMovementModeChange,
  onMoveStepChange,
  onAxisMove,
  onFilamentMove,
}: ControlContainerProps) {
  const movementCommandBlockReasons = useMemo<MovementCommandBlockReasons>(() => ({
    parking: {
      all: getCommandBlockReason('homeAll'),
      axis: {
        X: getCommandBlockReason('homeXY'),
        Y: getCommandBlockReason('homeXY'),
        Z: getCommandBlockReason('homeZ'),
      },
    },
    moveAxis: {
      X: getCommandBlockReason('moveAxis', { command: 'moveAxis', axis: 'X', distanceMm: 1 }),
      Y: getCommandBlockReason('moveAxis', { command: 'moveAxis', axis: 'Y', distanceMm: 1 }),
      Z: getCommandBlockReason('moveAxis', { command: 'moveAxis', axis: 'Z', distanceMm: 1 }),
    },
    disableMotors: getCommandBlockReason('disableMotors'),
    loadFilament: getCommandBlockReason('loadFilament'),
    unloadFilament: getCommandBlockReason('unloadFilament'),
  }), [getCommandBlockReason])
  const maintenanceProgressPercent = maintenanceStatus.isRuntimeBacked
    ? clampPercent(
        maintenanceStatus.runtimeHours,
        maintenanceStatus.intervalHours,
      )
    : 0
  const isMaintenanceChecklistComplete = maintenanceChecklistItems.every((item) => maintenanceChecklistState[item.id])

  return (
    <ControlPage
      activeControlGroup={activeControlGroup}
      isControlMenuCompact={isControlMenuCompact}
      onControlGroupChange={onControlGroupChange}
      onControlMenuCompactToggle={onControlMenuCompactToggle}
      movement={{
        pendingCommand,
        isBusy,
        activeControlFlashKey,
        movementMode,
        moveStepKey,
        commandBlockReasons: movementCommandBlockReasons,
        zBounds: HEAD_Z_BOUNDS_MM,
        onParkingTargetSelect,
        onServiceModeToggle,
        onMotorsDisable,
        onMovementModeChange,
        onMoveStepChange,
        onAxisMove,
        onFilamentMove,
      }}
      heating={heating}
      fan={fan}
      lighting={{
        isMainLightEnabled,
        isToolheadLightEnabled,
        onMainLightToggle: () => onMainLightEnabledChange((current) => !current),
        onToolheadLightToggle: () => onToolheadLightEnabledChange((current) => !current),
      }}
      maintenance={{
        status: maintenanceStatus,
        historyItems: maintenanceHistoryItems,
        checklistItems: maintenanceChecklistItems,
        progressTicks: maintenanceProgressTicks,
        progressPercent: maintenanceProgressPercent,
        checklistState: maintenanceChecklistState,
        isChecklistComplete: isMaintenanceChecklistComplete,
        onChecklistItemChange: onMaintenanceChecklistItemChange,
        onChecklistComplete: onMaintenanceChecklistComplete,
      }}
    />
  )
}
