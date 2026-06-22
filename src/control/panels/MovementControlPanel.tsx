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
import type { AxisCoordinateItem, AxisHomeStatus, MovementControlPanelProps, PrintHeadPosition } from '../types'

const HEAD_X_BOUNDS_MM = { min: 0, max: 250 } as const
const HEAD_Y_BOUNDS_MM = { min: 0, max: 250 } as const
const MAX_JOYSTICK_SPEED_MM_S = 50
const HOMED_AXIS_IDS: readonly AxisId[] = ['X', 'Y', 'Z']

type MovementSnapshotInput = {
  rawX: number
  rawY: number
  rawZ: number
  rawE: number
  homedAxes: string
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
>

function selectMovementSnapshotInput(snapshot: PrinterSnapshot): MovementSnapshotInput {
  return {
    rawX: snapshot.toolhead.rawX,
    rawY: snapshot.toolhead.rawY,
    rawZ: snapshot.toolhead.rawZ,
    rawE: snapshot.toolhead.rawE,
    homedAxes: snapshot.homedAxes,
  }
}

function isMovementSnapshotInputEqual(left: MovementSnapshotInput, right: MovementSnapshotInput): boolean {
  return (
    left.rawX === right.rawX &&
    left.rawY === right.rawY &&
    left.rawZ === right.rawZ &&
    left.rawE === right.rawE &&
    left.homedAxes === right.homedAxes
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

function buildAxisCoordinateItems(
  position: PrintHeadPosition,
  snapshot: MovementSnapshotInput,
): AxisCoordinateItem[] {
  const isXKnown = isAxisHomed(snapshot.homedAxes, 'X') && Number.isFinite(snapshot.rawX)
  const isYKnown = isAxisHomed(snapshot.homedAxes, 'Y') && Number.isFinite(snapshot.rawY)
  const isZKnown = isAxisHomed(snapshot.homedAxes, 'Z') && Number.isFinite(snapshot.rawZ)

  return [
    { axis: 'X', value: formatKnownAxisCoordinate(position.x, isXKnown) },
    { axis: 'Y', value: formatKnownAxisCoordinate(position.y, isYKnown) },
    { axis: 'Z', value: formatKnownAxisCoordinate(position.z, isZKnown) },
    { axis: 'E', value: formatAxisCoordinate(position.e) },
  ]
}

function buildAxisHomeStatuses(homedAxes: string): AxisHomeStatus[] {
  const normalizedHomedAxes = homedAxes.toLocaleLowerCase('en-US')

  return HOMED_AXIS_IDS.map((axis) => ({
    axis,
    homed: normalizedHomedAxes.includes(axis.toLocaleLowerCase('en-US')),
  }))
}

function isAxisHomed(homedAxes: string, axis: AxisId): boolean {
  return homedAxes.toLocaleLowerCase('en-US').includes(axis.toLocaleLowerCase('en-US'))
}

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

    await onParkingTargetSelect(nextMode, nextAxis)
  }

  function handleMotorsDisableClick(): void {
    if (commandBlockReasons.disableMotors !== null) {
      showParkingLockPopup(commandBlockReasons.disableMotors)
      return
    }

    onMotorsDisable()
  }

  return (
    <div className="control-grid">
      <article className="control-card control-card-parking">
        <div className="control-card-head">
          <h3 className="control-card-title">Парковка</h3>
          {pendingCommand === 'home' || pendingCommand === 'homeAll' || pendingCommand === 'homeXY' || pendingCommand === 'homeZ' ? (
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
            XYZ
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
              {option.label}
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
          onClick={handleMotorsDisableClick}
          aria-disabled={commandBlockReasons.disableMotors !== null || undefined}
          disabled={isBusy}
        >
          Отключить моторы
        </button>
      </article>

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
      />
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
}: AxisMotionPanelProps) {
  const movementSnapshot = usePrinterStoreSelector(
    selectMovementSnapshotInput,
    isMovementSnapshotInputEqual,
  )
  const [joystickVector, setJoystickVector] = useState<JoystickVector>({ x: 0, y: 0 })
  const lockPopupIdRef = useRef(0)
  const [lockPopup, setLockPopup] = useState<{ id: number; message: string } | null>(null)
  const [printHeadPosition, setPrintHeadPosition] = useState<PrintHeadPosition>(() =>
    normalizeHeadPosition({
      x: movementSnapshot.rawX,
      y: movementSnapshot.rawY,
      z: movementSnapshot.rawZ,
      e: movementSnapshot.rawE,
    }, zBounds),
  )
  const moveStepMm = useMemo(() => getMoveStepMm(moveStepKey), [moveStepKey])
  const joystickSpeedMmS = useMemo(
    () => Math.hypot(joystickVector.x, joystickVector.y) * MAX_JOYSTICK_SPEED_MM_S,
    [joystickVector.x, joystickVector.y],
  )
  const axisCoordinateItems = useMemo(
    () => buildAxisCoordinateItems(printHeadPosition, movementSnapshot),
    [movementSnapshot, printHeadPosition],
  )
  const axisCoordinatesLabel = axisCoordinateItems
    .map((item) => `${item.axis} ${item.value}`)
    .join('  ')
  const axisHomeStatuses = useMemo(
    () => buildAxisHomeStatuses(movementSnapshot.homedAxes),
    [movementSnapshot.homedAxes],
  )
  const moveAxisBlockReasons = commandBlockReasons.moveAxis
  const isXyMovementLocked = moveAxisBlockReasons.X !== null || moveAxisBlockReasons.Y !== null
  const isZMovementLocked = moveAxisBlockReasons.Z !== null
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

  useEffect(() => {
    if ((movementMode !== 'joystick' || isXyMovementLocked) && (joystickVector.x !== 0 || joystickVector.y !== 0)) {
      setJoystickVector({ x: 0, y: 0 })
    }
  }, [isXyMovementLocked, joystickVector.x, joystickVector.y, movementMode])

  useEffect(() => {
    if (movementMode === 'joystick') {
      return
    }

    setPrintHeadPosition(normalizeHeadPosition({
      x: movementSnapshot.rawX,
      y: movementSnapshot.rawY,
      z: movementSnapshot.rawZ,
      e: movementSnapshot.rawE,
    }, zBounds))
  }, [movementMode, movementSnapshot.rawE, movementSnapshot.rawX, movementSnapshot.rawY, movementSnapshot.rawZ, zBounds])

  useEffect(() => {
    if (movementMode !== 'joystick' || isXyMovementLocked || (joystickVector.x === 0 && joystickVector.y === 0)) {
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
  }, [isXyMovementLocked, joystickVector.x, joystickVector.y, movementMode, zBounds])

  async function handleAxisMove(axis: AxisId, direction: -1 | 1): Promise<void> {
    const blockReason = moveAxisBlockReasons[axis]
    if (blockReason !== null) {
      showLockPopup(blockReason)
      return
    }

    const distanceMm = direction * moveStepMm
    await onAxisMove(axis, distanceMm)
  }

  async function handleFilamentMove(direction: -1 | 1): Promise<void> {
    const blockReason = direction > 0
      ? commandBlockReasons.unloadFilament
      : commandBlockReasons.loadFilament
    if (blockReason !== null) {
      showLockPopup(blockReason)
      return
    }

    await onFilamentMove(direction)
  }

  function handleJoystickZChange(nextValue: number): void {
    if (isZMovementLocked) {
      return
    }

    setPrintHeadPosition((prevPosition) => ({
      ...prevPosition,
      z: clampAxisValue(nextValue, zBounds.min, zBounds.max),
    }))
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
    <article className="control-card control-card-motion">
      <div className="control-card-head">
        <h3 className="control-card-title">Оси</h3>
      </div>
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
      <SegmentedToggle
        options={CONTROL_MOVEMENT_MODE_OPTIONS}
        value={movementMode}
        onChange={onMovementModeChange}
        ariaLabel="Режим перемещения"
        testIdPrefix="move-mode"
      />
      {movementMode === 'buttons' ? (
        <div className="control-motion-buttons">
          <SegmentedToggle
            options={CONTROL_MOVE_STEP_OPTIONS}
            value={moveStepKey}
            onChange={onMoveStepChange}
            ariaLabel="Шаг перемещения"
            testIdPrefix="move-step"
          />
          <div className="control-coordinates-panel control-subpanel">
            <p className="joystick-readout axis-coordinate-readout" data-testid="axis-coordinates" aria-label={axisCoordinatesLabel}>
              {axisCoordinateItems.map((item) => (
                <span key={item.axis} className="axis-coordinate-item">
                  <span className="axis-coordinate-axis">{item.axis}</span>
                  <span className="axis-coordinate-value">{item.value}</span>
                </span>
              ))}
            </p>
            <div className="axis-home-status" aria-label="Статус хоуминга осей">
              {axisHomeStatuses.map((item) => (
                <span
                  key={item.axis}
                  className={`axis-home-indicator${item.homed ? ' is-homed' : ''}`}
                  aria-label={`Ось ${item.axis} ${item.homed ? 'захоумлена' : 'не захоумлена'}`}
                >
                  <span className="axis-home-label">{item.axis}</span>
                  <span className="axis-home-mark" aria-hidden="true" />
                </span>
              ))}
            </div>
          </div>
          <div className="control-cross-wrap">
            <AxisCrossControls
              onMove={(axis, direction) => void handleAxisMove(axis, direction)}
              onFilamentMove={(direction) => void handleFilamentMove(direction)}
              disabled={isBusy}
              disabledAxes={{
                X: moveAxisBlockReasons.X !== null,
                Y: moveAxisBlockReasons.Y !== null,
                Z: moveAxisBlockReasons.Z !== null,
              }}
              filamentDisabled={isFilamentMoveLocked}
              onBlockedMove={(axis) => showLockPopup(moveAxisBlockReasons[axis])}
              onBlockedFilamentMove={(direction) => showLockPopup(
                direction > 0
                  ? commandBlockReasons.unloadFilament
                  : commandBlockReasons.loadFilament,
              )}
            />
          </div>
        </div>
      ) : (
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
              <p className="joystick-meta-label">Координаты</p>
              <p className="joystick-readout control-subpanel" data-testid="axis-coordinates">{axisCoordinatesLabel}</p>
            </div>
            <div className="joystick-meta-block">
              <p className="joystick-meta-label">Скорость XY</p>
              <p className="joystick-readout control-subpanel">{joystickSpeedMmS.toFixed(1)} / 50 мм/с</p>
            </div>
          </div>
        </div>
      )}
    </article>
  )
})
