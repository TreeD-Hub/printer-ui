import { type CSSProperties, useState } from 'react'
import type { PrinterFileMetadataStatus, PrinterFilePreview } from '@treed/printer-logic'
import { PrintPreviewIcon } from './PrintPreviewIcon'
import { joinClassNames } from './classNames'
import { getPreferredPreviewImage, getPreviewSrcSet } from './printFilePreview'

type PrintFileCardProps = {
  name: string
  directory?: string | null
  printTime: string
  weight: string
  material?: string
  addedAt?: string
  metadataStatus?: PrinterFileMetadataStatus
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
  material = '—',
  addedAt = '—',
  metadataStatus,
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
  const isMetadataLoading = metadataStatus === 'idle' || metadataStatus === 'queued' || metadataStatus === 'loading'

  return (
    <button
      type="button"
      className={joinClassNames('print-file-card', isMetadataLoading && 'is-metadata-loading', className)}
      data-testid="print-file-card"
      aria-busy={isMetadataLoading || undefined}
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
          <PrintFileMetaRow label="Время печати" value={printTime} isLoading={isMetadataLoading} />
          <PrintFileMetaRow label="Масса" value={weight} isLoading={isMetadataLoading} />
          <PrintFileMetaRow label="Материал" value={material} isLoading={isMetadataLoading} />
          <PrintFileMetaRow label="Дата" value={addedAt} isLoading={false} />
        </dl>
      </div>
    </button>
  )
}

type PrintFileMetaRowProps = {
  label: string
  value: string
  isLoading: boolean
}

function PrintFileMetaRow({ label, value, isLoading }: PrintFileMetaRowProps) {
  return (
    <div className="print-file-meta-row">
      <dt>{label}</dt>
      <dd>
        {isLoading ? (
          <span className="print-file-meta-skeleton" data-testid="print-file-meta-loading" />
        ) : (
          value
        )}
      </dd>
    </div>
  )
}
