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
      <span data-testid="nozzle-max">{controller.heatingProps.rows.find((row) => row.id === 'nozzle')?.maxTarget}</span>
      <span data-testid="bed-max">{controller.heatingProps.rows.find((row) => row.id === 'bed')?.maxTarget}</span>

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
      <button type="button" onClick={() => controller.heatingProps.rows.find((row) => row.id === 'nozzle')?.onTargetChange(220)}>
        nozzle step
      </button>
      <button type="button" onClick={() => controller.heatingProps.onHeatingPresetApply(210, 60)}>
        heating preset
      </button>
      <button type="button" onClick={() => controller.fanProps.onFanPercentChange(147)}>
        fan high
      </button>

      {controller.heatingProps.renderTemperatureKeyboardPanel() as ReactNode}
    </div>
  )
}

describe('useHeatingFanController', () => {
  it('samples the latest subscription temperature once per second', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-24T12:00:00Z'))
    const executeCommand = vi.fn<TestHarnessProps['executeCommand']>()
      .mockResolvedValue(true)
    const { rerender } = render(<TestHarness executeCommand={executeCommand} />)

    try {
      expect(JSON.parse(screen.getByTestId('chart-series').textContent ?? '[]')).toEqual([
        {
          id: 'nozzle',
          label: 'Сопло',
          tone: 'orange',
          points: [{ timestamp: Date.parse('2026-06-24T12:00:00Z'), current: 201, target: 215 }],
        },
        {
          id: 'bed',
          label: 'Стол',
          tone: 'green',
          points: [{ timestamp: Date.parse('2026-06-24T12:00:00Z'), current: 58, target: 60 }],
        },
      ])

      await act(async () => {
        vi.advanceTimersByTime(250)
      })
      rerender(
        <TestHarness
          executeCommand={executeCommand}
          snapshot={{
            ...DEFAULT_SNAPSHOT,
            extruderTemp: 202,
            bedTemp: 59,
          }}
        />,
      )

      await act(async () => {
        vi.advanceTimersByTime(749)
      })
      expect(JSON.parse(screen.getByTestId('chart-series').textContent ?? '[]')[0].points).toEqual([
        { timestamp: Date.parse('2026-06-24T12:00:00Z'), current: 201, target: 215 },
      ])

      await act(async () => {
        vi.advanceTimersByTime(1)
      })
      expect(JSON.parse(screen.getByTestId('chart-series').textContent ?? '[]')[0].points).toEqual([
        { timestamp: Date.parse('2026-06-24T12:00:00Z'), current: 201, target: 215 },
        { timestamp: Date.parse('2026-06-24T12:00:01Z'), current: 202, target: 215 },
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps exactly the latest three minutes of one-second chart samples', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-24T12:00:00Z'))
    const executeCommand = vi.fn<TestHarnessProps['executeCommand']>()
      .mockResolvedValue(true)
    render(<TestHarness executeCommand={executeCommand} />)

    try {
      await act(async () => {
        vi.advanceTimersByTime(181_000)
      })

      const points = JSON.parse(screen.getByTestId('chart-series').textContent ?? '[]')[0].points
      expect(points).toHaveLength(181)
      expect(points[0]?.timestamp).toBe(Date.parse('2026-06-24T12:00:01Z'))
      expect(points.at(-1)?.timestamp).toBe(Date.parse('2026-06-24T12:03:01Z'))
    } finally {
      vi.useRealTimers()
    }
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

  it('keeps clear-all and backspace as separate keyboard actions', async () => {
    const executeCommand = vi.fn<TestHarnessProps['executeCommand']>()
      .mockResolvedValue(true)

    render(<TestHarness executeCommand={executeCommand} />)

    fireEvent.click(screen.getByRole('button', { name: 'open nozzle' }))
    fireEvent.click(screen.getByRole('button', { name: 'digit 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'digit 5' }))
    expect(screen.getByTestId('keyboard-value')).toHaveTextContent('35')

    fireEvent.click(screen.getByRole('button', { name: 'Удалить последний символ' }))
    expect(screen.getByTestId('keyboard-value')).toHaveTextContent('3')

    fireEvent.click(screen.getByRole('button', { name: 'Очистить температуру' }))
    expect(screen.getByTestId('keyboard-value')).toBeEmptyDOMElement()
    expect(screen.getByTestId('nozzle-max')).toHaveTextContent(String(TREED_V2_COREXY_V1_LIMITS.nozzleMaxC))
    expect(screen.getByTestId('bed-max')).toHaveTextContent(String(TREED_V2_COREXY_V1_LIMITS.bedMaxC))
  })

  it('routes stepper, preset, cooldown and fan actions without optimistic UI state', async () => {
    const executeCommand = vi.fn<TestHarnessProps['executeCommand']>()
      .mockResolvedValue(true)

    render(<TestHarness executeCommand={executeCommand} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'cooldown' }))
      fireEvent.click(screen.getByRole('button', { name: 'nozzle step' }))
      fireEvent.click(screen.getByRole('button', { name: 'heating preset' }))
      fireEvent.click(screen.getByRole('button', { name: 'fan high' }))
    })

    expect(screen.getByTestId('nozzle-target')).toHaveTextContent('215')
    expect(screen.getByTestId('bed-target')).toHaveTextContent('60')
    expect(screen.getByTestId('fan-percent')).toHaveTextContent('43')
    expect(executeCommand).toHaveBeenCalledWith({ command: 'turnOffHeaters' })
    expect(executeCommand).toHaveBeenCalledWith({ command: 'setNozzleTarget', targetCelsius: 220 })
    expect(executeCommand).toHaveBeenCalledWith({ command: 'setHeatingTargets', nozzleCelsius: 210, bedCelsius: 60 })
    expect(executeCommand).toHaveBeenCalledWith({ command: 'setFanPercent', percent: 100 })
  })
})
