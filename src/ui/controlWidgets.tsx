import { type CSSProperties, type PointerEvent as ReactPointerEvent, useRef, useState } from 'react'
import { joinClassNames } from './classNames'

export type AxisId = 'X' | 'Y' | 'Z'

export type JoystickVector = {
  x: number
  y: number
}

type SegmentedOption<T extends string> = {
  id: T
  label: string
}

type SegmentedToggleProps<T extends string> = {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (nextValue: T) => void
  ariaLabel: string
  className?: string
  testIdPrefix?: string
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  testIdPrefix,
}: SegmentedToggleProps<T>) {
  const activeIndex = Math.max(
    0,
    options.findIndex((item) => item.id === value),
  )

  return (
    <div
      className={joinClassNames('segmented-toggle', className)}
      role="group"
      aria-label={ariaLabel}
      style={
        {
          '--segmented-count': String(Math.max(1, options.length)),
          '--segmented-active-index': String(activeIndex),
        } as CSSProperties
      }
    >
      <span className="segmented-toggle-indicator" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={joinClassNames('segmented-toggle-btn', value === option.id && 'is-active')}
          aria-pressed={value === option.id}
          data-testid={testIdPrefix ? `${testIdPrefix}-${option.id}` : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

type AxisCrossControlsProps = {
  onMove: (axis: AxisId, direction: -1 | 1) => void
  onFilamentMove?: (direction: -1 | 1) => void
  onBlockedMove?: (axis: AxisId) => void
  onBlockedFilamentMove?: (direction: -1 | 1) => void
  disabled?: boolean
  disabledAxes?: Partial<Record<AxisId, boolean>>
  filamentDisabled?: boolean
  className?: string
}

export function AxisCrossControls({
  onMove,
  onFilamentMove,
  onBlockedMove,
  onBlockedFilamentMove,
  disabled = false,
  disabledAxes = {},
  filamentDisabled = false,
  className,
}: AxisCrossControlsProps) {
  function handleMoveClick(axis: AxisId, direction: -1 | 1): void {
    if (disabledAxes[axis]) {
      onBlockedMove?.(axis)
      return
    }

    onMove(axis, direction)
  }

  function handleFilamentClick(direction: -1 | 1): void {
    if (filamentDisabled) {
      onBlockedFilamentMove?.(direction)
      return
    }

    onFilamentMove?.(direction)
  }

  return (
    <div className={joinClassNames('axis-cross-layout', className)} role="group" aria-label="Кнопки перемещения по осям">
      <div className="axis-cross-group axis-cross-group-xy control-subpanel control-subpanel-compact control-subpanel-stack" role="group" aria-label="Подблок осей X и Y">
        <p className="axis-cross-title">XY</p>
        <div className="axis-cross-xy">
          <span className="axis-cross-spacer" aria-hidden="true" />
          <button
            type="button"
            className={joinClassNames('axis-cross-btn', disabledAxes.Y && 'is-disabled')}
            aria-label="Сдвиг Y в плюс"
            aria-disabled={disabledAxes.Y || undefined}
            onClick={() => handleMoveClick('Y', 1)}
            disabled={disabled}
          >
            <span className="axis-cross-arrow" aria-hidden="true">↑</span>
          </button>
          <span className="axis-cross-spacer" aria-hidden="true" />

          <button
            type="button"
            className={joinClassNames('axis-cross-btn', disabledAxes.X && 'is-disabled')}
            aria-label="Сдвиг X в минус"
            aria-disabled={disabledAxes.X || undefined}
            onClick={() => handleMoveClick('X', -1)}
            disabled={disabled}
          >
            <span className="axis-cross-arrow" aria-hidden="true">←</span>
          </button>
          <span className="axis-cross-center" aria-hidden="true">
            <span className="axis-cross-center-core" />
          </span>
          <button
            type="button"
            className={joinClassNames('axis-cross-btn', disabledAxes.X && 'is-disabled')}
            aria-label="Сдвиг X в плюс"
            aria-disabled={disabledAxes.X || undefined}
            onClick={() => handleMoveClick('X', 1)}
            disabled={disabled}
          >
            <span className="axis-cross-arrow" aria-hidden="true">→</span>
          </button>

          <span className="axis-cross-spacer" aria-hidden="true" />
          <button
            type="button"
            className={joinClassNames('axis-cross-btn', disabledAxes.Y && 'is-disabled')}
            aria-label="Сдвиг Y в минус"
            aria-disabled={disabledAxes.Y || undefined}
            onClick={() => handleMoveClick('Y', -1)}
            disabled={disabled}
          >
            <span className="axis-cross-arrow" aria-hidden="true">↓</span>
          </button>
          <span className="axis-cross-spacer" aria-hidden="true" />
        </div>
      </div>

      <div className="axis-cross-group axis-cross-group-z control-subpanel control-subpanel-compact control-subpanel-stack" role="group" aria-label="Подблок оси Z">
        <p className="axis-cross-title">Z</p>
        <div className="axis-cross-z">
          <button
            type="button"
            className={joinClassNames('axis-cross-btn axis-cross-btn-labeled', disabledAxes.Z && 'is-disabled')}
            aria-label="Сдвиг Z в плюс"
            aria-disabled={disabledAxes.Z || undefined}
            onClick={() => handleMoveClick('Z', 1)}
            disabled={disabled}
          >
            <span className="axis-cross-arrow" aria-hidden="true">↑</span>
            <span className="axis-cross-btn-label">Вверх</span>
          </button>
          <span className="axis-cross-spacer" aria-hidden="true" />
          <button
            type="button"
            className={joinClassNames('axis-cross-btn axis-cross-btn-labeled', disabledAxes.Z && 'is-disabled')}
            aria-label="Сдвиг Z в минус"
            aria-disabled={disabledAxes.Z || undefined}
            onClick={() => handleMoveClick('Z', -1)}
            disabled={disabled}
          >
            <span className="axis-cross-arrow" aria-hidden="true">↓</span>
            <span className="axis-cross-btn-label">Вниз</span>
          </button>
        </div>
      </div>

      <div className="axis-cross-group axis-cross-group-e control-subpanel control-subpanel-compact control-subpanel-stack" role="group" aria-label="Подблок экструдера E">
        <p className="axis-cross-title">E</p>
        <div className="axis-cross-e">
          <button
            type="button"
            className={joinClassNames('axis-cross-btn axis-cross-btn-labeled', filamentDisabled && 'is-disabled')}
            aria-label="Выгрузить филамент"
            aria-disabled={filamentDisabled || undefined}
            onClick={() => handleFilamentClick(1)}
            disabled={disabled}
          >
            <span className="axis-cross-arrow" aria-hidden="true">↑</span>
            <span className="axis-cross-btn-label">Выгрузить</span>
          </button>
          <button
            type="button"
            className={joinClassNames('axis-cross-btn axis-cross-btn-labeled', filamentDisabled && 'is-disabled')}
            aria-label="Загрузить филамент"
            aria-disabled={filamentDisabled || undefined}
            onClick={() => handleFilamentClick(-1)}
            disabled={disabled}
          >
            <span className="axis-cross-arrow" aria-hidden="true">↓</span>
            <span className="axis-cross-btn-label">Загрузить</span>
          </button>
        </div>
      </div>
    </div>
  )
}

type VirtualJoystickProps = {
  onVectorChange: (vector: JoystickVector) => void
  onRelease?: () => void
  disabled?: boolean
  className?: string
  testId?: string
}

export function VirtualJoystick({
  onVectorChange,
  onRelease,
  disabled = false,
  className,
  testId,
}: VirtualJoystickProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const [handleOffset, setHandleOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })

  function resolveVector(clientX: number, clientY: number): {
    offsetX: number
    offsetY: number
    normalizedX: number
    normalizedY: number
  } | null {
    const surfaceElement = surfaceRef.current
    if (surfaceElement === null) {
      return null
    }

    const bounds = surfaceElement.getBoundingClientRect()
    const centerX = bounds.left + (bounds.width / 2)
    const centerY = bounds.top + (bounds.height / 2)
    const maxRadius = Math.max(1, (Math.min(bounds.width, bounds.height) / 2) - 28)

    let deltaX = clientX - centerX
    let deltaY = clientY - centerY
    const distance = Math.hypot(deltaX, deltaY)

    if (distance > maxRadius && distance > 0) {
      const scale = maxRadius / distance
      deltaX *= scale
      deltaY *= scale
    }

    return {
      offsetX: deltaX,
      offsetY: deltaY,
      normalizedX: Math.round((deltaX / maxRadius) * 100) / 100,
      normalizedY: Math.round((-deltaY / maxRadius) * 100) / 100,
    }
  }

  function pushVector(clientX: number, clientY: number): void {
    const nextVector = resolveVector(clientX, clientY)
    if (nextVector === null) {
      return
    }

    setHandleOffset({
      x: nextVector.offsetX,
      y: nextVector.offsetY,
    })
    onVectorChange({
      x: nextVector.normalizedX,
      y: nextVector.normalizedY,
    })
  }

  function releaseJoystick(): void {
    activePointerIdRef.current = null
    setHandleOffset({ x: 0, y: 0 })
    onVectorChange({ x: 0, y: 0 })
    onRelease?.()
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (disabled) {
      return
    }

    activePointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    pushVector(event.clientX, event.clientY)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (disabled || activePointerIdRef.current !== event.pointerId) {
      return
    }

    pushVector(event.clientX, event.clientY)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }

    releaseJoystick()
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>): void {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }

    releaseJoystick()
  }

  return (
    <div className={joinClassNames('virtual-joystick', className)}>
      <div
        ref={surfaceRef}
        className={joinClassNames('virtual-joystick-surface', disabled && 'is-disabled')}
        data-testid={testId}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <span className="virtual-joystick-cross" aria-hidden="true" />
        <span
          className="virtual-joystick-handle"
          aria-hidden="true"
          style={
            {
              '--joy-handle-x': `${handleOffset.x}px`,
              '--joy-handle-y': `${handleOffset.y}px`,
            } as CSSProperties
          }
        />
      </div>
    </div>
  )
}

type VerticalAxisSliderProps = {
  value: number
  min: number
  max: number
  step?: number
  onChange: (nextValue: number) => void
  minAtTop?: boolean
  disabled?: boolean
  className?: string
  testId?: string
}

function clampSliderValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

const HORIZONTAL_SLIDER_EDGE_INSET_PX = 20

export function VerticalAxisSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  minAtTop = false,
  disabled = false,
  className,
  testId,
}: VerticalAxisSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const [dragValue, setDragValue] = useState<number | null>(null)
  const normalizedMax = max > min ? max : min + 1
  const clampedValue = clampSliderValue(value, min, normalizedMax)
  const displayValue = dragValue ?? clampedValue
  const displayValueRatio = (displayValue - min) / (normalizedMax - min)
  const displayRatio = minAtTop ? 1 - displayValueRatio : displayValueRatio

  function resolveValue(clientY: number): number | null {
    const trackElement = trackRef.current
    if (trackElement === null) {
      return null
    }

    const bounds = trackElement.getBoundingClientRect()
    const clampedY = clampSliderValue(clientY, bounds.top, bounds.bottom)
    const ratioFromTop = (clampedY - bounds.top) / Math.max(1, bounds.height)
    const rawValueRatio = minAtTop ? ratioFromTop : 1 - ratioFromTop
    const nextValue = min + (rawValueRatio * (normalizedMax - min))

    return snapToStep(nextValue, min, normalizedMax, step)
  }

  function pushValue(clientY: number): void {
    const nextValue = resolveValue(clientY)
    if (nextValue === null) {
      return
    }

    const clampedNextValue = clampSliderValue(nextValue, min, normalizedMax)
    setDragValue(clampedNextValue)
    onChange(clampedNextValue)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (disabled) {
      return
    }

    activePointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    pushValue(event.clientY)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (disabled || activePointerIdRef.current !== event.pointerId) {
      return
    }

    pushValue(event.clientY)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }

    activePointerIdRef.current = null
    setDragValue(null)
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>): void {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }

    activePointerIdRef.current = null
    setDragValue(null)
  }

  return (
    <div className={joinClassNames('z-axis-slider', className)}>
      <div
        ref={trackRef}
        className={joinClassNames('z-axis-slider-track', disabled && 'is-disabled')}
        data-testid={testId}
        style={{ '--z-slider-progress': String(displayRatio) } as CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <span className="z-axis-slider-rail" aria-hidden="true" />
        <span className="z-axis-slider-fill" aria-hidden="true" />
        <span className="z-axis-slider-thumb" aria-hidden="true" />
      </div>
      <div className="z-axis-slider-ruler" aria-hidden="true">
        {Array.from({ length: 11 }, (_, index) => (
          <span
            key={`z-tick-${index}`}
            className={index % 5 === 0 ? 'is-major' : undefined}
          />
        ))}
      </div>
    </div>
  )
}

type HorizontalSteppedSliderProps = {
  value: number
  min: number
  max: number
  step: number
  onChange: (nextValue: number) => void
  disabled?: boolean
  onBlocked?: () => void
  className?: string
  testId?: string
}

function snapToStep(value: number, min: number, max: number, step: number): number {
  const safeStep = Math.max(1, step)
  const clampedValue = clampSliderValue(value, min, max)
  const steps = Math.round((clampedValue - min) / safeStep)
  return clampSliderValue(min + (steps * safeStep), min, max)
}

export function HorizontalSteppedSlider({
  value,
  min,
  max,
  step,
  onChange,
  disabled = false,
  onBlocked,
  className,
  testId,
}: HorizontalSteppedSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const [dragValue, setDragValue] = useState<number | null>(null)
  const normalizedMax = max > min ? max : min + 1
  const steppedValue = snapToStep(value, min, normalizedMax, step)
  const displayValue = dragValue ?? steppedValue
  const progressRatio = (displayValue - min) / (normalizedMax - min)
  const rulerTicksCount = Math.max(2, Math.floor((normalizedMax - min) / Math.max(1, step)) + 1)

  function resolveValue(clientX: number): number | null {
    const trackElement = trackRef.current
    if (trackElement === null) {
      return null
    }

    const bounds = trackElement.getBoundingClientRect()
    const interactionLeft = bounds.left + HORIZONTAL_SLIDER_EDGE_INSET_PX
    const interactionRight = bounds.right - HORIZONTAL_SLIDER_EDGE_INSET_PX
    const clampedX = clampSliderValue(clientX, interactionLeft, interactionRight)
    const ratio = (clampedX - interactionLeft) / Math.max(1, interactionRight - interactionLeft)
    const rawValue = min + (ratio * (normalizedMax - min))
    return snapToStep(rawValue, min, normalizedMax, step)
  }

  function pushValue(clientX: number): void {
    const nextValue = resolveValue(clientX)
    if (nextValue === null) {
      return
    }

    setDragValue(nextValue)
    onChange(nextValue)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (disabled) {
      onBlocked?.()
      return
    }

    activePointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    pushValue(event.clientX)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (disabled || activePointerIdRef.current !== event.pointerId) {
      return
    }

    pushValue(event.clientX)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }

    activePointerIdRef.current = null
    setDragValue(null)
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>): void {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }

    activePointerIdRef.current = null
    setDragValue(null)
  }

  return (
    <div className={joinClassNames('fan-slider', className)}>
      <div
        ref={trackRef}
        className={joinClassNames('fan-slider-track', disabled && 'is-disabled')}
        data-testid={testId}
        style={{ '--fan-slider-progress': String(progressRatio) } as CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <span className="fan-slider-rail" aria-hidden="true" />
        <span className="fan-slider-fill" aria-hidden="true" />
        <span className="fan-slider-thumb" aria-hidden="true" />
      </div>
      <div className="fan-slider-ruler" aria-hidden="true" style={{ '--fan-slider-ticks': String(rulerTicksCount) } as CSSProperties}>
        {Array.from({ length: rulerTicksCount }, (_, index) => (
          <span
            key={`fan-tick-${index}`}
            className={index % 4 === 0 ? 'is-major' : undefined}
            style={
              {
                '--fan-slider-tick-position': `${rulerTicksCount > 1 ? (index / (rulerTicksCount - 1)) * 100 : 0}%`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  )
}
