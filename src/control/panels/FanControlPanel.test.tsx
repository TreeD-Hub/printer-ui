import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { FanControlPanel } from './FanControlPanel'

function renderFanControlPanel({
  printFanPercent = 0,
  onFanPercentChange = vi.fn(),
}: {
  printFanPercent?: number
  onFanPercentChange?: (nextValue: number) => void
} = {}) {
  render(
    <FanControlPanel
      printFanPercent={printFanPercent}
      isBusy={false}
      commandBlockReason={null}
      onFanPercentChange={onFanPercentChange}
    />,
  )

  return { onFanPercentChange }
}

afterEach(() => {
  cleanup()
})

describe('FanControlPanel', () => {
  it('always selects the preset closest to the current fan value', () => {
    renderFanControlPanel({ printFanPercent: 37 })

    const presetButtons = screen.getAllByRole('button').filter((button) => (
      button.dataset.testid?.startsWith('control-fan-preset-')
    ))
    const activePresetButtons = presetButtons.filter((button) => button.getAttribute('aria-pressed') === 'true')

    expect(activePresetButtons).toHaveLength(1)
    expect(screen.getByTestId('control-fan-preset-low')).toHaveAttribute('aria-pressed', 'true')
  })

  it('previews slider movement locally and sends one command only after release', () => {
    const onFanPercentChange = vi.fn()
    renderFanControlPanel({ onFanPercentChange })

    const slider = screen.getByTestId('control-fan-slider')
    Object.defineProperty(slider, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(slider, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 40,
        height: 40,
        left: 0,
        right: 240,
        top: 0,
        width: 240,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })

    fireEvent.pointerDown(slider, { clientX: 70, pointerId: 1 })
    fireEvent.pointerMove(slider, { clientX: 170, pointerId: 1 })

    expect(onFanPercentChange).not.toHaveBeenCalled()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByTestId('control-fan-preset-high')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.pointerUp(slider, { clientX: 170, pointerId: 1 })

    expect(onFanPercentChange).toHaveBeenCalledTimes(1)
    expect(onFanPercentChange).toHaveBeenCalledWith(75)
  })
})
