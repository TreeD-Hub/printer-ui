import { useMemo, useState } from 'react'
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

type FilesPageProps = {
  files: PrinterFileItem[]
  fileListStatus?: PrinterFileListStatusSnapshot
  onFileSelect: (fileId: string) => void
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

export function FilesPage({ files, fileListStatus, onFileSelect }: FilesPageProps) {
  const [sortKey, setSortKey] = useState<PrinterFileSortKey>('name')
  const sortedFiles = useMemo(() => sortPrinterFileItems(files, sortKey), [files, sortKey])

  function handleSortChange(nextSortKey: PrinterFileSortKey): void {
    if (nextSortKey === sortKey) {
      return
    }

    setSortKey(nextSortKey)
  }

  return (
    <section className="files-screen" data-testid="screen-files">
      <div className="files-scroll-area" data-testid="files-scroll-area">
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

        <div className="files-grid" data-testid="file-card-grid">
          {sortedFiles.length > 0 ? (
            sortedFiles.map((item) => (
              <PrintFileCard
                key={item.id}
                name={item.name}
                directory={item.directory}
                printTime={item.printTime}
                weight={item.weight}
                onClick={() => onFileSelect(item.id)}
              />
            ))
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
