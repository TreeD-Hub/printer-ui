import { useId, useRef, useState, type ReactNode } from 'react'
import './eddyCalibrationVisuals.css'

const NOZZLE = ['111111111111', '111111111111', '111111111111', '111111111111', '001111111100', '000111111000', '000011110000', '000001100000']

function Nozzle({ x = 110, y = 30 }: { x?: number; y?: number }) {
  return <g>{NOZZLE.flatMap((line, row) => [...line].map((point, column) => point === '1' ? <circle key={`${row}-${column}`} cx={x + column * 6} cy={y + row * 6} r="1.8" fill="currentColor" /> : null))}</g>
}

export function EddyNozzleDiagram({ paper = false, delta = null, sensor = false, repeated = false, firstLayer = false }: { paper?: boolean; delta?: number | null; sensor?: boolean; repeated?: boolean; firstLayer?: boolean }) {
  const knownDelta = typeof delta === 'number' && Number.isFinite(delta) ? delta : null
  const position = knownDelta === null ? 0 : Math.max(-24, Math.min(24, knownDelta * 200))
  return <figure className="eddy-diagram">
    <svg viewBox="0 0 320 200" role="img" data-delta={knownDelta ?? undefined} aria-label={paper ? 'Схема сопла, бумаги и стола' : 'Схема сопла и стола'}>
      <Nozzle y={35 - position} />
      {sensor && <g fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round"><rect x="194" y="42" width="44" height="58" /><path d="M202 54h28m-28 12h28m-28 12h28" /></g>}
      <path d="M30 151h255m-255 8h255" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" />
      {paper && <path d="M83 143h128" stroke="currentColor" strokeWidth="2" />}
      {firstLayer && <><path d="M76 140h152m-152-8h152m-152-8h152" stroke="currentColor" strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round" /><text x="76" y="185">Дорожки первого слоя</text></>}
      <path d="M268 112v-60m-5 6 5-6 5 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="256" y="36">Z+</text>
      {repeated && <path d="M90 98v29m18-29v29m18-29v29" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2 4" />}
    </svg>
    <figcaption>Схема · зазор не измеряется</figcaption>
  </figure>
}

type ScrewPoint = { name: string; xMm: number | null; yMm: number | null; zMm: number | null; sign: string | null; adjust: string | null; isBase: boolean | null }

export function EddyScrewsDiagram({ screws, selected }: { screws: ScrewPoint[]; selected: number }) {
  const located = screws.filter((point) => Number.isFinite(point.xMm) && Number.isFinite(point.yMm))
  const xValues = located.map((point) => point.xMm as number)
  const yValues = located.map((point) => point.yMm as number)
  const minX = Math.min(...xValues), maxX = Math.max(...xValues), minY = Math.min(...yValues), maxY = Math.max(...yValues)
  return <figure className="eddy-diagram"><svg viewBox="0 0 320 220" role="img" aria-label="План положения винтов по координатам">
    <path d="M36 24h232v154H36zM36 195h232m-6-5 6 5-6 5M16 178V24m-5 6 5-6 5 6" fill="none" stroke="currentColor" strokeDasharray="1 4" strokeLinecap="round" />
    <text x="270" y="205">X+</text><text x="3" y="17">Y+</text>
    {screws.map((point, index) => {
      if (!Number.isFinite(point.xMm) || !Number.isFinite(point.yMm)) return null
      const x = 60 + (maxX === minX ? 0.5 : ((point.xMm as number) - minX) / (maxX - minX)) * 184
      const y = 152 - (maxY === minY ? 0.5 : ((point.yMm as number) - minY) / (maxY - minY)) * 104
      return <g key={`${point.name}-${index}`} className={selected === index ? 'eddy-selected-point' : ''}><circle cx={x} cy={y} r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d={`M${x - 5} ${y}h10`} stroke="currentColor" /><text x={x + 12} y={y + 5}>{index + 1}</text></g>
    })}
  </svg><figcaption>{located.length === screws.length && screws.length > 0 ? 'План стола' : 'Положение винтов не передано полностью'}</figcaption></figure>
}

export function EddyScrewTurn({ sign, isBase }: { sign: string | null; isBase: boolean | null }) {
  const direction = isBase === true ? null : sign?.trim().toUpperCase()
  const known = direction === 'CW' || direction === 'CCW'
  return <div className="eddy-screw-turn">
    <svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="15" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M28 40h24" stroke="currentColor" strokeWidth="2" />{known && <g data-testid={`screw-turn-${direction}`} fill="none" stroke="currentColor" strokeWidth="2.5"><path data-testid="screw-turn-arc" d={`M40 11A29 29 0 0 ${direction === 'CW' ? 1 : 0} 40 69`} /><path data-testid="screw-turn-head" d={direction === 'CW' ? 'M48 63L40 69L48 75' : 'M32 63L40 69L32 75'} /></g>}</svg>
    <span>{isBase === true ? 'Базовый винт' : direction === 'CW' ? 'По часовой стрелке' : direction === 'CCW' ? 'Против часовой стрелки' : 'Направление не указано'}</span>
  </div>
}

type MeshProps = { matrix: Array<Array<number | null>>; row: number; column: number; min?: Array<number | null> | null; max?: Array<number | null> | null; controls?: ReactNode; table?: ReactNode }

export function EddyMeshDiagram({ matrix, row, column, min, max, controls, table }: MeshProps) {
  const initialView = { yaw: 315, pitch: 30, zoom: 1 }
  const [view, setView] = useState(initialView)
  const drag = useRef<{ id: number; x: number; y: number; width: number; height: number; yaw: number; pitch: number } | null>(null)
  const arrowId = useId()
  const rotate = (yaw: number, pitch: number) => setView((current) => ({ ...current, yaw: (current.yaw + yaw + 360) % 360, pitch: Math.max(10, Math.min(65, current.pitch + pitch)) }))
  const zoom = (delta: number) => setView((current) => ({ ...current, zoom: Math.max(0.75, Math.min(1.75, current.zoom + delta)) }))
  const columns = Math.max(0, ...matrix.map((line) => line.length))
  const values = matrix.flatMap((line) => line.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)))
  const low = values.length ? Math.min(...values) : 0
  const high = values.length ? Math.max(...values) : 0
  const magnitude = Math.max(0.1, Math.abs(low), Math.abs(high))
  const heightColor = (height: number) => {
    const position = Math.max(0, Math.min(10, (height + 1) * 5))
    const index = Math.min(9, Math.floor(position))
    return `color-mix(in srgb, var(--color-mesh-${index}) ${(1 - (position - index)) * 100}%, var(--color-mesh-${index + 1}))`
  }
  const knownBounds = [min?.[0], min?.[1], max?.[0], max?.[1]].every((value) => typeof value === 'number' && Number.isFinite(value))
  const boundsMagnitude = Math.max(1, ...[min?.[0], min?.[1], max?.[0], max?.[1]].filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).map(Math.abs))
  const width = knownBounds ? (max![0]! / boundsMagnitude - min![0]! / boundsMagnitude) : 1
  const length = knownBounds ? (max![1]! / boundsMagnitude - min![1]! / boundsMagnitude) : 1
  const physicalAspect = width > 0 && length > 0
  const extentX = 138 * (physicalAspect ? width / Math.max(width, length) : 1)
  const extentY = 138 * (physicalAspect ? length / Math.max(width, length) : 1)
  const yaw = view.yaw * Math.PI / 180, pitch = view.pitch * Math.PI / 180
  const viewScale = 0.78 * view.zoom
  const project = (u: number, v: number, height: number) => {
    const x = (u - 0.5) * 2 * extentX, y = (v - 0.5) * 2 * extentY
    return [215 + (x * Math.cos(yaw) - y * Math.sin(yaw)) * viewScale, 160 - ((x * Math.sin(yaw) + y * Math.cos(yaw)) * Math.sin(pitch) + height * Math.cos(pitch)) * viewScale]
  }
  const point = (r: number, c: number, z: number) => {
    const u = columns > 1 ? c / (columns - 1) : 0.5
    const v = matrix.length > 1 ? r / (matrix.length - 1) : 0.5
    return project(u, v, z / magnitude * 48)
  }
  const cells = matrix.flatMap((line, r) => line.flatMap((_, c) => {
    const heights = [matrix[r]?.[c], matrix[r]?.[c + 1], matrix[r + 1]?.[c + 1], matrix[r + 1]?.[c]]
    if (!heights.every((value): value is number => typeof value === 'number' && Number.isFinite(value))) return []
    const height = heights.reduce((sum, value) => sum + value / magnitude / 4, 0)
    const x = ((c + 0.5) / (columns - 1) - 0.5) * 2 * extentX
    const y = ((r + 0.5) / (matrix.length - 1) - 0.5) * 2 * extentY
    return [{ id: `${r}-${c}`, depth: -(x * Math.sin(yaw) + y * Math.cos(yaw)) * Math.cos(pitch) + height * 48 * Math.sin(pitch), height,
      points: [point(r, c, heights[0]), point(r, c + 1, heights[1]), point(r + 1, c + 1, heights[2]), point(r + 1, c, heights[3])].map((position) => position.join(',')).join(' ') }]
  })).sort((a, b) => a.depth - b.depth)
  const base = [project(0, 0, 0), project(1, 0, 0), project(1, 1, 0), project(0, 1, 0)]
  const axisOrigin = project(0, 0, 0), axisZ = project(0, 0, 60)
  return <figure className="eddy-diagram eddy-mesh-diagram"><div className={`eddy-mesh-viewport${table ? ' is-table' : ''}`}>{table ?? <><div className="eddy-mesh-scale" aria-label="Шкала высоты Z, мм"><span>Z, мм</span><div className="eddy-mesh-scale-body"><div className="eddy-mesh-scale-ramp" /><div className="eddy-mesh-scale-values">{[1, 0, -1].map((level) => <span key={level}>{(level * magnitude).toFixed(3)}</span>)}</div></div></div><svg viewBox="0 0 430 320" role="img" tabIndex={0} aria-label="Трёхмерная карта фактических высот стола" data-yaw={view.yaw} data-pitch={view.pitch} data-zoom={view.zoom}
    onKeyDown={(event) => {
      const directions: Record<string, [number, number]> = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, 10], ArrowDown: [0, -10] }
      const direction = directions[event.key]
      if (direction) { event.preventDefault(); rotate(direction[0], direction[1]) }
      if (event.key === 'Home') { event.preventDefault(); setView(initialView) }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(0.25) }
      if (event.key === '-') { event.preventDefault(); zoom(-0.25) }
    }}
    onPointerDown={(event) => {
      if (event.button !== 0 || !event.isPrimary) return
      const bounds = event.currentTarget.getBoundingClientRect()
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: bounds.width || 430, height: bounds.height || 320, ...view }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      event.currentTarget.focus()
    }}
    onPointerMove={(event) => {
      const start = drag.current
      if (!start || start.id !== event.pointerId) return
      setView((current) => ({ ...current, yaw: ((start.yaw + (event.clientX - start.x) / start.width * 180) % 360 + 360) % 360, pitch: Math.max(10, Math.min(65, start.pitch + (event.clientY - start.y) / start.height * 90)) }))
    }}
    onPointerUp={(event) => { if (drag.current?.id === event.pointerId) drag.current = null }} onPointerCancel={(event) => { if (drag.current?.id === event.pointerId) drag.current = null }} onLostPointerCapture={(event) => { if (drag.current?.id === event.pointerId) drag.current = null }}>
    <defs><marker id={arrowId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="currentColor" /></marker></defs>
    <polygon data-testid="mesh-zero-plane" points={base.map((position) => position.join(',')).join(' ')} className="eddy-mesh-zero" />
    {cells.map((cell) => <polygon key={cell.id} data-testid="mesh-surface-cell" points={cell.points} fill={heightColor(cell.height)} stroke="var(--color-border-default)" strokeWidth="0.6" />)}
    {([['X', base[1]], ['Y', base[3]], ['Z', axisZ]] as const).map(([label, end]) => <g key={label}><path data-axis={label} d={`M${axisOrigin.join(' ')}L${end.join(' ')}`} fill="none" stroke="currentColor" markerEnd={`url(#${arrowId})`} /><text x={end[0] + 8} y={end[1] + 16}>{label}+</text></g>)}
    {matrix.flatMap((line, r) => line.map((z, c) => {
      if (typeof z !== 'number' || !Number.isFinite(z)) return null
      const [x, y] = point(r, c, z)
      return <g key={`${r}-${c}`}>
        {([[r, c + 1], [r + 1, c]] as const).map(([nextRow, nextColumn]) => {
          const nextZ = matrix[nextRow]?.[nextColumn]
          if (typeof nextZ !== 'number' || !Number.isFinite(nextZ)) return null
          const [nextX, nextY] = point(nextRow, nextColumn, nextZ)
          return <line key={`${nextRow}-${nextColumn}`} x1={x} y1={y} x2={nextX} y2={nextY} stroke="currentColor" opacity=".65" />
        })}
        <circle data-testid="mesh-measured-point" data-z={z} cx={x} cy={y} r={r === row && c === column ? 4 : 1.4} className={r === row && c === column ? 'eddy-selected-point' : ''} fill="currentColor" />
      </g>
    }))}
    {(values.length === 0 || values.length !== matrix.length * columns) && <text x="16" y="300">{values.length === 0 ? 'Карта не получена' : 'Неполная карта'}</text>}
  </svg></>}</div><div className="eddy-mesh-view-controls">{controls}{!table && <><div className="eddy-mesh-rotation" aria-label="Вращение карты стола"><button type="button" aria-label="Повернуть карту влево" onClick={() => rotate(-15, 0)}>←</button><button type="button" aria-label="Повернуть карту вправо" onClick={() => rotate(15, 0)}>→</button><button type="button" aria-label="Увеличить наклон карты" onClick={() => rotate(0, 10)}>↑</button><button type="button" aria-label="Уменьшить наклон карты" onClick={() => rotate(0, -10)}>↓</button></div><div className="eddy-mesh-zoom"><button type="button" aria-label="Отдалить карту" disabled={view.zoom <= 0.75} onClick={() => zoom(-0.25)}>−</button><button type="button" onClick={() => setView(initialView)}>Сброс вида</button><button type="button" aria-label="Приблизить карту" disabled={view.zoom >= 1.75} onClick={() => zoom(0.25)}>+</button></div></>}</div>{!controls && <figcaption>{knownBounds ? `X ${min?.[0]}…${max?.[0]} мм · Y ${min?.[1]}…${max?.[1]} мм` : 'Границы X/Y неизвестны · индексы сетки'}<span>{values.length} точек · Z увеличен</span></figcaption>}</figure>
}
