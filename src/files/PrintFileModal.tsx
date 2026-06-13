import type { PrinterCommandId } from '../core/commands'
import type { PrintFileItem } from '../printFiles'
import { PrintPreviewIcon } from '../ui'

const FILE_MODAL_TITLE_ID = 'print-file-modal-title'

type PrintFileModalProps = {
  file: PrintFileItem
  notice: string | null
  isBusy: boolean
  pendingCommand: PrinterCommandId | null
  isStartBlocked: boolean
  onClose: () => void
  onStart: () => void
  onDelete: () => void
}

export function PrintFileModal({
  file,
  notice,
  isBusy,
  pendingCommand,
  isStartBlocked,
  onClose,
  onStart,
  onDelete,
}: PrintFileModalProps) {
  return (
    <div className="file-modal-layer" role="presentation" onClick={onClose}>
      <section
        className="file-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={FILE_MODAL_TITLE_ID}
        data-testid="print-file-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="file-modal-head">
          <h2 id={FILE_MODAL_TITLE_ID}>Файл печати</h2>
          <button type="button" className="file-modal-close" aria-label="Закрыть окно файла" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="file-modal-preview" aria-hidden="true">
          <PrintPreviewIcon />
        </div>

        <p className="file-modal-name">{file.name}</p>

        <dl className="file-modal-meta">
          <div>
            <dt>Время печати</dt>
            <dd>{file.printTime}</dd>
          </div>
          <div>
            <dt>Масса</dt>
            <dd>{file.weight}</dd>
          </div>
          <div>
            <dt>Материал</dt>
            <dd>{file.material}</dd>
          </div>
          {file.directory !== null ? (
            <div className="file-modal-path">
              <dt>Путь</dt>
              <dd>{file.path}</dd>
            </div>
          ) : null}
        </dl>

        {notice !== null && notice.length > 0 ? (
          <p className="file-modal-notice" data-testid="print-file-start-notice">{notice}</p>
        ) : null}

        <div className="file-modal-actions">
          <button
            type="button"
            className="file-modal-action"
            data-testid="print-file-start-button"
            onClick={onStart}
            disabled={isBusy || isStartBlocked}
          >
            {pendingCommand === 'start' ? 'Запуск...' : 'Старт печати'}
          </button>
          <button
            type="button"
            className="file-modal-action file-modal-action-danger"
            data-testid="print-file-delete-button"
            onClick={onDelete}
            disabled={isBusy}
          >
            Удалить файл
          </button>
        </div>
      </section>
    </div>
  )
}
