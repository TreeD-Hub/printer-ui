import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import { useHeatingFanController } from './useHeatingFanController'

type TestHarnessProps = {
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  getCommandBlockReason?: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
}

function TestHarness({
  executeCommand,
  getCommandBlockReason = () => null,
}: TestHarnessProps) {
  const controller = useHeatingFanController({
    snapshot: {
      extruderTemp: 201,
      bedTemp: 58,
      modelFanPercent: 43,
      thermalTargets: {
        nozzle: 215,
        bed: 60,
      },
    },
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
  it('submits normalized temperature target and closes keyboard', async () => {
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

    expect(screen.getByTestId('nozzle-target')).toHaveTextContent('35')
    expect(screen.getByTestId('keyboard-target')).toHaveTextContent('closed')
    expect(executeCommand).toHaveBeenCalledWith({ command: 'setNozzleTarget', targetCelsius: 35 })
  })

  it('turns heaters off and clamps fan command percent', async () => {
    const executeCommand = vi.fn<TestHarnessProps['executeCommand']>()
      .mockResolvedValue(true)

    render(<TestHarness executeCommand={executeCommand} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'cooldown' }))
      fireEvent.click(screen.getByRole('button', { name: 'fan high' }))
    })

    expect(screen.getByTestId('nozzle-target')).toHaveTextContent('0')
    expect(screen.getByTestId('bed-target')).toHaveTextContent('0')
    expect(screen.getByTestId('fan-percent')).toHaveTextContent('100')
    expect(executeCommand).toHaveBeenCalledWith({ command: 'turnOffHeaters' })
    expect(executeCommand).toHaveBeenCalledWith({ command: 'setFanPercent', percent: 100 })
  })
})
