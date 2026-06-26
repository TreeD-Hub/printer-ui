import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { PrinterRuntimeTuneSnapshot } from '../core/transport/types'
import { usePrintTuneController } from './usePrintTuneController'

type TestHarnessProps = {
  hasActivePrint: boolean
  runtimeTune?: PrinterRuntimeTuneSnapshot
  onFanPercentChange?: (value: number) => void
  onPrintSpeedFactorPercentChange?: (value: number) => void
  onPrintFlowFactorPercentChange?: (value: number) => void
  onPrintAccelChange?: (value: number) => void
  onPressureAdvanceChange?: (value: number) => void
  onRetractionLengthChange?: (value: number) => void
}

const DEFAULT_RUNTIME_TUNE: PrinterRuntimeTuneSnapshot = {
  contractVersion: '1.0',
  speedFactorPercent: 100,
  flowFactorPercent: 98,
  accelMmS2: 6000,
  pressureAdvance: 0.08,
  retractLengthMm: 0.8,
  appliedBabystepMm: 0,
}

function TestHarness({
  hasActivePrint,
  runtimeTune = DEFAULT_RUNTIME_TUNE,
  onFanPercentChange = () => undefined,
  onPrintSpeedFactorPercentChange = () => undefined,
  onPrintFlowFactorPercentChange = () => undefined,
  onPrintAccelChange = () => undefined,
  onPressureAdvanceChange = () => undefined,
  onRetractionLengthChange = () => undefined,
}: TestHarnessProps) {
  const controller = usePrintTuneController({
    hasActivePrint,
    runtimeTune,
    onFanPercentChange,
    onPrintSpeedFactorPercentChange,
    onPrintFlowFactorPercentChange,
    onPrintAccelChange,
    onPressureAdvanceChange,
    onRetractionLengthChange,
  })
  const modalValues = controller.createModalValues({
    fanPercent: 43,
  })
  const modalHandlers = controller.createModalHandlers({ onFanPercentChange })
  const fanMetric = controller.createQuickMetrics(43).find((metric) => metric.key === 'fan')
  const flowMetric = controller.createQuickMetrics(43).find((metric) => metric.key === 'flow')
  const speedMetric = controller.processMetrics.find((metric) => metric.key === 'speed')

  return (
    <div>
      <span data-testid="active-group">{controller.activeGroup ?? 'closed'}</span>
      <span data-testid="keyboard-target">{controller.keyboard.target ?? 'closed'}</span>
      <span data-testid="keyboard-value">{controller.keyboard.value}</span>
      <span data-testid="fan-metric">{fanMetric?.value}</span>
      <span data-testid="flow-metric">{flowMetric?.value}</span>
      <span data-testid="speed-metric">{speedMetric?.value}</span>
      <span data-testid="speed-value">{modalValues.speedFactorPercent}</span>
      <span data-testid="flow-value">{modalValues.flowPercent}</span>
      <span data-testid="accel-value">{modalValues.accelMmS2}</span>
      <span data-testid="kfactor-value">{modalValues.kFactor}</span>
      <span data-testid="retract-value">{modalValues.retractMm}</span>

      <button type="button" onClick={() => controller.openGroup('speed')}>
        open speed
      </button>
      <button type="button" onClick={() => controller.openGroup('nozzle')}>
        open nozzle
      </button>
      <button type="button" onClick={controller.closeGroup}>
        close group
      </button>
      <button type="button" onClick={() => controller.keyboard.onOpen('speed')}>
        open speed keyboard
      </button>
      <button type="button" onClick={() => controller.keyboard.onOpen('fan')}>
        open fan keyboard
      </button>
      <button type="button" onClick={() => controller.keyboard.onDigit('1')}>
        digit 1
      </button>
      <button type="button" onClick={() => controller.keyboard.onDigit('2')}>
        digit 2
      </button>
      <button type="button" onClick={() => controller.keyboard.onDigit('5')}>
        digit 5
      </button>
      <button type="button" onClick={controller.keyboard.onSubmit}>
        submit
      </button>
      <button type="button" onClick={() => modalHandlers.onFlowPercentChange(123.8)}>
        set flow
      </button>
      <button type="button" onClick={() => modalHandlers.onAccelChange(12000)}>
        set accel
      </button>
      <button type="button" onClick={() => modalHandlers.onKFactorChange(0.075)}>
        set kfactor
      </button>
      <button type="button" onClick={() => modalHandlers.onRetractChange(0.9)}>
        set retract
      </button>
      <button type="button" onClick={() => modalHandlers.onFanPercentChange(91)}>
        fan 91
      </button>
    </div>
  )
}

describe('usePrintTuneController', () => {
  it('uses runtime tune snapshot values and delegates live tune changes', async () => {
    const onPrintSpeedFactorPercentChange = vi.fn()
    const onPrintFlowFactorPercentChange = vi.fn()
    const onPrintAccelChange = vi.fn()
    const onPressureAdvanceChange = vi.fn()
    const onRetractionLengthChange = vi.fn()
    const onFanPercentChange = vi.fn()

    render(
      <TestHarness
        hasActivePrint={true}
        onFanPercentChange={onFanPercentChange}
        onPrintSpeedFactorPercentChange={onPrintSpeedFactorPercentChange}
        onPrintFlowFactorPercentChange={onPrintFlowFactorPercentChange}
        onPrintAccelChange={onPrintAccelChange}
        onPressureAdvanceChange={onPressureAdvanceChange}
        onRetractionLengthChange={onRetractionLengthChange}
      />,
    )

    expect(screen.getByTestId('fan-metric')).toHaveTextContent('43')
    expect(screen.getByTestId('flow-metric')).toHaveTextContent('98')
    expect(screen.getByTestId('speed-metric')).toHaveTextContent('100')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open speed' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open speed keyboard' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'digit 1' }))
      fireEvent.click(screen.getByRole('button', { name: 'digit 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'digit 5' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'submit' }))
    })

    expect(screen.getByTestId('active-group')).toHaveTextContent('speed')
    expect(screen.getByTestId('keyboard-target')).toHaveTextContent('closed')
    expect(screen.getByTestId('speed-value')).toHaveTextContent('125')
    expect(screen.getByTestId('speed-metric')).toHaveTextContent('125')
    expect(onPrintSpeedFactorPercentChange).toHaveBeenCalledWith(125)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open fan keyboard' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'digit 1' }))
      fireEvent.click(screen.getByRole('button', { name: 'digit 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'digit 5' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'submit' }))
    })

    expect(onFanPercentChange).toHaveBeenCalledWith(100)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'set flow' }))
      fireEvent.click(screen.getByRole('button', { name: 'set accel' }))
      fireEvent.click(screen.getByRole('button', { name: 'set kfactor' }))
      fireEvent.click(screen.getByRole('button', { name: 'set retract' }))
      fireEvent.click(screen.getByRole('button', { name: 'fan 91' }))
    })

    expect(screen.getByTestId('flow-value')).toHaveTextContent('124')
    expect(screen.getByTestId('accel-value')).toHaveTextContent('12000')
    expect(screen.getByTestId('kfactor-value')).toHaveTextContent('0.075')
    expect(screen.getByTestId('retract-value')).toHaveTextContent('0.9')
    expect(onPrintFlowFactorPercentChange).toHaveBeenCalledWith(124)
    expect(onPrintAccelChange).toHaveBeenCalledWith(12000)
    expect(onPressureAdvanceChange).toHaveBeenCalledWith(0.075)
    expect(onRetractionLengthChange).toHaveBeenCalledWith(0.9)
    expect(onFanPercentChange).toHaveBeenCalledWith(91)
  })

  it('closes tune group when print ends', async () => {
    const { rerender } = render(<TestHarness hasActivePrint={true} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open nozzle' }))
    })

    rerender(<TestHarness hasActivePrint={false} />)

    await waitFor(() => {
      expect(screen.getByTestId('active-group')).toHaveTextContent('closed')
    })
  })

  it('keeps local tune draft while a tune modal is open', async () => {
    const { rerender } = render(<TestHarness hasActivePrint={true} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open speed' }))
      fireEvent.click(screen.getByRole('button', { name: 'set flow' }))
    })

    expect(screen.getByTestId('flow-value')).toHaveTextContent('124')

    rerender(
      <TestHarness
        hasActivePrint={true}
        runtimeTune={{
          ...DEFAULT_RUNTIME_TUNE,
          flowFactorPercent: 88,
        }}
      />,
    )

    expect(screen.getByTestId('flow-value')).toHaveTextContent('124')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'close group' }))
    })

    await waitFor(() => {
      expect(screen.getByTestId('flow-value')).toHaveTextContent('88')
    })
  })
})
