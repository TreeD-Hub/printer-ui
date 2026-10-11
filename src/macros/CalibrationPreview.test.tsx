import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CalibrationPreview, type CalibrationPreviewKind } from './CalibrationPreview'

afterEach(cleanup)

const kinds: CalibrationPreviewKind[] = [
  'pid', 'eddyFolder', 'eddy', 'shaper', 'extruder', 'material', 'service',
  'driveCurrent', 'height', 'temperature', 'z0', 'offsets', 'accuracy',
  'screws', 'mesh', 'xyOffset', 'firstLayer',
  'pidNozzle', 'pidBed', 'adxlQuery', 'adxlNoise', 'pa', 'flow', 'retraction', 'maxFlow',
  'materialTemperature',
]

it.each(kinds)('%s: оба размера имеют только точки внутри своей матрицы', (kind) => {
  const { container, rerender } = render(<CalibrationPreview kind={kind} className="custom-preview" />)
  const signatures: string[] = []
  const counts: number[] = []
  for (const compact of [false, true]) {
    rerender(<CalibrationPreview kind={kind} className="custom-preview" compact={compact} />)
    const svg = container.querySelector('svg')!
    const [width, height] = compact ? [48, 40] : [96, 80]
    expect(svg).toHaveAttribute('viewBox', `0 0 ${width} ${height}`)
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    expect(svg).toHaveAttribute('fill', 'currentColor')
    expect(svg).toHaveClass('custom-preview')
    const dots = Array.from(svg.querySelectorAll('circle'))
    expect(dots.length).toBeGreaterThan(15)
    expect(svg.children).toHaveLength(dots.length)
    for (const dot of dots) {
      const x = Number(dot.getAttribute('cx'))
      const y = Number(dot.getAttribute('cy'))
      expect(dot).toHaveAttribute('r', '1.2')
      expect(x % 4).toBe(2)
      expect(y % 4).toBe(2)
      expect(x).toBeGreaterThanOrEqual(2)
      expect(y).toBeGreaterThanOrEqual(2)
      expect(x).toBeLessThanOrEqual(width - 2)
      expect(y).toBeLessThanOrEqual(height - 2)
    }
    signatures.push(svg.innerHTML)
    counts.push(dots.length)
  }
  expect(signatures[0]).not.toBe(signatures[1])
  expect(counts[1]).toBeLessThan(counts[0])
})
