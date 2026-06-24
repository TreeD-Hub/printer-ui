import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'

import { TemperatureTrendChart } from './printTuneWidgets'

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

describe('TemperatureTrendChart', () => {
  it('uses real timestamps and confirmed targets for chart lines and scale', () => {
    const firstTimestamp = Date.parse('2026-06-24T12:07:00Z')
    const secondTimestamp = Date.parse('2026-06-24T12:12:00Z')
    const series: ComponentProps<typeof TemperatureTrendChart>['series'] = [{
      id: 'nozzle',
      label: 'Сопло',
      tone: 'orange',
      points: [
        { timestamp: firstTimestamp, current: 25, target: 0 },
        { timestamp: secondTimestamp, current: 40, target: 220 },
      ],
    }]

    render(<TemperatureTrendChart series={series} testId="chart" />)

    expect(screen.getByTestId('chart-target-nozzle')).toHaveAttribute('points', expect.stringContaining(','))
    expect(screen.getByTestId('chart')).toHaveTextContent(formatTime(firstTimestamp))
    expect(screen.getByTestId('chart')).toHaveTextContent(formatTime(secondTimestamp))
    expect(screen.getByTestId('chart')).toHaveTextContent('250')
  })

  it('does not render a target line while the confirmed target is zero', () => {
    const series: ComponentProps<typeof TemperatureTrendChart>['series'] = [{
      id: 'bed',
      label: 'Стол',
      tone: 'green',
      points: [
        { timestamp: 1, current: 24, target: 0 },
        { timestamp: 2, current: 25, target: 0 },
      ],
    }]

    render(<TemperatureTrendChart series={series} testId="chart" />)

    expect(screen.queryByTestId('chart-target-bed')).not.toBeInTheDocument()
  })
})
