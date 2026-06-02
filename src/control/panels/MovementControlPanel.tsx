import { memo } from 'react'
import {
  AxisCrossControls,
  SegmentedToggle,
  VerticalAxisSlider,
  VirtualJoystick,
} from '../../ui'
import {
  CONTROL_MOVE_STEP_OPTIONS,
  CONTROL_MOVEMENT_MODE_OPTIONS,
  CONTROL_PARKING_AXIS_OPTIONS,
} from '../config'
import type { MovementControlPanelProps } from '../types'

export const MovementControlPanel = memo(function MovementControlPanel({
  pendingCommand,
  isBusy,
  activeControlFlashKey,
  movementMode,
  moveStepKey,
  printHeadPosition,
  zBounds,
  axisCoordinatesLabel,
  axisCoordinateItems,
  axisHomeStatuses,
  joystickSpeedMmS,
  onParkingTargetSelect,
  onServiceModeToggle,
  onMotorsDisable,
  onMovementModeChange,
  onMoveStepChange,
  onAxisMove,
  onFilamentMove,
  onJoystickVectorChange,
  onJoystickZChange,
}: MovementControlPanelProps) {
  return (
    <div className="control-grid">
      <article className="control-card control-card-parking">
        <div className="control-card-head">
          <h3 className="control-card-title">Парковка</h3>
          {pendingCommand === 'home' ? (
            <p className="control-card-state">Парковка...</p>
          ) : null}
        </div>
        <div className="control-parking-targets" role="group" aria-label="Цель парковки">
          <button
            type="button"
            className={`control-target-btn ${activeControlFlashKey === 'parking-all' ? 'is-active' : ''}`}
            aria-pressed={activeControlFlashKey === 'parking-all'}
            data-testid="parking-mode-all"
            onClick={() => onParkingTargetSelect('all')}
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
              data-testid={`parking-axis-${option.id}`}
              onClick={() => onParkingTargetSelect('axis', option.id)}
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
          onClick={onMotorsDisable}
          disabled={isBusy}
        >
          Отключить моторы
        </button>
      </article>

      <article className="control-card control-card-motion">
        <div className="control-card-head">
          <h3 className="control-card-title">Оси</h3>
        </div>
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
                onMove={onAxisMove}
                onFilamentMove={onFilamentMove}
                disabled={isBusy}
              />
            </div>
          </div>
        ) : (
          <div className="joystick-panel">
            <div className="joystick-xy-control">
              <p className="joystick-axis-title">XY</p>
              <VirtualJoystick
                testId="axis-joystick"
                disabled={isBusy}
                onVectorChange={onJoystickVectorChange}
              />
            </div>
            <div className="joystick-z-control">
              <p className="joystick-axis-title">Z</p>
              <VerticalAxisSlider
                value={printHeadPosition.z}
                min={zBounds.min}
                max={zBounds.max}
                step={1}
                onChange={onJoystickZChange}
                minAtTop
                disabled={isBusy}
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
    </div>
  )
})
