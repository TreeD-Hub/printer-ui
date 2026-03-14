import { PrintPreviewIcon } from './PrintPreviewIcon'
import { joinClassNames } from './classNames'

type PrintFileCardProps = {
  name: string
  printTime: string
  weight: string
  onClick?: () => void
  className?: string
}

export function PrintFileCard({ name, printTime, weight, onClick, className }: PrintFileCardProps) {
  return (
    <button
      type="button"
      className={joinClassNames('print-file-card', className)}
      data-testid="print-file-card"
      onClick={onClick}
    >
      <div className="print-file-preview" aria-hidden="true">
        <PrintPreviewIcon />
      </div>

      <div className="print-file-summary">
        <p className="print-file-name">{name}</p>

        <dl className="print-file-meta">
          <div className="print-file-meta-row">
            <dt>Время печати</dt>
            <dd>{printTime}</dd>
          </div>
          <div className="print-file-meta-row">
            <dt>Масса</dt>
            <dd>{weight}</dd>
          </div>
        </dl>
      </div>
    </button>
  )
}
