import type { PrinterExcludeObjectItem } from '@treed/printer-logic'
import { joinClassNames } from '../ui'
import { getExcludeObjectTestIdSuffix } from './helpers'

type ExcludeObjectListProps = {
  objects: PrinterExcludeObjectItem[]
  selectedObjectName: string | null
  pendingObjectName: string | null
  onSelect: (objectName: string) => void
}

function getObjectStatus(object: PrinterExcludeObjectItem, pendingObjectName: string | null): string {
  if (object.isExcluded) {
    return 'Исключён'
  }
  if (object.name === pendingObjectName) {
    return 'Исключение...'
  }
  if (object.isCurrent) {
    return 'Текущий'
  }
  if (object.polygon === null && object.center === null) {
    return 'Без геометрии'
  }

  return 'Доступен'
}

export function ExcludeObjectList({
  objects,
  selectedObjectName,
  pendingObjectName,
  onSelect,
}: ExcludeObjectListProps) {
  return (
    <div className="exclude-object-list" role="list" aria-label="Список объектов печати">
      {objects.map((object) => {
        const disabled = object.isExcluded || object.name === pendingObjectName
        return (
          <button
            key={object.name}
            type="button"
            className={joinClassNames(
              'exclude-object-list-item',
              object.name === selectedObjectName && 'is-selected',
              object.isCurrent && 'is-current',
              object.isExcluded && 'is-excluded',
            )}
            aria-pressed={object.name === selectedObjectName}
            disabled={disabled}
            onClick={() => onSelect(object.name)}
            data-testid={`exclude-object-list-item-${getExcludeObjectTestIdSuffix(object.name)}`}
          >
            <span>{object.displayName}</span>
            <strong>{getObjectStatus(object, pendingObjectName)}</strong>
          </button>
        )
      })}
    </div>
  )
}
