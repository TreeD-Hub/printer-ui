import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PrinterFileItem } from '@treed/printer-logic'

import { FilesPage } from './FilesPage'

function createFile(index: number, overrides: Partial<PrinterFileItem> = {}): PrinterFileItem {
  const addedAt = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()

  return {
    id: `file-${index}`,
    path: `queue/part-${index}.gcode`,
    name: `part-${index}.gcode`,
    directory: 'queue',
    printTime: '—',
    weight: '—',
    material: '—',
    addedAt,
    metadataStatus: 'idle',
    ...overrides,
  }
}

describe('FilesPage', () => {
  it('shows Moonraker file-list errors instead of a fake empty state', () => {
    render(
      <FilesPage
        files={[]}
        fileListStatus={{ state: 'error', message: 'Moonraker 503' }}
        onFileSelect={vi.fn()}
      />,
    )

    expect(screen.getByTestId('files-empty')).toHaveTextContent('Файлы Moonraker недоступны: Moonraker 503')
  })

  it('renders normalized PNG previews and syncs filename scroll timing from the longest name', () => {
    render(
      <FilesPage
        files={[
          {
            id: 'file-short',
            path: 'short.gcode',
            name: 'short.gcode',
            directory: null,
            printTime: '12 мин',
            weight: '4 г',
            material: 'PLA',
            addedAt: '2026-01-02T00:00:00.000Z',
            preview: {
              small: {
                src: 'http://127.0.0.1:7125/server/files/gcodes/.thumbs/short-48x48.png',
                width: 48,
                height: 48,
                format: 'png',
              },
              large: {
                src: 'http://127.0.0.1:7125/server/files/gcodes/.thumbs/short-300x300.png',
                width: 300,
                height: 300,
                format: 'png',
              },
            },
          },
          {
            id: 'file-long',
            path: 'very-long-file-name-that-needs-scroll.gcode',
            name: 'very-long-file-name-that-needs-scroll.gcode',
            directory: null,
            printTime: '1 ч',
            weight: '18 г',
            material: 'PETG',
            addedAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
        onFileSelect={vi.fn()}
      />,
    )

    const previewImage = screen.getByAltText('Предпросмотр short.gcode')
    expect(previewImage).toHaveAttribute('src', 'http://127.0.0.1:7125/server/files/gcodes/.thumbs/short-300x300.png')
    expect(previewImage).toHaveAttribute('loading', 'lazy')
    expect(previewImage).toHaveAttribute('decoding', 'async')
    expect(screen.getByTestId('file-card-grid').getAttribute('style')).toContain('--file-name-scroll-duration')
    expect(screen.getByText('very-long-file-name-that-needs-scroll.gcode')).toHaveClass('is-scrollable')
  })

  it('defaults to newest files first and requests metadata for the initial virtual window', async () => {
    const onMetadataRequest = vi.fn()
    const files = [
      createFile(1, { name: 'z-old.gcode', addedAt: '2026-01-01T00:00:00.000Z' }),
      createFile(2, { name: 'a-new.gcode', addedAt: '2026-01-03T00:00:00.000Z' }),
      createFile(3, { name: 'm-middle.gcode', addedAt: '2026-01-02T00:00:00.000Z' }),
    ]

    render(
      <FilesPage
        files={files}
        onMetadataRequest={onMetadataRequest}
        onFileSelect={vi.fn()}
      />,
    )

    const cards = screen.getAllByTestId('print-file-card')
    expect(cards[0]).toHaveTextContent('a-new.gcode')
    expect(cards[1]).toHaveTextContent('m-middle.gcode')
    expect(cards[2]).toHaveTextContent('z-old.gcode')
    await vi.waitFor(() => {
      expect(onMetadataRequest).toHaveBeenCalledWith([
        'queue/part-2.gcode',
        'queue/part-3.gcode',
        'queue/part-1.gcode',
      ])
    })
  })

  it('renders a virtual window and requests the next metadata range while scrolling', async () => {
    const onMetadataRequest = vi.fn()
    const files = Array.from({ length: 40 }, (_item, index) => (
      createFile(index, {
        addedAt: new Date(Date.UTC(2026, 0, 1, 0, 40 - index)).toISOString(),
      })
    ))

    render(
      <FilesPage
        files={files}
        onMetadataRequest={onMetadataRequest}
        onFileSelect={vi.fn()}
      />,
    )
    const scrollArea = screen.getByTestId('files-scroll-area')
    Object.defineProperty(scrollArea, 'clientHeight', { configurable: true, value: 544 })

    await vi.waitFor(() => {
      expect(onMetadataRequest).toHaveBeenCalledWith(files.slice(0, 24).map((item) => item.path))
    })
    expect(screen.getAllByTestId('print-file-card')).toHaveLength(24)

    await act(async () => {
      fireEvent.scroll(scrollArea, { target: { scrollTop: 1_752 } })
    })

    await vi.waitFor(() => {
      expect(onMetadataRequest).toHaveBeenLastCalledWith(files.slice(16, 40).map((item) => item.path))
    })
    expect(screen.getByText('part-39.gcode')).toBeInTheDocument()
  })
})
