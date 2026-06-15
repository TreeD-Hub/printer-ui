import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DASHBOARD_VALUES } from '../dashboard/config'
import { usePrintTuneController } from './usePrintTuneController'

type TestHarnessProps = {
  hasActivePrint: boolean
  onFanPercentChange?: (value: number) => void
}

function TestHarness({
  hasActivePrint,
  onFanPercentChange = () => undefined,
}: TestHarnessProps) {
  const controller = usePrintTuneController({ hasActivePrint })
  const modalValues = controller.createModalValues({
    fanPercent: 43,
    printFill: 41,
    displayLayerCurrent: 12,
    displayLayerTotal: 180,
  })
  const modalHandlers = controller.createModalHandlers({ onFanPercentChange })
  const volumetricMetric = controller.createQuickMetrics(43).find((metric) => metric.key === 'volumetricFlow')
  const speedMetric = controller.processMetrics.find((metric) => metric.key === 'speed')

  return (
    <div>
      <span data-testid="active-group">{controller.activeGroup ?? 'closed'}</span>
      <span data-testid="keyboard-target">{controller.keyboard.target ?? 'closed'}</span>
      <span data-testid="keyboard-value">{controller.keyboard.value}</span>
      <span data-testid="volumetric-metric">{volumetricMetric?.value}</span>
      <span data-testid="speed-metric">{speedMetric?.value}</span>
      <span data-testid="speed-value">{modalValues.speedMmS}</span>
      <span data-testid="flow-value">{modalValues.flowPercent}</span>
      <span data-testid="pause-layer">{modalValues.pauseAtLayer}</span>
      <span data-testid="adjusted-eta">{modalValues.adjustedEtaTime}</span>

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
      <button type="button" onClick={() => controller.keyboard.onOpen('layers')}>
        open layers keyboard
      </button>
      <button type="button" onClick={() => controller.keyboard.onDigit('2')}>
        digit 2
      </button>
      <button type="button" onClick={() => controller.keyboard.onDigit('7')}>
        digit 7
      </button>
      <button type="button" onClick={() => controller.keyboard.onDigit('5')}>
        digit 5
      </button>
      <button type="button" onClick={() => controller.keyboard.onDigit('9')}>
        digit 9
      </button>
      <button type="button" onClick={controller.keyboard.onSubmit}>
        submit
      </button>
      <button type="button" onClick={() => modalHandlers.onFlowPercentChange(123.8)}>
        set flow
      </button>
      <button type="button" onClick={() => modalHandlers.onProgressOffsetChange(15)}>
        delay eta
      </button>
      <button type="button" onClick={() => modalHandlers.onFanPercentChange(91)}>
        fan 91
      </button>
    </div>
  )
}

describe('usePrintTuneController', () => {
  it('updates print tune values and derived dashboard metrics through compact keyboard', async () => {
    render(<TestHarness hasActivePrint={true} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open speed' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open speed keyboard' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'digit 2' }))
      fireEvent.click(screen.getByRole('button', { name: 'digit 7' }))
      fireEvent.click(screen.getByRole('button', { name: 'digit 5' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'submit' }))
    })

    expect(screen.getByTestId('active-group')).toHaveTextContent('speed')
    expect(screen.getByTestId('keyboard-target')).toHaveTextContent('closed')
    expect(screen.getByTestId('speed-value')).toHaveTextContent('275')
    expect(screen.getByTestId('speed-metric')).toHaveTextContent('275')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'set flow' }))
      fireEvent.click(screen.getByRole('button', { name: 'delay eta' }))
    })

    expect(screen.getByTestId('flow-value')).toHaveTextContent('124')
    expect(screen.getByTestId('adjusted-eta')).not.toHaveTextContent(DASHBOARD_VALUES.etaTime)
    expect(screen.getByTestId('volumetric-metric')).toHaveTextContent(String(DASHBOARD_VALUES.volumetricFlowMm3S))
  })

  it('clamps layer keyboard input, delegates fan changes, and closes tune group when print ends', async () => {
    const onFanPercentChange = vi.fn()
    const { rerender } = render(<TestHarness hasActivePrint={true} onFanPercentChange={onFanPercentChange} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open nozzle' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open layers keyboard' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'digit 9' }))
      fireEvent.click(screen.getByRole('button', { name: 'digit 9' }))
      fireEvent.click(screen.getByRole('button', { name: 'digit 9' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'submit' }))
      fireEvent.click(screen.getByRole('button', { name: 'fan 91' }))
    })

    expect(screen.getByTestId('pause-layer')).toHaveTextContent(String(DASHBOARD_VALUES.layerTotal))
    expect(onFanPercentChange).toHaveBeenCalledWith(91)

    rerender(<TestHarness hasActivePrint={false} onFanPercentChange={onFanPercentChange} />)

    await waitFor(() => {
      expect(screen.getByTestId('active-group')).toHaveTextContent('closed')
    })
  })
})
