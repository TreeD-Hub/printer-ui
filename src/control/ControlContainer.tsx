import { useMemo } from 'react'
import { ControlPage } from './ControlPage'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type { AxisId } from '../ui'
import type {
  FilamentSensorMode,
  FilamentSensorSensitivity,
  FilamentSensorSnapshot,
} from '@treed/printer-logic'
import { CONTROL_MOVE_STEP_OPTIONS } from './config'
import type {
  ControlGroupId,
  FanControlPanelProps,
  HeatingControlPanelProps,
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
  controlGroupBlockReasons?: Partial<Record<ControlGroupId, string | null>>
  pendingCommand: PrinterCommandId | null
  isBusy: boolean
  activeControlFlashKey: string | null
  movementMode: MovementMode
  moveStepKey: MoveStepKey
  heating: HeatingControlPanelProps
  fan: FanControlPanelProps
  filamentSensor: FilamentSensorSnapshot
  isFilamentSensorSnapshotStale: boolean
  commandError: string
  isMainLightEnabled: boolean
  isToolheadLightEnabled: boolean
  mainLightCommandBlockReason: string | null
  toolheadLightCommandBlockReason: string | null
  onMainLightToggle: () => void
  onToolheadLightToggle: () => void
  maintenanceStatus: MaintenanceStatus
  maintenanceProgressTicks: readonly number[]
  maintenanceProgressPercent: number
  onMaintenanceComplete: () => Promise<boolean>
  onControlGroupChange: (groupId: ControlGroupId) => void
  onControlMenuCompactToggle: () => void
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
  onParkingTargetSelect: (nextMode: ParkingMode, nextAxis?: AxisId) => Promise<boolean>
  onServiceModeToggle: () => void
  onMotorsDisable: () => Promise<boolean>
  onMovementModeChange: (nextMode: MovementMode) => void
  onMoveStepChange: (nextStep: MoveStepKey) => void
  onAxisMove: (axis: AxisId, distanceMm: number) => Promise<boolean>
  onFilamentMove: (direction: -1 | 1, distanceMm: number) => Promise<boolean>
  onFilamentSensorModeChange: (mode: FilamentSensorMode) => Promise<boolean>
  onFilamentSensitivityChange: (sensitivity: FilamentSensorSensitivity) => Promise<boolean>
  getLastCommandError: () => string
}

export function ControlContainer({
  activeControlGroup,
  isControlMenuCompact,
  controlGroupBlockReasons,
  pendingCommand,
  isBusy,
  activeControlFlashKey,
  movementMode,
  moveStepKey,
  heating,
  fan,
  filamentSensor,
  isFilamentSensorSnapshotStale,
  commandError,
  isMainLightEnabled,
  isToolheadLightEnabled,
  mainLightCommandBlockReason,
  toolheadLightCommandBlockReason,
  onMainLightToggle,
  onToolheadLightToggle,
  maintenanceStatus,
  maintenanceProgressTicks,
  maintenanceProgressPercent,
  onMaintenanceComplete,
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
  onFilamentSensorModeChange,
  onFilamentSensitivityChange,
  getLastCommandError,
}: ControlContainerProps) {
  const moveStepMm = CONTROL_MOVE_STEP_OPTIONS.find((item) => item.id === moveStepKey)?.valueMm ?? 1
  const movementCommandBlockReasons = useMemo<MovementCommandBlockReasons>(() => ({
    parking: {
      all: getCommandBlockReason('homeAll'),
      axis: {
        X: getCommandBlockReason('homeX'),
        Y: getCommandBlockReason('homeY'),
        Z: getCommandBlockReason('homeZ'),
      },
    },
    moveAxis: {
      X: {
        negative: getCommandBlockReason('moveAxis', { command: 'moveAxis', axis: 'X', distanceMm: -moveStepMm }),
        positive: getCommandBlockReason('moveAxis', { command: 'moveAxis', axis: 'X', distanceMm: moveStepMm }),
      },
      Y: {
        negative: getCommandBlockReason('moveAxis', { command: 'moveAxis', axis: 'Y', distanceMm: -moveStepMm }),
        positive: getCommandBlockReason('moveAxis', { command: 'moveAxis', axis: 'Y', distanceMm: moveStepMm }),
      },
      Z: {
        negative: getCommandBlockReason('moveAxis', { command: 'moveAxis', axis: 'Z', distanceMm: -moveStepMm }),
        positive: getCommandBlockReason('moveAxis', { command: 'moveAxis', axis: 'Z', distanceMm: moveStepMm }),
      },
    },
    disableMotors: getCommandBlockReason('disableMotors'),
    loadFilament: getCommandBlockReason('loadFilament'),
    unloadFilament: getCommandBlockReason('unloadFilament'),
  }), [getCommandBlockReason, moveStepMm])
  const filamentModeBlockReasons = useMemo<Record<FilamentSensorMode, string | null>>(() => ({
    presence: getCommandBlockReason('setFilamentSensorMode', {
      command: 'setFilamentSensorMode',
      mode: 'presence',
    }),
    motion: getCommandBlockReason('setFilamentSensorMode', {
      command: 'setFilamentSensorMode',
      mode: 'motion',
    }),
  }), [getCommandBlockReason])
  const filamentSensitivityBlockReasons = useMemo<Record<FilamentSensorSensitivity, string | null>>(() => ({
    low: getCommandBlockReason('setFilamentEncoderSensitivity', {
      command: 'setFilamentEncoderSensitivity',
      sensitivity: 'low',
    }),
    medium: getCommandBlockReason('setFilamentEncoderSensitivity', {
      command: 'setFilamentEncoderSensitivity',
      sensitivity: 'medium',
    }),
    high: getCommandBlockReason('setFilamentEncoderSensitivity', {
      command: 'setFilamentEncoderSensitivity',
      sensitivity: 'high',
    }),
  }), [getCommandBlockReason])

  return (
    <ControlPage
      activeControlGroup={activeControlGroup}
      isControlMenuCompact={isControlMenuCompact}
      controlGroupBlockReasons={controlGroupBlockReasons}
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
        getLastCommandError,
      }}
      heating={heating}
      fan={fan}
      filament={{
        snapshot: filamentSensor,
        isStale: isFilamentSensorSnapshotStale,
        pendingCommand,
        commandError,
        modeBlockReasons: filamentModeBlockReasons,
        sensitivityBlockReasons: filamentSensitivityBlockReasons,
        onModeChange: onFilamentSensorModeChange,
        onSensitivityChange: onFilamentSensitivityChange,
      }}
      lighting={{
        isMainLightEnabled,
        isToolheadLightEnabled,
        isBusy,
        mainLightCommandBlockReason,
        toolheadLightCommandBlockReason,
        onMainLightToggle,
        onToolheadLightToggle,
      }}
      maintenance={{
        status: maintenanceStatus,
        progressTicks: maintenanceProgressTicks,
        progressPercent: maintenanceProgressPercent,
        isCompletingMaintenance: maintenanceStatus.isCompletingMaintenance ?? false,
        completionError: maintenanceStatus.completionError ?? '',
        completionBlockReason: maintenanceStatus.completionBlockReason ?? null,
        onMaintenanceComplete,
      }}
    />
  )
}
