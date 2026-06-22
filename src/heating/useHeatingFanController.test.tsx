import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TREED_V2_COREXY_V1_LIMITS } from '@treed/printer-logic'

import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import { useHeatingFanController } from './useHeatingFanController'

type TestHarnessProps = {
  snapshot?: Parameters<typeof useHeatingFanController>[0]['snapshot']
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  getCommandBlockReason?: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
}

const DEFAULT_SNAPSHOT: Parameters<typeof useHeatingFanController>[0]['snapshot'] = {
  extruderTemp: 201,
  bedTemp: 58,
  modelFanPercent: 43,
  thermalTargets: {
    nozzle: 215,
    bed: 60,
  },
  limits: TREED_V2_COREXY_V1_LIMITS,
}

function TestHarness({
  snapshot = DEFAULT_SNAPSHOT,
  executeCommand,
  getCommandBlockReason = () => null,
}: TestHarnessProps) {
  const controller = useHeatingFanController({
    snapshot,
    isBusy: false,
    executeCommand,
    getCommandBlockReason,
    closePrintTuneKeyboard: () => undefined,
  })

  return (
    <div>
      <span data-testid="nozzle-target">{controller.printNozzleTargetTemp}</span>
      <span data-testid="bed-target">{controller.printBedTargetTemp}</span>
      <span data-testid="fan-percent">{controller.fanProps.printFanPercent}</span>
      <span data-testid="chart-series">{JSON.stringify(controller.temperatureChartSeries)}</span>
      <span data-testid="keyboard-target">{controller.heatingProps.temperatureKeyboardTarget ?? 'closed'}</span>
      <span data-testid="keyboard-value">{controller.heatingProps.temperatureKeyboardValue}</span>

      <button type="button" onClick={() => controller.heatingProps.onTemperatureKeyboardOpen('nozzle')}>
        open nozzle
      </button>
      <button type="button" onClick={() => controller.handleTemperatureKeyboardDigit('3')}>
        digit 3
      </button>
      <button type="button" onClick={() => controller.handleTemperatureKeyboardDigit('5')}>
        digit 5
      </button>
      <button type="button" onClick={controller.handleTemperatureKeyboardSubmit}>
        submit
      </button>
      <button type="button" onClick={() => controller.heatingProps.onHeatingDisable()}>
        cooldown
      </button>
      <button type="button" onClick={() => controller.fanProps.onFanPercentChange(147)}>
        fan high
      </button>

      {controller.heatingProps.renderTemperatureKeyboardPanel() as ReactNode}
    </div>
  )
}

describe('useHeatingFanController', () => {
  it('uses only real snapshot temperatures for chart history', async () => {
    const executeCommand = vi.fn<TestHarnessProps['executeCommand']>()
      .mockResolvedValue(true)
    const { rerender } = render(<TestHarness executeCommand={executeCommand} />)

    expect(JSON.parse(screen.getByTestId('chart-series').textContent ?? '[]')).toEqual([
      {
        id: 'nozzle',
        label: 'Сопло',
        tone: 'orange',
        values: [201],
        target: 215,
      },
      {
        id: 'bed',
        label: 'Стол',
        tone: 'green',
        values: [58],
        target: 60,
      },
    ])

    rerender(
      <TestHarness
        executeCommand={executeCommand}
        snapshot={{
          ...DEFAULT_SNAPSHOT,
          extruderTemp: 205,
          bedTemp: 59,
        }}
      />,
    )

    expect(JSON.parse(screen.getByTestId('chart-series').textContent ?? '[]')).toEqual([
      {
        id: 'nozzle',
        label: 'Сопло',
        tone: 'orange',
        values: [201, 205],
        target: 215,
      },
      {
        id: 'bed',
        label: 'Стол',
        tone: 'green',
        values: [58, 59],
        target: 60,
      },
    ])
  })

  it('submits normalized temperature target without showing it before snapshot updates', async () => {
    const executeCommand = vi.fn<TestHarnessProps['executeCommand']>()
      .mockResolvedValue(true)

    render(<TestHarness executeCommand={executeCommand} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open nozzle' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'digit 3' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'digit 5' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'submit' }))
    })

    expect(screen.getByTestId('nozzle-target')).toHaveTextContent('215')
    expect(screen.getByTestId('keyboard-target')).toHaveTextContent('closed')
    expect(executeCommand).toHaveBeenCalledWith({ command: 'setNozzleTarget', targetCelsius: 35 })
  })

  it('turns heaters off and clamps fan command percent without optimistic UI state', async () => {
    const executeCommand = vi.fn<TestHarnessProps['executeCommand']>()
      .mockResolvedValue(true)

    render(<TestHarness executeCommand={executeCommand} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'cooldown' }))
      fireEvent.click(screen.getByRole('button', { name: 'fan high' }))
    })

    expect(screen.getByTestId('nozzle-target')).toHaveTextContent('215')
    expect(screen.getByTestId('bed-target')).toHaveTextContent('60')
    expect(screen.getByTestId('fan-percent')).toHaveTextContent('43')
    expect(executeCommand).toHaveBeenCalledWith({ command: 'turnOffHeaters' })
    expect(executeCommand).toHaveBeenCalledWith({ command: 'setFanPercent', percent: 100 })
  })
})
