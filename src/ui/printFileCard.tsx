import { type CSSProperties, useState } from 'react'
import type { PrinterFilePreview } from '@treed/printer-logic'
import { PrintPreviewIcon } from './PrintPreviewIcon'
import { joinClassNames } from './classNames'
import { getPreferredPreviewImage, getPreviewSrcSet } from './printFilePreview'

type PrintFileCardProps = {
  name: string
  directory?: string | null
  printTime: string
  weight: string
  preview?: PrinterFilePreview
  isNameScrollable?: boolean
  onClick?: () => void
  className?: string
}

export function PrintFileCard({
  name,
  directory = null,
  printTime,
  weight,
  preview,
  isNameScrollable = false,
  onClick,
  className,
}: PrintFileCardProps) {
  const preferredPreview = getPreferredPreviewImage(preview)
  const [failedPreviewSrc, setFailedPreviewSrc] = useState<string | null>(null)
  const previewImage = preferredPreview !== null && preferredPreview.src !== failedPreviewSrc
    ? preferredPreview
    : null

  return (
    <button
      type="button"
      className={joinClassNames('print-file-card', className)}
      data-testid="print-file-card"
      onClick={onClick}
    >
      <div className={joinClassNames('print-file-preview', previewImage !== null && 'has-image')} aria-hidden={previewImage === null ? 'true' : undefined}>
        {previewImage !== null ? (
          <img
            className="print-file-preview-image"
            src={previewImage.src}
            srcSet={getPreviewSrcSet(preview)}
            sizes="160px"
            width={previewImage.width}
            height={previewImage.height}
            alt={`Предпросмотр ${name}`}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailedPreviewSrc(previewImage.src)}
          />
        ) : (
          <PrintPreviewIcon />
        )}
      </div>

      <div className="print-file-summary">
        <p className="print-file-name">
          <span
            className={joinClassNames('print-file-name-text', isNameScrollable && 'is-scrollable')}
            style={{ '--file-name-scroll-distance': `${Math.max(0, name.length - 24)}ch` } as CSSProperties}
          >
            {name}
          </span>
        </p>
        {directory !== null ? <p className="print-file-directory">{directory}</p> : null}

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
