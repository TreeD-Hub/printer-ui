import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { HeatingControlPanelProps } from '../types'
import { HeatingControlPanel } from './HeatingControlPanel'

function createProps(): HeatingControlPanelProps {
  return {
    rows: [],
    chartSeries: [
      {
        id: 'nozzle',
        label: 'Сопло',
        tone: 'orange',
        points: [
          { timestamp: 1, current: 25, target: 220 },
          { timestamp: 2, current: 30, target: 220 },
        ],
      },
      {
        id: 'bed',
        label: 'Стол',
        tone: 'green',
        points: [
          { timestamp: 1, current: 24, target: 60 },
          { timestamp: 2, current: 26, target: 60 },
        ],
      },
    ],
    temperatureKeyboardTarget: null,
    temperatureKeyboardValue: '',
    printNozzleTargetTemp: 220,
    printBedTargetTemp: 60,
    commandBlockReasons: {
      nozzleTarget: null,
      bedTarget: null,
      turnOffHeaters: null,
    },
    renderTemperatureKeyboardPanel: () => null,
    onTemperatureKeyboardOpen: vi.fn(),
    onHeatingPresetApply: vi.fn(),
    onHeatingDisable: vi.fn(),
  }
}

describe('HeatingControlPanel', () => {
  it('shows subscription temperatures independently from one-second chart samples', () => {
    const props = createProps()
    props.rows = [{
      id: 'nozzle',
      keyboardTarget: 'nozzle',
      icon: 'metricNozzle',
      uiLabel: 'Сопло',
      tone: 'orange',
      current: 31.2,
      target: 225,
      maxTarget: 300,
      onTargetChange: vi.fn(),
      testIdPrefix: 'nozzle',
    }]

    render(<HeatingControlPanel {...props} />)

    expect(screen.getByRole('button', { name: 'Скрыть сопло на графике' })).toHaveTextContent('31° / 225°')
  })

  it('toggles chart series without calling a printer action', () => {
    const props = createProps()
    render(<HeatingControlPanel {...props} />)

    expect(screen.getByTestId('chart-current-nozzle')).toBeInTheDocument()
    expect(screen.getByTestId('chart-current-bed')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Скрыть сопло на графике' }))

    expect(screen.queryByTestId('chart-current-nozzle')).not.toBeInTheDocument()
    expect(screen.getByTestId('chart-current-bed')).toBeInTheDocument()
    expect(props.onHeatingPresetApply).not.toHaveBeenCalled()
    expect(props.onHeatingDisable).not.toHaveBeenCalled()
  })
})
