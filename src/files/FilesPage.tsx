import { type CSSProperties, type UIEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  sortPrinterFileItems,
  type PrinterFileItem,
  type PrinterFileSortKey,
} from '@treed/printer-logic'
import type { PrinterFileListStatusSnapshot } from '../core/transport/types'
import { PrintFileCard } from '../ui'

const FILES_SORT_OPTIONS: Array<{ id: PrinterFileSortKey; label: string }> = [
  { id: 'name', label: 'По имени' },
  { id: 'addedAt', label: 'По дате' },
]
const FILE_NAME_VISIBLE_CHARS = 24
const FILE_NAME_MIN_SCROLL_DURATION_SEC = 8
const FILE_NAME_MAX_SCROLL_DURATION_SEC = 28
const FILES_GRID_COLUMNS = 4
const FILES_VIRTUAL_ROW_HEIGHT_PX = 292
const FILES_MIN_METADATA_WINDOW = 24
const FILES_OVERSCAN_ROWS = 1
const FILES_VIEWPORT_FALLBACK_HEIGHT_PX = 544

type FilesPageProps = {
  files: PrinterFileItem[]
  fileListStatus?: PrinterFileListStatusSnapshot
  onFileSelect: (fileId: string) => void
  onMetadataRequest?: (paths: string[]) => void
}

function getFilesEmptyMessage(fileListStatus?: PrinterFileListStatusSnapshot): string {
  if (fileListStatus?.state === 'error') {
    return fileListStatus.message
      ? `Файлы Moonraker недоступны: ${fileListStatus.message}`
      : 'Файлы Moonraker недоступны.'
  }

  if (fileListStatus?.state === 'unknown') {
    return 'Загрузка файлов Moonraker...'
  }

  return 'G-code файлы не найдены.'
}

function getFileNameScrollDurationSec(files: readonly PrinterFileItem[]): number {
  const longestNameLength = files.reduce((longestLength, item) => Math.max(longestLength, item.name.length), 0)
  const overflowChars = Math.max(0, longestNameLength - FILE_NAME_VISIBLE_CHARS)

  return Math.min(
    FILE_NAME_MAX_SCROLL_DURATION_SEC,
    Math.max(FILE_NAME_MIN_SCROLL_DURATION_SEC, 4 + (overflowChars * 0.28)),
  )
}

function formatFileDate(addedAt: string): string {
  const date = new Date(addedAt)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

export function FilesPage({ files, fileListStatus, onFileSelect, onMetadataRequest }: FilesPageProps) {
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const [sortKey, setSortKey] = useState<PrinterFileSortKey>('addedAt')
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(FILES_VIEWPORT_FALLBACK_HEIGHT_PX)
  const sortedFiles = useMemo(() => sortPrinterFileItems(files, sortKey), [files, sortKey])
  const fileNameScrollDurationSec = useMemo(() => getFileNameScrollDurationSec(sortedFiles), [sortedFiles])
  const virtualWindow = useMemo(() => {
    const totalRows = Math.ceil(sortedFiles.length / FILES_GRID_COLUMNS)
    const scrolledRow = Math.floor(scrollTop / FILES_VIRTUAL_ROW_HEIGHT_PX)
    const viewportRows = Math.ceil(viewportHeight / FILES_VIRTUAL_ROW_HEIGHT_PX)
    const minimumWindowRows = Math.ceil(FILES_MIN_METADATA_WINDOW / FILES_GRID_COLUMNS)
    const windowRows = Math.max(minimumWindowRows, viewportRows + (FILES_OVERSCAN_ROWS * 2))
    const maxStartRow = Math.max(0, totalRows - windowRows)
    const startRow = Math.min(maxStartRow, Math.max(0, scrolledRow - FILES_OVERSCAN_ROWS))
    const endRow = Math.min(totalRows, startRow + windowRows)
    const startIndex = startRow * FILES_GRID_COLUMNS
    const endIndex = Math.min(sortedFiles.length, endRow * FILES_GRID_COLUMNS)

    return {
      startIndex,
      endIndex,
      topSpacerHeight: startRow * FILES_VIRTUAL_ROW_HEIGHT_PX,
      bottomSpacerHeight: Math.max(0, totalRows - endRow) * FILES_VIRTUAL_ROW_HEIGHT_PX,
    }
  }, [scrollTop, sortedFiles.length, viewportHeight])
  const visibleFiles = useMemo(
    () => sortedFiles.slice(virtualWindow.startIndex, virtualWindow.endIndex),
    [sortedFiles, virtualWindow.endIndex, virtualWindow.startIndex],
  )
  const metadataRequest = useMemo(() => {
    const paths = visibleFiles
      .filter((item) => (
        item.metadataStatus !== 'ready' &&
        item.metadataStatus !== 'loading' &&
        item.metadataStatus !== 'queued'
      ))
      .map((item) => item.path)

    return {
      key: paths.join('\n'),
      paths,
    }
  }, [visibleFiles])
  const filesGridStyle = {
    '--file-name-scroll-duration': `${fileNameScrollDurationSec}s`,
  } as CSSProperties

  function handleSortChange(nextSortKey: PrinterFileSortKey): void {
    if (nextSortKey === sortKey) {
      return
    }

    setSortKey(nextSortKey)
  }

  function handleScroll(event: UIEvent<HTMLDivElement>): void {
    const scrollArea = event.currentTarget
    setScrollTop(scrollArea.scrollTop)
    setViewportHeight(scrollArea.clientHeight || FILES_VIEWPORT_FALLBACK_HEIGHT_PX)
  }

  useEffect(() => {
    const scrollArea = scrollAreaRef.current
    if (scrollArea !== null) {
      setViewportHeight(scrollArea.clientHeight || FILES_VIEWPORT_FALLBACK_HEIGHT_PX)
    }
  }, [])

  useEffect(() => {
    if (onMetadataRequest === undefined || metadataRequest.paths.length === 0) {
      return
    }

    onMetadataRequest(metadataRequest.paths)
  }, [metadataRequest.key, metadataRequest.paths, onMetadataRequest])

  return (
    <section className="files-screen" data-testid="screen-files">
      <div
        className="files-scroll-area"
        data-testid="files-scroll-area"
        ref={scrollAreaRef}
        onScroll={handleScroll}
      >
        <header className="files-screen-head">
          <div className="files-screen-copy">
            <p className="files-screen-note">Прокрутите вниз, чтобы найти нужную модель.</p>
          </div>
          <div className="files-sort-group" role="group" aria-label="Сортировка файлов">
            <span className="files-sort-indicator" aria-hidden="true" />
            {FILES_SORT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`files-sort-btn ${sortKey === option.id ? 'is-active' : ''}`}
                aria-pressed={sortKey === option.id}
                data-testid={`files-sort-${option.id}`}
                onClick={() => handleSortChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        <div className="files-grid" data-testid="file-card-grid" style={filesGridStyle}>
          {sortedFiles.length > 0 ? (
            <>
              {virtualWindow.topSpacerHeight > 0 ? (
                <span
                  className="files-virtual-spacer"
                  style={{ height: virtualWindow.topSpacerHeight }}
                  aria-hidden="true"
                />
              ) : null}
              {visibleFiles.map((item) => (
                <PrintFileCard
                  key={item.id}
                  name={item.name}
                  directory={item.directory}
                  printTime={item.printTime}
                  weight={item.weight}
                  material={item.material}
                  addedAt={formatFileDate(item.addedAt)}
                  metadataStatus={item.metadataStatus}
                  preview={item.preview}
                  isNameScrollable={item.name.length > FILE_NAME_VISIBLE_CHARS}
                  onClick={() => onFileSelect(item.id)}
                />
              ))}
              {virtualWindow.bottomSpacerHeight > 0 ? (
                <span
                  className="files-virtual-spacer"
                  style={{ height: virtualWindow.bottomSpacerHeight }}
                  aria-hidden="true"
                />
              ) : null}
            </>
          ) : (
            <p className="files-empty" data-testid="files-empty">
              {getFilesEmptyMessage(fileListStatus)}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
