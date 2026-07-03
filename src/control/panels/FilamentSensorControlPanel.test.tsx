import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FilamentSensorControlPanel } from './FilamentSensorControlPanel'
import type { FilamentSensorControlPanelProps } from '../types'

function createProps(overrides: Partial<FilamentSensorControlPanelProps> = {}): FilamentSensorControlPanelProps {
  return {
    snapshot: {
      supported: true,
      motionSupported: true,
      mode: 'presence',
      sensitivity: 'medium',
      filamentDetected: true,
      switchEnabled: true,
      motionEnabled: false,
      message: null,
    },
    isStale: false,
    pendingCommand: null,
    commandError: '',
    modeBlockReasons: {
      presence: null,
      motion: null,
    },
    sensitivityBlockReasons: {
      low: 'Сначала выберите режим «Наличие и движение».',
      medium: 'Сначала выберите режим «Наличие и движение».',
      high: 'Сначала выберите режим «Наличие и движение».',
    },
    onModeChange: vi.fn().mockResolvedValue(true),
    onSensitivityChange: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('FilamentSensorControlPanel', () => {
  it('renders device-backed presence status and blocks sensitivity in presence mode', () => {
    render(<FilamentSensorControlPanel {...createProps()} />)

    expect(screen.getByText('Нить установлена')).toBeInTheDocument()
    expect(screen.getByTestId('filament-mode-presence')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('filament-sensitivity-medium')).toBeDisabled()
  })

  it('changes mode without optimistic selection', () => {
    const onModeChange = vi.fn().mockResolvedValue(true)
    render(<FilamentSensorControlPanel {...createProps({ onModeChange })} />)

    fireEvent.click(screen.getByTestId('filament-mode-motion'))

    expect(onModeChange).toHaveBeenCalledWith('motion')
    expect(screen.getByTestId('filament-mode-presence')).toHaveAttribute('aria-pressed', 'true')
  })

  it('requires restart confirmation before changing sensitivity', async () => {
    const onSensitivityChange = vi.fn().mockResolvedValue(true)
    const props = createProps({
      snapshot: {
        ...createProps().snapshot,
        mode: 'motion',
        motionEnabled: true,
      },
      sensitivityBlockReasons: { low: null, medium: null, high: null },
      onSensitivityChange,
    })
    render(<FilamentSensorControlPanel {...props} />)

    fireEvent.click(screen.getByTestId('filament-sensitivity-high'))
    expect(screen.getByRole('dialog', { name: 'Подтверждение перезапуска Klipper' })).toBeInTheDocument()
    expect(onSensitivityChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('filament-sensitivity-confirm'))
    await waitFor(() => expect(onSensitivityChange).toHaveBeenCalledWith('high'))
    expect(screen.getByTestId('filament-sensitivity-medium')).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows unavailable and stale states explicitly', () => {
    render(<FilamentSensorControlPanel {...createProps({
      snapshot: {
        ...createProps().snapshot,
        supported: false,
        filamentDetected: null,
        message: 'Датчик наличия филамента недоступен.',
      },
      isStale: true,
    })} />)

    expect(screen.getByText('Датчик наличия филамента недоступен.')).toBeInTheDocument()
    expect(screen.getByText('Снимок состояния устарел.')).toBeInTheDocument()
  })
})
