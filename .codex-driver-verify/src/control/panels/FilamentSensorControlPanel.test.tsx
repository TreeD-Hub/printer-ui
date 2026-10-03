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
      low: null,
      medium: null,
      high: null,
    },
    onModeChange: vi.fn().mockResolvedValue(true),
    onSensitivityChange: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('FilamentSensorControlPanel', () => {
  it('renders device-backed presence status and keeps sensitivity available in presence mode', () => {
    render(<FilamentSensorControlPanel {...createProps()} />)

    expect(screen.getByText('Нить установлена')).toBeInTheDocument()
    expect(screen.getByTestId('filament-mode-presence')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('filament-sensitivity-medium')).not.toBeDisabled()
  })

  it('renders compact mode buttons and one dynamic mode description', () => {
    const presenceProps = createProps()
    const { rerender } = render(<FilamentSensorControlPanel {...presenceProps} />)

    expect(screen.getByTestId('filament-mode-presence')).toHaveTextContent('Только наличие')
    expect(screen.getByTestId('filament-mode-presence')).not.toHaveTextContent('Контролируется установка')
    expect(screen.getByTestId('filament-mode-description')).toHaveTextContent('Сигнал энкодера движения не учитывается')
    expect(screen.getByRole('group', { name: 'Чувствительность энкодера' }))
      .toHaveClass('control-filament-sensitivity-grid--vertical')

    const motionProps = createProps({
      snapshot: {
        ...presenceProps.snapshot,
        mode: 'motion',
        motionEnabled: true,
      },
    })
    rerender(<FilamentSensorControlPanel {...motionProps} />)

    expect(screen.getByTestId('filament-mode-description')).toHaveTextContent('фактическая подача во время печати')
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
