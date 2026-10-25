import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { HeatingControlPanel } from './HeatingControlPanel'

function createProps(): ComponentProps<typeof HeatingControlPanel> {
  return {
    rows: (['nozzle', 'bed'] as const).map((id) => ({
      id, keyboardTarget: id, icon: id === 'nozzle' ? 'metricNozzle' : 'metricBed',
      uiLabel: id === 'nozzle' ? 'Сопло' : 'Стол', tone: id === 'nozzle' ? 'orange' : 'green',
      current: 25, target: id === 'nozzle' ? 220 : 60, maxTarget: id === 'nozzle' ? 300 : 120,
      onTargetChange: vi.fn().mockResolvedValue(true), testIdPrefix: id,
    })),
    isBusy: false,
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
    filament: {
      moveStepKey: '10', onMoveStepChange: vi.fn(), isFilamentBusy: false,
      commandBlockReasons: { loadFilament: null, unloadFilament: null },
      onFilamentMove: vi.fn().mockResolvedValue(true), getLastCommandError: () => '',
    },
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

    expect(within(screen.getByRole('region', { name: 'Нагреватель: сопло' })).getByText('31')).toBeInTheDocument()
    expect(screen.getByLabelText('Целевая температура сопло')).toHaveValue('225')
  })

  it('shows both temperature histories in one chart without duplicated legend controls', () => {
    const props = createProps()
    render(<HeatingControlPanel {...props} />)

    const chart = within(screen.getByTestId('control-heating-chart'))
    expect(chart.getByTestId('chart-current-nozzle')).toBeInTheDocument()
    expect(chart.getByTestId('chart-current-bed')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Серии графика температур' })).not.toBeInTheDocument()
    expect(props.onHeatingPresetApply).not.toHaveBeenCalled()
    expect(props.onHeatingDisable).not.toHaveBeenCalled()
  })

  it('previews a temperature drag and sends only its final target within the heater limits', () => {
    const props = createProps()
    render(<HeatingControlPanel {...props} />)
    const slider = screen.getByRole('slider', { name: 'Быстрая температура: стол' })
    slider.setPointerCapture = vi.fn()
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 160, width: 160 } as DOMRect)
    expect(slider).toHaveAttribute('aria-valuemax', '120')
    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(slider, { clientX: 120, pointerId: 1 })
    expect(props.rows[1].onTargetChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Целевая температура стол')).toHaveValue('100')
    fireEvent.pointerUp(slider, { pointerId: 1 })
    expect(props.rows[1].onTargetChange).toHaveBeenCalledExactlyOnceWith(100)
  })

  it.each([0, 300])('keeps the released target while the previous snapshot still reports %s', async (initialTarget) => {
    const props = { ...createProps(), isBusy: false }
    props.rows[0].target = initialTarget
    props.printNozzleTargetTemp = initialTarget
    props.rows[0].onTargetChange = vi.fn().mockResolvedValue(true)
    const { rerender } = render(<HeatingControlPanel {...props} />)
    const slider = screen.getByRole('slider', { name: 'Быстрая температура: сопло' })
    slider.setPointerCapture = vi.fn()
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 160, width: 160 } as DOMRect)

    fireEvent.pointerDown(slider, { clientX: 80, pointerId: 1 })
    expect(slider).toHaveAttribute('aria-valuenow', '150')
    await act(async () => { fireEvent.pointerUp(slider, { pointerId: 1 }) })
    fireEvent.lostPointerCapture(slider, { pointerId: 1 })
    expect(props.rows[0].onTargetChange).toHaveBeenCalledExactlyOnceWith(150)
    expect(slider).toHaveAttribute('aria-valuenow', '150')
    expect(screen.getByLabelText('Целевая температура сопло')).toHaveValue('150')

    rerender(<HeatingControlPanel {...props} isBusy={true} />)
    expect(slider).toHaveAttribute('aria-valuenow', '150')
    props.rows[0].target = 150
    props.printNozzleTargetTemp = 150
    rerender(<HeatingControlPanel {...props} />)
    expect(slider).toHaveAttribute('aria-valuenow', '150')

    props.rows[0].target = 0
    props.printNozzleTargetTemp = 0
    rerender(<HeatingControlPanel {...props} />)
    expect(slider).toHaveAttribute('aria-valuenow', '0')
  })

  it.each([false, true])('restores the actual target after an unconfirmed request (accepted=%s)', async (accepted) => {
    const props = { ...createProps(), isBusy: false }
    let finishRequest!: (result: boolean) => void
    props.rows[0].onTargetChange = vi.fn(() => new Promise<boolean>((resolve) => { finishRequest = resolve }))
    const { rerender } = render(<HeatingControlPanel {...props} />)
    const slider = screen.getByRole('slider', { name: 'Быстрая температура: сопло' })
    slider.setPointerCapture = vi.fn()
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 160, width: 160 } as DOMRect)

    fireEvent.pointerDown(slider, { clientX: 80, pointerId: 1 })
    fireEvent.pointerUp(slider, { pointerId: 1 })
    rerender(<HeatingControlPanel {...props} isBusy={true} />)
    await act(async () => { finishRequest(accepted) })
    expect(slider).toHaveAttribute('aria-valuenow', accepted ? '150' : '220')

    rerender(<HeatingControlPanel {...props} />)
    expect(slider).toHaveAttribute('aria-valuenow', '220')
    expect(screen.getByLabelText('Целевая температура сопло')).toHaveValue('220')
  })

  it('discards cancelled drags and respects a heater lock while keeping keyboard changes available', () => {
    const props = createProps()
    const { rerender } = render(<HeatingControlPanel {...props} />)
    const slider = screen.getByRole('slider', { name: 'Быстрая температура: сопло' })
    slider.setPointerCapture = vi.fn()
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 160, width: 160 } as DOMRect)
    fireEvent.pointerDown(slider, { clientX: 120, pointerId: 1 })
    fireEvent.pointerCancel(slider, { pointerId: 1 })
    expect(props.rows[0].onTargetChange).not.toHaveBeenCalled()
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(props.rows[0].onTargetChange).toHaveBeenCalledExactlyOnceWith(225)
    props.commandBlockReasons = { ...props.commandBlockReasons, nozzleTarget: 'Нет связи с принтером.' }
    rerender(<HeatingControlPanel {...props} />)
    fireEvent.keyDown(slider, { key: 'End' })
    expect(props.rows[0].onTargetChange).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Нет связи с принтером.')
  })

  it.each([['Загрузить', -1], ['Выгрузить', 1]] as const)('uses the selected distance for %s and prevents duplicate filament commands', (label, direction) => {
    const props = createProps()
    props.filament.onFilamentMove = vi.fn(() => new Promise<boolean>(() => {}))
    const { rerender } = render(<HeatingControlPanel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Шаг филамента 25 мм' }))
    expect(props.filament.onMoveStepChange).toHaveBeenCalledWith('25')
    props.filament = { ...props.filament, moveStepKey: '25' }
    rerender(<HeatingControlPanel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: label }))
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(props.filament.onFilamentMove).toHaveBeenCalledExactlyOnceWith(direction, 25)
  })

  it('explains a cold-extrusion lock without moving filament', () => {
    const props = createProps()
    props.filament.commandBlockReasons.loadFilament = 'Сопло должно быть не ниже 170°C.'
    render(<HeatingControlPanel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить' }))
    expect(props.filament.onFilamentMove).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('170°C')
  })
})
