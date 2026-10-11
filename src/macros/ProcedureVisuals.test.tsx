import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ShaperSpectrum } from './ProcedureVisuals'
import { parseShaperSpectrumCsv } from './shaperResonanceCsv'

afterEach(cleanup)

const csvHeader = 'freq,psd_x,psd_y,psd_z,psd_xyz,shapers:,mzv(42.2)'

it('читает официальный CSV: исключает DC, сортирует измеренный PSD_xyz и допускает пустые дополнительные столбцы', () => {
  expect(parseShaperSpectrumCsv(`${csvHeader}\n0,0,0,0,0,,\n60,1,2,3,6,,0.8\n20,0,0,0,0,,0.2`)).toEqual([{ frequencyHz: 20, psd: 0 }, { frequencyHz: 60, psd: 6 }])
  expect(parseShaperSpectrumCsv('')).toEqual([])
  expect(parseShaperSpectrumCsv(csvHeader)).toEqual([])
})

it.each(['10,1,2,3,NaN', '10,1,2,3,', '-10,1,2,3,6', '10,-1,2,3,4', '10,1e999,2,3,6', '10,1,2,3,6\n10,1,2,3,6'])('отклоняет некорректные точки CSV %s', (row) => {
  expect(() => parseShaperSpectrumCsv(`${csvHeader}\n${row}`)).toThrow()
})

it('отклоняет чужой формат и ограничивает число точек', () => {
  expect(() => parseShaperSpectrumCsv('freq,value\n10,5')).toThrow()
  expect(() => parseShaperSpectrumCsv(`${csvHeader}\n${Array.from({ length: 4098 }, (_, i) => `${i + 1},1,2,3,6`).join('\n')}`)).toThrow()
})

it('рисует только фактические точки выбранной оси и сохраняет честное пустое состояние', () => {
  const axes = { x: { points: parseShaperSpectrumCsv(`${csvHeader}\n20,0,0,0,0\n60,1,2,3,6`), error: null }, y: { points: [], error: null } }
  const view = render(<ShaperSpectrum axes={axes} axis="x" onAxisChange={() => {}} loading={false} />)
  const graph = screen.getByRole('img', { name: 'Измеренный спектр резонансов X' })
  expect(graph.querySelector('.shaper-spectrum-measured')).toHaveAttribute('d', 'M66.00,172.00 L592.00,36.00')
  expect(graph).toHaveTextContent('PSD')
  view.rerender(<ShaperSpectrum axes={axes} axis="y" onAxisChange={() => {}} loading={false} />)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Спектр Y не получен')
})
