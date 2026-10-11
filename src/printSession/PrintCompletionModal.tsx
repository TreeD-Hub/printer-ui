import { useId, useState } from 'react'
import { useModalFocus } from '../ui/useModalFocus'
import './printCompletion.css'

export type PrintCompletionModalProps = {
  filename: string
  rating: 'good' | 'bad' | null
  ratingStatus: string
  ratingError: string | null
  isRatingBusy: boolean
  isRatingAvailable: boolean
  onRate: (rating: 'good' | 'bad') => void
  onRetryRating: () => void
  restartBlockReason: string | null
  restartError: string | null
  isPrintBusy: boolean
  onRestart: () => void
  onClose: () => void
}

export function PrintCompletionModal({
  filename, rating, ratingStatus, ratingError, isRatingBusy, isRatingAvailable,
  onRate, onRetryRating, restartBlockReason, restartError, isPrintBusy, onRestart, onClose,
}: PrintCompletionModalProps) {
  const titleId = useId()
  const questionId = useId()
  const startHintId = useId()
  const [tableClear, setTableClear] = useState(false)
  const close = () => { if (!isRatingBusy) onClose() }
  const dialogRef = useModalFocus<HTMLDivElement>(true, close)
  const startNotice = restartError || restartBlockReason
    || (isPrintBusy ? 'Принтер выполняет другую команду.' : '')
    || (isRatingBusy ? 'Дождитесь сохранения оценки.' : '')
    || (!tableClear ? 'Подтвердите, что деталь снята со стола.' : '')
  const canRestart = tableClear && !isPrintBusy && !isRatingBusy && restartBlockReason === null

  return (
    <div className="print-completion-backdrop">
      <div className="print-completion-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>Печать завершена</h2>
        <p className="print-completion-filename" title={filename}>{filename}</p>
        <div className="print-completion-question" id={questionId}>
          <p>Как получилась печать?</p><p className="print-completion-help">Оценка необязательна</p>
        </div>
        <div className="print-completion-pair" role="group" aria-labelledby={questionId}>
          {(['good', 'bad'] as const).map((value) => (
            <button type="button" className="print-completion-button" key={value} aria-pressed={rating === value}
              disabled={!isRatingAvailable || isRatingBusy || isPrintBusy} onClick={() => onRate(value)}>
              {rating === value && <span aria-hidden="true">✓ </span>}{value === 'good' ? 'Хорошо' : 'Плохо'}
            </button>
          ))}
        </div>
        <div className="print-completion-status">
          <p role="status" aria-live="polite">{ratingError || ratingStatus}</p>
          {ratingError && <button type="button" className="print-completion-button" disabled={isRatingBusy || isPrintBusy}
            onClick={onRetryRating}>Повторить</button>}
        </div>
        <label className="print-completion-table">
          <input type="checkbox" checked={tableClear} disabled={isPrintBusy} onChange={(event) => setTableClear(event.target.checked)} />
          <span>Деталь снята со стола. Можно печатать снова</span>
        </label>
        <p className="print-completion-start-notice" id={startHintId} role="status">{startNotice}</p>
        <div className="print-completion-pair">
          <button type="button" className="print-completion-button" data-modal-initial-focus disabled={isRatingBusy} onClick={close}>Закрыть</button>
          <button type="button" className="print-completion-button print-completion-restart" aria-describedby={startHintId}
            disabled={!canRestart} onClick={() => { if (canRestart) onRestart() }}>Печатать снова</button>
        </div>
      </div>
    </div>
  )
}
