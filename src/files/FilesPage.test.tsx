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
})
