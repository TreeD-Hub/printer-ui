import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { EddyMeshDiagram, EddyScrewsDiagram, EddyScrewTurn } from './EddyCalibrationVisuals'

afterEach(cleanup)

it.each([
  { name: 'плоская', matrix: [[0.2, 0.2], [0.2, 0.2]], points: 4, edges: 4 },
  { name: 'разрыв', matrix: [[0.2, null, 0.4], [null, 0.1]], points: 3, edges: 0 },
  { name: 'один ряд', matrix: [[-0.2, 0, 0.2]], points: 3, edges: 2 },
  { name: 'один столбец', matrix: [[-0.2], [0.2]], points: 2, edges: 1 },
  { name: 'пустая', matrix: [], points: 0, edges: 0 },
  { name: 'неконечная', matrix: [[Number.NaN, Number.POSITIVE_INFINITY]], points: 0, edges: 0 },
  { name: 'крайние конечные значения', matrix: [[-1e308, 1e308]], points: 2, edges: 1 },
  { name: 'малые конечные значения', matrix: [[1e-320, 2e-320]], points: 2, edges: 1 },
])('3D-карта $name сохраняет реальные точки, разрывы и конечную геометрию', ({ matrix, points, edges }) => {
  const { container } = render(<EddyMeshDiagram matrix={matrix} row={0} column={0} />)
  expect(screen.queryAllByTestId('mesh-measured-point')).toHaveLength(points)
  expect(container.querySelectorAll('line')).toHaveLength(edges)
  expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
})

it('проецирует Z из значений, а не из индекса строки', () => {
  const view = render(<EddyMeshDiagram matrix={[[0, 1], [1, 0]]} row={0} column={0} min={[10, 20]} max={[200, 220]} />)
  const points = screen.getAllByTestId('mesh-measured-point')
  const raisedY = Number(points[1].getAttribute('cy'))
  view.rerender(<EddyMeshDiagram matrix={[[0, 0], [1, 1]]} row={0} column={0} min={[10, 20]} max={[200, 220]} />)
  expect(raisedY).toBeLessThan(Number(screen.getAllByTestId('mesh-measured-point')[1].getAttribute('cy')))
  expect(screen.getByText('X 10…200 мм · Y 20…220 мм')).toBeInTheDocument()
})

it('вращает фактические высоты кнопками и клавиатурой, сброс возвращает проекцию', () => {
  render(<EddyMeshDiagram matrix={[[0, 1], [1, 0]]} row={0} column={0} />)
  const svg = screen.getByRole('img')
  const points = screen.getAllByTestId('mesh-measured-point')
  const initial = points.map((point) => [point.getAttribute('cx'), point.getAttribute('cy')])
  fireEvent.click(screen.getByRole('button', { name: 'Повернуть карту вправо' }))
  expect(svg).toHaveAttribute('data-yaw', '60')
  expect(points.map((point) => [point.getAttribute('cx'), point.getAttribute('cy')])).not.toEqual(initial)
  expect(points.map((point) => point.getAttribute('data-z'))).toEqual(['0', '1', '1', '0'])
  fireEvent.keyDown(svg, { key: 'ArrowUp' })
  expect(svg).toHaveAttribute('data-pitch', '40')
  fireEvent.click(screen.getByRole('button', { name: 'Сброс вида' }))
  expect(points.map((point) => [point.getAttribute('cx'), point.getAttribute('cy')])).toEqual(initial)
})

it('оси X и Y совпадают с проекциями столбцов и строк', () => {
  const { container } = render(<EddyMeshDiagram matrix={[[0, 0], [0, 0]]} row={0} column={0} />)
  const points = screen.getAllByTestId('mesh-measured-point')
  const coordinates = (index: number) => `${points[index].getAttribute('cx')} ${points[index].getAttribute('cy')}`
  expect(container.querySelector('[data-axis="X"]')).toHaveAttribute('d', `M${coordinates(0)}L${coordinates(1)}`)
  expect(container.querySelector('[data-axis="Y"]')).toHaveAttribute('d', `M${coordinates(0)}L${coordinates(2)}`)
})

it('ограничивает наклон карты и сохраняет конечные координаты', () => {
  const { container } = render(<EddyMeshDiagram matrix={[[0, 0]]} row={0} column={0} />)
  for (let index = 0; index < 20; index++) fireEvent.keyDown(screen.getByRole('img'), { key: 'ArrowUp' })
  expect(screen.getByRole('img')).toHaveAttribute('data-pitch', '75')
  expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  for (let turn = 0; turn < 24; turn++) {
    fireEvent.keyDown(screen.getByRole('img'), { key: 'ArrowRight' })
    for (const point of screen.getAllByTestId('mesh-measured-point')) {
      expect(Number(point.getAttribute('cx'))).toBeGreaterThanOrEqual(16)
      expect(Number(point.getAttribute('cx'))).toBeLessThanOrEqual(424)
      expect(Number(point.getAttribute('cy'))).toBeGreaterThanOrEqual(16)
      expect(Number(point.getAttribute('cy'))).toBeLessThanOrEqual(220)
    }
  }
})

it('вращает карту одним указателем и прекращает drag после отмены', () => {
  render(<EddyMeshDiagram matrix={[[0, 0.1], [0.2, 0.3]]} row={0} column={0} />)
  const svg = screen.getByRole('img')
  const pointer = (name: string, x: number, y: number) => fireEvent(svg, Object.assign(new Event(name, { bubbles: true }), { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }))
  pointer('pointerdown', 100, 100)
  pointer('pointermove', 140, 80)
  expect(svg).toHaveAttribute('data-yaw', '65')
  expect(svg).toHaveAttribute('data-pitch', '40')
  pointer('pointercancel', 140, 80)
  pointer('pointermove', 200, 50)
  expect(svg).toHaveAttribute('data-yaw', '65')
})

it.each(['+', '-', null, 'unknown', ''])('не рисует направление винта из %s', (sign) => {
  render(<EddyScrewTurn sign={sign} isBase={false} />)
  expect(screen.getByText('Направление не указано')).toBeInTheDocument()
  expect(screen.queryByTestId('screw-turn-CW')).not.toBeInTheDocument()
  expect(screen.queryByTestId('screw-turn-CCW')).not.toBeInTheDocument()
})

it.each(['CW', 'CCW'] as const)('рисует только явно переданное направление %s', (sign) => {
  render(<EddyScrewTurn sign={` ${sign.toLowerCase()} `} isBase={false} />)
  expect(screen.getByTestId(`screw-turn-${sign}`)).toBeInTheDocument()
})

it.each([{ sign: 'CW', sweep: '1', back: 48 }, { sign: 'CCW', sweep: '0', back: 32 }])('наконечник $sign совпадает с касательной к дуге', ({ sign, sweep, back }) => {
  render(<EddyScrewTurn sign={sign} isBase={false} />)
  expect(screen.getByTestId('screw-turn-arc')).toHaveAttribute('d', `M40 11A29 29 0 0 ${sweep} 40 69`)
  const head = screen.getByTestId('screw-turn-head').getAttribute('d')?.match(/M(\d+) (\d+)L(\d+) (\d+)L(\d+) (\d+)/)?.slice(1).map(Number)
  expect(head).toEqual([back, 63, 40, 69, back, 75])
  const tipVectorX = head![2] - (head![0] + head![4]) / 2
  expect(Math.sign(tipVectorX)).toBe(sign === 'CW' ? -1 : 1)
})

it('базовый винт остаётся без стрелки при противоречивом направлении', () => {
  render(<EddyScrewTurn sign="CW" isBase />)
  expect(screen.getByText('Базовый винт')).toBeInTheDocument()
  expect(screen.queryByTestId('screw-turn-CW')).not.toBeInTheDocument()
})

it('не придумывает положения винтов без координат', () => {
  const { container } = render(<EddyScrewsDiagram screws={[{ name: 'A', xMm: null, yMm: null, zMm: 0, sign: null, adjust: null, isBase: null }]} selected={0} />)
  expect(container.querySelectorAll('circle')).toHaveLength(0)
  expect(screen.getByText('Положение винтов не передано полностью')).toBeInTheDocument()
})
