import type { KeyboardEvent } from 'react'
import type { PrinterExcludeObjectItem, PrinterLimits } from '@treed/printer-logic'
import { joinClassNames } from '../ui'
import { getExcludeObjectTestIdSuffix } from './helpers'

type ExcludeObjectMapProps = {
  objects: PrinterExcludeObjectItem[]
  limits: PrinterLimits
  selectedObjectName: string | null
  pendingObjectName: string | null
  onSelect: (objectName: string) => void
}

function getObjectStateClass(
  object: PrinterExcludeObjectItem,
  selectedObjectName: string | null,
  pendingObjectName: string | null,
): string {
  if (object.isExcluded) {
    return 'is-excluded'
  }
  if (object.name === pendingObjectName) {
    return 'is-pending'
  }
  if (object.name === selectedObjectName) {
    return 'is-selected'
  }
  if (object.isCurrent) {
    return 'is-current'
  }

  return 'is-regular'
}

export function ExcludeObjectMap({
  objects,
  limits,
  selectedObjectName,
  pendingObjectName,
  onSelect,
}: ExcludeObjectMapProps) {
  const xMin = limits.axis.X.min
  const xMax = limits.axis.X.max
  const yMin = limits.axis.Y.min
  const yMax = limits.axis.Y.max
  const width = Math.max(1, xMax - xMin)
  const height = Math.max(1, yMax - yMin)

  function toSvgPoint(point: { x: number, y: number }): { x: number, y: number } {
    return {
      x: point.x - xMin,
      y: yMax - point.y,
    }
  }

  return (
    <div className="exclude-object-map-panel">
      <svg
        className="exclude-object-map"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Карта объектов на столе"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect className="exclude-object-bed" x={0} y={0} width={width} height={height} rx={2} />
        {objects.map((object) => {
          const stateClassName = getObjectStateClass(object, selectedObjectName, pendingObjectName)
          const className = joinClassNames('exclude-object-shape', stateClassName)
          const disabled = object.isExcluded || object.name === pendingObjectName
          const commonProps = {
            className,
            role: disabled ? undefined : 'button',
            tabIndex: disabled ? undefined : 0,
            'aria-label': object.displayName,
            'aria-disabled': disabled ? true : undefined,
            onClick: disabled ? undefined : () => onSelect(object.name),
            onKeyDown: disabled
              ? undefined
              : (event: KeyboardEvent<SVGElement>) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(object.name)
                  }
                },
            'data-testid': `exclude-object-map-item-${getExcludeObjectTestIdSuffix(object.name)}`,
          }

          if (object.polygon !== null) {
            const points = object.polygon
              .map(toSvgPoint)
              .map((point) => `${point.x},${point.y}`)
              .join(' ')

            return <polygon key={object.name} points={points} {...commonProps} />
          }

          if (object.center !== null) {
            const center = toSvgPoint(object.center)
            return <circle key={object.name} cx={center.x} cy={center.y} r={Math.max(width, height) * 0.025} {...commonProps} />
          }

          return null
        })}
      </svg>
      <div className="exclude-object-map-legend" aria-hidden="true">
        <span className="legend-regular">Обычный</span>
        <span className="legend-current">Текущий</span>
        <span className="legend-selected">Выбран</span>
        <span className="legend-excluded">Исключён</span>
      </div>
    </div>
  )
}
