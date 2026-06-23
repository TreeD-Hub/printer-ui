import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { usePrinterStoreSelector } from '../../core/store/printerStore'
import type { PrinterSnapshot } from '../../core/transport/types'
import {
  AxisCrossControls,
  SegmentedToggle,
  VerticalAxisSlider,
  VirtualJoystick,
  type AxisId,
  type JoystickVector,
} from '../../ui'
import {
  CONTROL_MOVE_STEP_OPTIONS,
  CONTROL_MOVEMENT_MODE_OPTIONS,
  CONTROL_PARKING_AXIS_OPTIONS,
} from '../config'
import type { MovementControlPanelProps, PrintHeadPosition } from '../types'

const HEAD_X_BOUNDS_MM = { min: 0, max: 250 } as const
const HEAD_Y_BOUNDS_MM = { min: 0, max: 250 } as const
const MAX_JOYSTICK_SPEED_MM_S = 50
const HOMED_AXIS_IDS: readonly AxisId[] = ['X', 'Y', 'Z']
const COORDINATE_AXIS_IDS = ['X', 'Y', 'Z', 'E'] as const

type CoordinateAxisId = typeof COORDINATE_AXIS_IDS[number]

type MovementSnapshotInput = {
  rawX: number
  rawY: number
  rawZ: number
  rawE: number
}

type AxisMotionPanelProps = Pick<
  MovementControlPanelProps,
  | 'isBusy'
  | 'movementMode'
  | 'moveStepKey'
  | 'commandBlockReasons'
  | 'zBounds'
  | 'onMovementModeChange'
  | 'onMoveStepChange'
  | 'onAxisMove'
  | 'onFilamentMove'
  | 'getLastCommandError'
>

function selectMovementSnapshotInput(snapshot: PrinterSnapshot): MovementSnapshotInput {
  return {
    rawX: snapshot.toolhead.rawX,
    rawY: snapshot.toolhead.rawY,
    rawZ: snapshot.toolhead.rawZ,
    rawE: snapshot.toolhead.rawE,
  }
}

function isMovementSnapshotInputEqual(left: MovementSnapshotInput, right: MovementSnapshotInput): boolean {
  return (
    left.rawX === right.rawX &&
    left.rawY === right.rawY &&
    left.rawZ === right.rawZ &&
    left.rawE === right.rawE
  )
}

function clampAxisValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeHeadPosition(position: PrintHeadPosition, zBounds: { min: number; max: number }): PrintHeadPosition {
  return {
    x: clampAxisValue(position.x, HEAD_X_BOUNDS_MM.min, HEAD_X_BOUNDS_MM.max),
    y: clampAxisValue(position.y, HEAD_Y_BOUNDS_MM.min, HEAD_Y_BOUNDS_MM.max),
    z: clampAxisValue(position.z, zBounds.min, zBounds.max),
    e: position.e,
  }
}

function formatAxisCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '—'
}

function getMoveStepMm(moveStepKey: MovementControlPanelProps['moveStepKey']): number {
  return CONTROL_MOVE_STEP_OPTIONS.find((item) => item.id === moveStepKey)?.valueMm ?? 1
}

function formatKnownAxisCoordinate(value: number, isKnown: boolean): string {
  return isKnown ? formatAxisCoordinate(value) : '—'
}

function isAxisHomed(homedAxes: string, axis: AxisId): boolean {
  return homedAxes.toLocaleLowerCase('en-US').includes(axis.toLocaleLowerCase('en-US'))
}

const AXIS_VALUE_SELECTORS: Record<CoordinateAxisId, (snapshot: PrinterSnapshot) => number> = {
  X: (snapshot) => snapshot.toolhead.rawX,
  Y: (snapshot) => snapshot.toolhead.rawY,
  Z: (snapshot) => snapshot.toolhead.rawZ,
  E: (snapshot) => snapshot.toolhead.rawE,
}

const AXIS_KNOWN_SELECTORS: Record<CoordinateAxisId, (snapshot: PrinterSnapshot) => boolean> = {
  X: (snapshot) => isAxisHomed(snapshot.homedAxes, 'X') && Number.isFinite(snapshot.toolhead.rawX),
  Y: (snapshot) => isAxisHomed(snapshot.homedAxes, 'Y') && Number.isFinite(snapshot.toolhead.rawY),
  Z: (snapshot) => isAxisHomed(snapshot.homedAxes, 'Z') && Number.isFinite(snapshot.toolhead.rawZ),
  E: (snapshot) => Number.isFinite(snapshot.toolhead.rawE),
}

const AXIS_HOMED_SELECTORS: Record<AxisId, (snapshot: PrinterSnapshot) => boolean> = {
  X: (snapshot) => isAxisHomed(snapshot.homedAxes, 'X'),
  Y: (snapshot) => isAxisHomed(snapshot.homedAxes, 'Y'),
  Z: (snapshot) => isAxisHomed(snapshot.homedAxes, 'Z'),
}

const AxisCoordinateValue = memo(function AxisCoordinateValue({ axis }: { axis: CoordinateAxisId }) {
  const value = usePrinterStoreSelector(AXIS_VALUE_SELECTORS[axis])
  const isKnown = usePrinterStoreSelector(AXIS_KNOWN_SELECTORS[axis])
  const displayValue = formatKnownAxisCoordinate(value, isKnown)

  return (
    <span className="axis-coordinate-value" aria-label={`Координата ${axis}: ${displayValue}`}>
      {displayValue}
    </span>
  )
})

const AxisHomeIndicator = memo(function AxisHomeIndicator({ axis }: { axis: AxisId }) {
  const homed = usePrinterStoreSelector(AXIS_HOMED_SELECTORS[axis])

  return (
    <span
      className={`axis-home-indicator${homed ? ' is-homed' : ''}`}
      aria-label={`Ось ${axis} ${homed ? 'захоумлена' : 'не захоумлена'}`}
    >
      <span className="axis-home-label">{axis}</span>
      <span className="axis-home-mark" aria-hidden="true" />
    </span>
  )
})

const MovementCoordinateSummary = memo(function MovementCoordinateSummary() {
  return (
    <section className="control-coordinate-summary control-subpanel" aria-label="Координаты и статус осей">
      <div className="control-coordinate-summary-head">
        <h3 className="control-card-title">Координаты</h3>
        <div className="axis-home-status" aria-label="Статус хоуминга осей">
          {HOMED_AXIS_IDS.map((axis) => <AxisHomeIndicator key={axis} axis={axis} />)}
        </div>
      </div>
      <p className="joystick-readout axis-coordinate-readout" data-testid="axis-coordinates">
        {COORDINATE_AXIS_IDS.map((axis) => (
          <span key={axis} className="axis-coordinate-item">
            <span className="axis-coordinate-axis">{axis}</span>
            <AxisCoordinateValue axis={axis} />
          </span>
        ))}
      </p>
    </section>
  )
})

export const MovementControlPanel = memo(function MovementControlPanel({
  pendingCommand,
  isBusy,
  activeControlFlashKey,
  movementMode,
  moveStepKey,
  commandBlockReasons,
  zBounds,
  onParkingTargetSelect,
  onServiceModeToggle,
  onMotorsDisable,
  onMovementModeChange,
  onMoveStepChange,
  onAxisMove,
  onFilamentMove,
  getLastCommandError,
}: MovementControlPanelProps) {
  const parkingLockPopupIdRef = useRef(0)
  const [parkingLockPopup, setParkingLockPopup] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    if (parkingLockPopup === null) {
      return
    }

    const timeoutId = window.setTimeout(() => setParkingLockPopup(null), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [parkingLockPopup])

  function showParkingLockPopup(message: string | null): void {
    if (message === null) {
      return
    }

    parkingLockPopupIdRef.current += 1
    setParkingLockPopup({
      id: parkingLockPopupIdRef.current,
      message,
    })
  }

  function getParkingBlockReason(nextMode: 'all' | 'axis', nextAxis?: AxisId): string | null {
    if (nextMode === 'all') {
      return commandBlockReasons.parking.all
    }

    return commandBlockReasons.parking.axis[nextAxis ?? 'X']
  }

  async function handleParkingSelect(nextMode: 'all' | 'axis', nextAxis?: AxisId): Promise<void> {
    const blockReason = getParkingBlockReason(nextMode, nextAxis)
    if (blockReason !== null) {
      showParkingLockPopup(blockReason)
      return
    }

    const ok = await onParkingTargetSelect(nextMode, nextAxis)
    if (!ok) {
      showParkingLockPopup(getLastCommandError() || 'Команда парковки не выполнена.')
    }
  }

  async function handleMotorsDisableClick(): Promise<void> {
    if (commandBlockReasons.disableMotors !== null) {
      showParkingLockPopup(commandBlockReasons.disableMotors)
      return
    }

    const ok = await onMotorsDisable()
    if (!ok) {
      showParkingLockPopup(getLastCommandError() || 'Не удалось отключить моторы.')
    }
  }

  return (
    <div className="control-movement-grid">
      <AxisMotionPanel
        isBusy={isBusy}
        movementMode={movementMode}
        moveStepKey={moveStepKey}
        commandBlockReasons={commandBlockReasons}
        zBounds={zBounds}
        onMovementModeChange={onMovementModeChange}
        onMoveStepChange={onMoveStepChange}
        onAxisMove={onAxisMove}
        onFilamentMove={onFilamentMove}
        getLastCommandError={getLastCommandError}
      />

      <article className="control-card control-card-parking control-subpanel">
        <div className="control-card-head">
          <h3 className="control-card-title">Парковка</h3>
          {pendingCommand === 'home' || pendingCommand === 'homeAll' || pendingCommand === 'homeX' || pendingCommand === 'homeY' || pendingCommand === 'homeXY' || pendingCommand === 'homeZ' ? (
            <p className="control-card-state">Парковка...</p>
          ) : null}
        </div>
        {parkingLockPopup !== null ? (
          <div
            key={parkingLockPopup.id}
            className="control-lock-popup"
            role="alertdialog"
            aria-live="assertive"
            aria-label="Причина блокировки"
            data-testid="movement-lock-popup"
          >
            <p>{parkingLockPopup.message}</p>
            <button
              type="button"
              className="control-lock-popup-close"
              aria-label="Закрыть уведомление"
              onClick={() => setParkingLockPopup(null)}
            >
              ×
            </button>
          </div>
        ) : null}
        <div className="control-parking-targets" role="group" aria-label="Цель парковки">
          <button
            type="button"
            className={`control-target-btn ${activeControlFlashKey === 'parking-all' ? 'is-active' : ''}`}
            aria-pressed={activeControlFlashKey === 'parking-all'}
            aria-disabled={commandBlockReasons.parking.all !== null || undefined}
            data-testid="parking-mode-all"
            onClick={() => void handleParkingSelect('all')}
            disabled={isBusy}
          >
            <span className="control-target-axis">XYZ</span>
            <span className="control-target-label">Все оси</span>
          </button>
          {CONTROL_PARKING_AXIS_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`control-target-btn ${activeControlFlashKey === `parking-${option.id}` ? 'is-active' : ''}`}
              aria-pressed={activeControlFlashKey === `parking-${option.id}`}
              aria-disabled={commandBlockReasons.parking.axis[option.id] !== null || undefined}
              data-testid={`parking-axis-${option.id}`}
              onClick={() => void handleParkingSelect('axis', option.id)}
              disabled={isBusy}
            >
              <span className="control-target-axis">{option.label}</span>
              <span className="control-target-label">Ось {option.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="control-service-btn"
          data-testid="service-mode-button"
          aria-pressed={activeControlFlashKey === 'service-mode'}
          onClick={onServiceModeToggle}
        >
          Сервисный режим
        </button>
        <button
          type="button"
          className="control-action-btn control-action-btn-danger"
          data-testid="motors-disable-button"
          onClick={() => void handleMotorsDisableClick()}
          aria-disabled={commandBlockReasons.disableMotors !== null || undefined}
          disabled={isBusy}
        >
          Отключить моторы
        </button>
      </article>
    </div>
  )
})

const AxisMotionPanel = memo(function AxisMotionPanel({
  isBusy,
  movementMode,
  moveStepKey,
  commandBlockReasons,
  zBounds,
  onMovementModeChange,
  onMoveStepChange,
  onAxisMove,
  onFilamentMove,
  getLastCommandError,
}: AxisMotionPanelProps) {
  const lockPopupIdRef = useRef(0)
  const [lockPopup, setLockPopup] = useState<{ id: number; message: string } | null>(null)
  const moveStepMm = useMemo(() => getMoveStepMm(moveStepKey), [moveStepKey])
  const moveAxisBlockReasons = commandBlockReasons.moveAxis
  const isXyMovementLocked = Object.values(moveAxisBlockReasons.X).some(Boolean) || Object.values(moveAxisBlockReasons.Y).some(Boolean)
  const isZMovementLocked = Object.values(moveAxisBlockReasons.Z).some(Boolean)
  const isFilamentMoveLocked =
    commandBlockReasons.loadFilament !== null ||
    commandBlockReasons.unloadFilament !== null

  useEffect(() => {
    if (lockPopup === null) {
      return
    }

    const timeoutId = window.setTimeout(() => setLockPopup(null), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [lockPopup])

  async function handleAxisMove(axis: AxisId, direction: -1 | 1): Promise<void> {
    const blockReason = moveAxisBlockReasons[axis][direction < 0 ? 'negative' : 'positive']
    if (blockReason !== null) {
      showLockPopup(blockReason)
      return
    }

    const distanceMm = direction * moveStepMm
    const ok = await onAxisMove(axis, distanceMm)
    if (!ok) {
      showLockPopup(getLastCommandError() || `Не удалось переместить ось ${axis}.`)
    }
  }

  async function handleFilamentMove(direction: -1 | 1): Promise<void> {
    const blockReason = direction > 0
      ? commandBlockReasons.unloadFilament
      : commandBlockReasons.loadFilament
    if (blockReason !== null) {
      showLockPopup(blockReason)
      return
    }

    const ok = await onFilamentMove(direction, moveStepMm)
    if (!ok) {
      showLockPopup(getLastCommandError() || 'Не удалось переместить филамент.')
    }
  }

  function showLockPopup(message: string | null): void {
    if (message === null) {
      return
    }

    lockPopupIdRef.current += 1
    setLockPopup({
      id: lockPopupIdRef.current,
      message,
    })
  }

  return (
    <article className="control-movement-main">
      {lockPopup !== null ? (
        <div
          key={lockPopup.id}
          className="control-lock-popup"
          role="alertdialog"
          aria-live="assertive"
          aria-label="Причина блокировки"
          data-testid="movement-lock-popup"
        >
          <p>{lockPopup.message}</p>
          <button
            type="button"
            className="control-lock-popup-close"
            aria-label="Закрыть уведомление"
            onClick={() => setLockPopup(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      <MovementCoordinateSummary />

      {CONTROL_MOVEMENT_MODE_OPTIONS.length > 1 ? (
        <SegmentedToggle
          options={CONTROL_MOVEMENT_MODE_OPTIONS}
          value={movementMode}
          onChange={onMovementModeChange}
          ariaLabel="Режим перемещения"
          testIdPrefix="move-mode"
        />
      ) : null}

      {movementMode === 'buttons' ? (
        <section className="control-axis-controls control-subpanel">
          <div className="control-card-head">
            <h3 className="control-card-title">Оси</h3>
          </div>
          <div className="control-step-row">
            <p className="control-step-label">Шаг перемещения</p>
            <SegmentedToggle
              options={CONTROL_MOVE_STEP_OPTIONS}
              value={moveStepKey}
              onChange={onMoveStepChange}
              ariaLabel="Шаг перемещения"
              testIdPrefix="move-step"
            />
          </div>
          <div className="control-cross-wrap">
            <AxisCrossControls
              onMove={(axis, direction) => void handleAxisMove(axis, direction)}
              onFilamentMove={(direction) => void handleFilamentMove(direction)}
              disabled={isBusy}
              disabledMoves={{
                X: {
                  negative: moveAxisBlockReasons.X.negative !== null,
                  positive: moveAxisBlockReasons.X.positive !== null,
                },
                Y: {
                  negative: moveAxisBlockReasons.Y.negative !== null,
                  positive: moveAxisBlockReasons.Y.positive !== null,
                },
                Z: {
                  negative: moveAxisBlockReasons.Z.negative !== null,
                  positive: moveAxisBlockReasons.Z.positive !== null,
                },
              }}
              filamentDisabled={isFilamentMoveLocked}
              onBlockedMove={(axis, direction) => showLockPopup(
                moveAxisBlockReasons[axis][direction < 0 ? 'negative' : 'positive'],
              )}
              onBlockedFilamentMove={(direction) => showLockPopup(
                direction > 0
                  ? commandBlockReasons.unloadFilament
                  : commandBlockReasons.loadFilament,
              )}
            />
          </div>
        </section>
      ) : (
        <JoystickMotionPanel
          isBusy={isBusy}
          isXyMovementLocked={isXyMovementLocked}
          isZMovementLocked={isZMovementLocked}
          zBounds={zBounds}
        />
      )}
    </article>
  )
})

type JoystickMotionPanelProps = {
  isBusy: boolean
  isXyMovementLocked: boolean
  isZMovementLocked: boolean
  zBounds: { min: number; max: number }
}

const JoystickMotionPanel = memo(function JoystickMotionPanel({
  isBusy,
  isXyMovementLocked,
  isZMovementLocked,
  zBounds,
}: JoystickMotionPanelProps) {
  const movementSnapshot = usePrinterStoreSelector(
    selectMovementSnapshotInput,
    isMovementSnapshotInputEqual,
  )
  const [joystickVector, setJoystickVector] = useState<JoystickVector>({ x: 0, y: 0 })
  const [printHeadPosition, setPrintHeadPosition] = useState<PrintHeadPosition>(() =>
    normalizeHeadPosition({
      x: movementSnapshot.rawX,
      y: movementSnapshot.rawY,
      z: movementSnapshot.rawZ,
      e: movementSnapshot.rawE,
    }, zBounds),
  )
  const joystickSpeedMmS = useMemo(
    () => Math.hypot(joystickVector.x, joystickVector.y) * MAX_JOYSTICK_SPEED_MM_S,
    [joystickVector.x, joystickVector.y],
  )

  useEffect(() => {
    if (isXyMovementLocked && (joystickVector.x !== 0 || joystickVector.y !== 0)) {
      setJoystickVector({ x: 0, y: 0 })
    }
  }, [isXyMovementLocked, joystickVector.x, joystickVector.y])

  useEffect(() => {
    if (isXyMovementLocked || (joystickVector.x === 0 && joystickVector.y === 0)) {
      return
    }

    let frameHandle: number | null = null
    let previousTimestamp: number | null = null
    const tick = (timestamp: number) => {
      if (previousTimestamp === null) {
        previousTimestamp = timestamp
      }
      const deltaSeconds = clampAxisValue((timestamp - previousTimestamp) / 1000, 0, 0.1)
      previousTimestamp = timestamp
      setPrintHeadPosition((prevPosition) => normalizeHeadPosition({
        x: prevPosition.x + (joystickVector.x * MAX_JOYSTICK_SPEED_MM_S * deltaSeconds),
        y: prevPosition.y + (joystickVector.y * MAX_JOYSTICK_SPEED_MM_S * deltaSeconds),
        z: prevPosition.z,
        e: prevPosition.e,
      }, zBounds))
      frameHandle = window.requestAnimationFrame(tick)
    }

    frameHandle = window.requestAnimationFrame(tick)
    return () => {
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle)
      }
    }
  }, [isXyMovementLocked, joystickVector.x, joystickVector.y, zBounds])

  function handleJoystickZChange(nextValue: number): void {
    if (isZMovementLocked) {
      return
    }

    setPrintHeadPosition((prevPosition) => ({
      ...prevPosition,
      z: clampAxisValue(nextValue, zBounds.min, zBounds.max),
    }))
  }

  return (
    <div className="joystick-panel">
      <div className="joystick-xy-control">
        <p className="joystick-axis-title">XY</p>
        <VirtualJoystick
          testId="axis-joystick"
          disabled={isBusy || isXyMovementLocked}
          onVectorChange={setJoystickVector}
        />
      </div>
      <div className="joystick-z-control">
        <p className="joystick-axis-title">Z</p>
        <VerticalAxisSlider
          value={printHeadPosition.z}
          min={zBounds.min}
          max={zBounds.max}
          step={1}
          onChange={handleJoystickZChange}
          minAtTop
          disabled={isBusy || isZMovementLocked}
          testId="axis-z-slider"
        />
      </div>
      <div className="joystick-meta">
        <div className="joystick-meta-block">
          <p className="joystick-meta-label">Скорость XY</p>
          <p className="joystick-readout control-subpanel">{joystickSpeedMmS.toFixed(1)} / 50 мм/с</p>
        </div>
      </div>
    </div>
  )
})
