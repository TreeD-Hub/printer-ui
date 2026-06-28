import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FilesPage } from './FilesPage'

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
})
