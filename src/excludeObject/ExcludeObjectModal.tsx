import type { PrinterSnapshot } from '../core/transport/types'
import { ExcludeObjectList } from './ExcludeObjectList'
import { ExcludeObjectMap } from './ExcludeObjectMap'
import { useExcludeObjectController } from './useExcludeObjectController'
import type { ExcludeObjectControllerArgs } from './types'

const EXCLUDE_OBJECT_MODAL_TITLE_ID = 'exclude-object-modal-title'

type ExcludeObjectModalProps = ExcludeObjectControllerArgs

function getEmptyStateMessage(snapshot: PrinterSnapshot): string | null {
  if (!snapshot.excludeObjects.supported || snapshot.excludeObjects.state === 'unavailable') {
    return snapshot.excludeObjects.message ?? 'Исключение объектов не поддерживается текущей конфигурацией принтера.'
  }

  if (snapshot.excludeObjects.objects.length === 0) {
    return snapshot.excludeObjects.message ?? 'Получение списка объектов...'
  }

  return null
}

export function ExcludeObjectModal(props: ExcludeObjectModalProps) {
  const {
    snapshot,
    isOpen,
  } = props
  const controller = useExcludeObjectController(props)

  if (!isOpen) {
    return null
  }

  const emptyStateMessage = getEmptyStateMessage(snapshot)
  const selectedDisplayName = controller.selectedObject?.displayName ?? 'Не выбрана'
  const confirmationDisplayName = controller.confirmationObject?.displayName ?? ''
  const showConfirmation = controller.confirmationObject !== null
  const submitDisabled = controller.isCommandPending || controller.selectedObject === null || (
    controller.submitBlockReason !== null && !controller.submitBlockReason.includes('последняя оставшаяся')
  )

  return (
    <div className="exclude-object-modal-layer" role="presentation" onClick={controller.close}>
      <section
        className="exclude-object-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={EXCLUDE_OBJECT_MODAL_TITLE_ID}
        data-testid="exclude-object-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="exclude-object-modal-head">
          <div>
            <h2 id={EXCLUDE_OBJECT_MODAL_TITLE_ID}>Исключение объектов</h2>
            <p>Выберите дефектную деталь. Остальные объекты продолжат печататься.</p>
          </div>
          <button
            type="button"
            className="print-cancel-modal-close"
            aria-label="Закрыть окно исключения объектов"
            onClick={controller.close}
            disabled={controller.isCommandPending}
          >
            ×
          </button>
        </header>

        <div className="exclude-object-modal-body">
          <div className="exclude-object-map-wrap">
            {snapshot.excludeObjects.objects.length > 0 ? (
              <ExcludeObjectMap
                objects={snapshot.excludeObjects.objects}
                limits={snapshot.limits}
                selectedObjectName={controller.selectedObject?.name ?? null}
                pendingObjectName={controller.pendingObjectName}
                onSelect={controller.selectObject}
              />
            ) : (
              <div className="exclude-object-empty-map" aria-live="polite">
                {emptyStateMessage}
              </div>
            )}
          </div>

          <aside className="exclude-object-side">
            <ExcludeObjectList
              objects={snapshot.excludeObjects.objects}
              selectedObjectName={controller.selectedObject?.name ?? null}
              pendingObjectName={controller.pendingObjectName}
              onSelect={controller.selectObject}
            />

            <div className="exclude-object-selection">
              <span>Выбрано</span>
              <strong data-testid="exclude-object-selected-name">{selectedDisplayName}</strong>
            </div>

            {emptyStateMessage !== null ? (
              <p className="exclude-object-message" data-testid="exclude-object-empty-message">{emptyStateMessage}</p>
            ) : null}
            {controller.notice !== null ? (
              <p className="exclude-object-message" data-testid="exclude-object-notice">{controller.notice}</p>
            ) : null}
            {controller.submitBlockReason !== null && controller.selectedObject !== null ? (
              <p className="exclude-object-message">{controller.submitBlockReason}</p>
            ) : null}

            <button
              type="button"
              className="file-modal-action file-modal-action-danger exclude-object-submit"
              data-testid="exclude-object-submit"
              disabled={submitDisabled}
              onClick={controller.requestSubmit}
            >
              {controller.isCommandPending ? 'Исключение...' : controller.submitLabel}
            </button>
          </aside>
        </div>

        {showConfirmation ? (
          <div className="exclude-object-confirm" role="alertdialog" aria-modal="true">
            <div className="exclude-object-confirm-dialog">
              <h3>{`Исключить «${confirmationDisplayName}»?`}</h3>
              <p>Движения и экструзия внутри этой детали будут пропущены.</p>
              <p>Остальные детали продолжат печататься.</p>
              <div className="print-cancel-modal-actions">
                <button
                  type="button"
                  className="file-modal-action"
                  onClick={controller.cancelConfirmation}
                  disabled={controller.isCommandPending}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="file-modal-action file-modal-action-danger"
                  data-testid="exclude-object-confirm-submit"
                  onClick={() => void controller.confirmExclude()}
                  disabled={controller.isCommandPending}
                >
                  Исключить
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
