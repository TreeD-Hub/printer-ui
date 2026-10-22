import { type CSSProperties, useId, useLayoutEffect, useRef, useState } from 'react'
import { useModalFocus } from '../ui/useModalFocus'
import './printCompletion.css'

export type PrintCompletionModalProps = {
  filename: string
  printDurationSec: number
  filamentUsedMm: number
  weight: string
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
  filename, printDurationSec, filamentUsedMm, weight, rating, ratingStatus, ratingError, isRatingBusy, isRatingAvailable,
  onRate, onRetryRating, restartBlockReason, restartError, isPrintBusy, onRestart, onClose,
}: PrintCompletionModalProps) {
  const titleId = useId()
  const questionId = useId()
  const startHintId = useId()
  const [tableClear, setTableClear] = useState(false)
  const filenameRef = useRef<HTMLParagraphElement>(null)
  const filenameTextRef = useRef<HTMLSpanElement>(null)
  const [filenameOverflow, setFilenameOverflow] = useState(0)
  useLayoutEffect(() => {
    const container = filenameRef.current
    const text = filenameTextRef.current
    if (!container || !text) return
    let alive = true
    const measure = () => {
      if (alive) setFilenameOverflow(Math.max(0, text.scrollWidth - container.clientWidth))
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(container)
    void document.fonts?.ready.then(measure)
    return () => { alive = false; observer?.disconnect() }
  }, [filename])
  const close = () => { if (!isRatingBusy) onClose() }
  const dialogRef = useModalFocus<HTMLDivElement>(true, close)
  const startNotice = restartError || restartBlockReason
    || (isPrintBusy ? 'Принтер выполняет другую команду.' : '')
  const canRestart = tableClear && !isPrintBusy && !isRatingBusy && restartBlockReason === null
  const minutes = Math.round(printDurationSec / 60)
  const duration = Number.isFinite(printDurationSec) && printDurationSec > 0
    ? (minutes >= 60 ? `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, '0')} мин`
      : minutes > 0 ? `${minutes} мин` : `${Math.round(printDurationSec)} с`)
    : '—'
  const filament = Number.isFinite(filamentUsedMm) && filamentUsedMm > 0
    ? `${(filamentUsedMm / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} м` : '—'

  return (
    <div className="print-completion-backdrop">
      <div className="print-completion-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>Печать завершена</h2>
        <p className="print-completion-filename" ref={filenameRef}>
          <span ref={filenameTextRef} title={filename}
            className={`print-file-name-text${filenameOverflow > 0 ? ' is-scrollable' : ''}`}
            style={{ '--file-name-scroll-distance': `${filenameOverflow}px` } as CSSProperties}>{filename}</span>
        </p>
        <dl className="print-completion-summary">
          <div><dt>Время печати</dt><dd>{duration}</dd></div>
          <div><dt>Расход пластика</dt><dd>{filament}</dd></div>
          <div><dt>Масса по файлу</dt><dd>{weight}</dd></div>
        </dl>
        <div className="print-completion-question" id={questionId}>
          <p>Как получилась печать?</p>
        </div>
        <div className="print-completion-pair" role="group" aria-labelledby={questionId}>
          {(['good', 'bad'] as const).map((value) => (
            <button type="button" className="print-completion-button" key={value} data-rating={value} aria-pressed={rating === value}
              disabled={!isRatingAvailable || isRatingBusy || isPrintBusy} onClick={() => onRate(value)}>
              {rating === value && <span aria-hidden="true">✓ </span>}{value === 'good' ? 'Хорошо' : 'Плохо'}
            </button>
          ))}
        </div>
        <div className={`print-completion-status${ratingError || ratingStatus ? '' : ' visually-hidden'}`}>
          <p role="status" aria-live="polite">{ratingError || ratingStatus}</p>
          {ratingError && <button type="button" className="print-completion-button" disabled={isRatingBusy || isPrintBusy}
            onClick={onRetryRating}>Повторить</button>}
        </div>
        <label className="print-completion-table">
          <input type="checkbox" checked={tableClear} disabled={isPrintBusy} onChange={(event) => setTableClear(event.target.checked)} />
          <span>Деталь снята со стола</span>
        </label>
        <p className={`print-completion-start-notice${startNotice ? '' : ' visually-hidden'}`} id={startHintId} role="status">{startNotice}</p>
        <div className="print-completion-pair">
          <button type="button" className="print-completion-button" data-modal-initial-focus disabled={isRatingBusy} onClick={close}>Закрыть</button>
          <button type="button" className="print-completion-button print-completion-restart" aria-describedby={startHintId}
            disabled={!canRestart} onClick={() => { if (canRestart) onRestart() }}>Печатать снова</button>
        </div>
      </div>
    </div>
  )
}
