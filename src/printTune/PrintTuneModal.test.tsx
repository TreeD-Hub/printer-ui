import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PrintTuneModal, type PrintTuneModalProps } from './PrintTuneModal'

function createProps(overrides: Partial<PrintTuneModalProps> = {}): PrintTuneModalProps {
  const props: PrintTuneModalProps = {
    activeGroup: 'nozzle',
    temperature: {
      currentNozzleTemp: 205,
      currentBedTemp: 58,
      nozzleTargetTemp: 210,
      bedTargetTemp: 60,
      nozzleMaxC: 300,
      bedMaxC: 120,
      keyboardTarget: null,
      keyboardValue: '',
      renderKeyboardPanel: () => null,
      onKeyboardOpen: vi.fn(),
      onNozzleTargetChange: vi.fn(),
      onBedTargetChange: vi.fn(),
    },
    values: {
      fanPercent: 40,
      flowPercent: 100,
      speedFactorPercent: 100,
      accelMmS2: 3000,
      kFactor: 0.04,
      retractMm: 0.8,
    },
    handlers: {
      onFanPercentChange: vi.fn(),
      onFlowPercentChange: vi.fn(),
      onSpeedFactorChange: vi.fn(),
      onAccelChange: vi.fn(),
      onKFactorChange: vi.fn(),
      onRetractChange: vi.fn(),
    },
    keyboard: {
      target: null,
      value: '',
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onDigit: vi.fn(),
      onDecimal: vi.fn(),
      onBackspace: vi.fn(),
      onSubmit: vi.fn(),
    },
    onClose: vi.fn(),
    onApply: vi.fn(),
  }

  return {
    ...props,
    ...overrides,
  }
}

describe('PrintTuneModal', () => {
  it('renders only the active temperature target without presets or chart', () => {
    const props = createProps()

    render(<PrintTuneModal {...props} />)

    expect(screen.getByTestId('print-tune-temp-nozzle-input')).toBeInTheDocument()
    expect(screen.queryByTestId('print-tune-temp-bed-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('print-tune-temp-preset-abs')).not.toBeInTheDocument()
    expect(screen.queryByTestId('print-tune-chart-nozzle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('print-tune-temp-chart-nozzle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('print-tune-temp-chart-bed')).not.toBeInTheDocument()
    expect(screen.queryByTestId('print-tune-temp-chart-both')).not.toBeInTheDocument()
  })

  it('renders the bed temperature target in its own popup state', () => {
    const props = createProps({ activeGroup: 'bed' })

    render(<PrintTuneModal {...props} />)

    expect(screen.getByTestId('print-tune-temp-bed-input')).toBeInTheDocument()
    expect(screen.queryByTestId('print-tune-temp-nozzle-input')).not.toBeInTheDocument()
  })

  it('uses the compact temperature keyboard layout in the print modal', () => {
    const renderKeyboardPanel = vi.fn((className?: string) => (
      <aside data-testid="print-temp-keyboard" className={className} />
    ))
    const props = createProps({
      temperature: {
        ...createProps().temperature,
        keyboardTarget: 'nozzle',
        keyboardValue: '215',
        renderKeyboardPanel,
      },
    })

    render(<PrintTuneModal {...props} />)

    expect(renderKeyboardPanel).toHaveBeenCalledWith('is-print-tune')
    expect(screen.getByTestId('print-temp-keyboard')).toHaveClass('is-print-tune')
  })

  it('renders numeric print tune popups with the same single-row template as temperature', () => {
    const props = createProps({
      activeGroup: 'flow',
      keyboard: {
        ...createProps().keyboard,
        target: 'flow',
        value: '105',
      },
    })

    render(<PrintTuneModal {...props} />)

    const flowInput = screen.getByTestId('print-tune-flow-input')
    const keyboardPanel = screen
      .getByTestId('print-tune-keyboard-digit-1')
      .closest('.print-temp-keyboard-side')

    expect(flowInput.closest('.print-temp-workspace')).not.toBeNull()
    expect(flowInput.closest('.print-temp-control-row')).not.toBeNull()
    expect(flowInput.closest('.print-tune-compact-main-panel')).toBeNull()
    expect(keyboardPanel).toHaveClass('is-print-tune')
    expect(screen.getByTestId('print-tune-modal-apply-button')).toBeInTheDocument()
    expect(screen.queryByTestId('print-tune-modal-close-button')).not.toBeInTheDocument()
  })

  it('renders fan through the same single-row tune input template', () => {
    const props = createProps({ activeGroup: 'fan' })

    render(<PrintTuneModal {...props} />)

    const fanInput = screen.getByTestId('print-tune-fan-input')

    expect(fanInput.closest('.print-temp-workspace')).not.toBeNull()
    expect(fanInput.closest('.print-temp-control-row')).not.toBeNull()
    expect(screen.queryByTestId('print-tune-fan-slider')).not.toBeInTheDocument()
  })
})
