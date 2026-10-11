import { CalibrationPreview } from './CalibrationPreview'
import type { ShaperSpectrumPoint } from './shaperResonanceCsv'
import './procedureVisuals.css'

export function MotionStudy({ diagnostic }: { diagnostic: 'query' | 'noise' | null }) {
  return <figure className="procedure-study motion-study">
    <div className="procedure-motion-subject"><CalibrationPreview kind={diagnostic === 'query' ? 'adxlQuery' : diagnostic === 'noise' ? 'adxlNoise' : 'shaper'} />
      <svg viewBox="0 0 320 192" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M44 155h232m-8-6 8 6-8 6M44 155V35m-6 8 6-8 6 8" />{diagnostic && <path d="m44 155 49-49m-10 1 10-1-1 10" />}<g fill="currentColor" stroke="none"><text x="277" y="159">X</text><text x="39" y="26">Y</text>{diagnostic && <text x="96" y="104">Z</text>}</g></svg>
    </div>
    <figcaption>Схема</figcaption>
  </figure>
}

export type ShaperSpectrumAxis = { points: ShaperSpectrumPoint[]; error: string | null }

export function ShaperSpectrum({ axes, axis, onAxisChange, loading }: { axes: Record<'x' | 'y', ShaperSpectrumAxis>; axis: 'x' | 'y'; onAxisChange: (axis: 'x' | 'y') => void; loading: boolean }) {
  const { points, error } = axes[axis]
  const first = points[0]?.frequencyHz ?? 0
  const last = points.at(-1)?.frequencyHz ?? 0
  const peak = points.reduce((max, point) => Math.max(max, point.psd), 0)
  const x = (frequency: number) => 66 + (frequency - first) / (last - first || 1) * 526
  const y = (psd: number) => 172 - psd / (peak || 1) * 136
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(point.frequencyHz).toFixed(2)},${y(point.psd).toFixed(2)}`).join(' ')
  return <figure className="shaper-spectrum" aria-label={`Спектр оси ${axis.toUpperCase()}`}>
    <div className="shaper-spectrum-tabs" role="tablist" aria-label="Ось спектра">{(['x', 'y'] as const).map((item) => <button type="button" role="tab" key={item} aria-selected={axis === item} aria-pressed={axis === item} onClick={() => onAxisChange(item)} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onAxisChange(item === 'x' ? 'y' : 'x'); (event.currentTarget.parentElement?.querySelector(`[role="tab"]:nth-child(${item === 'x' ? 2 : 1})`) as HTMLButtonElement | null)?.focus() } }}>{item.toUpperCase()}</button>)}</div>
    {loading ? <p role="status">Получаем спектр…</p> : error ? <p role="alert">{error}</p> : points.length === 0 ? <p role="status">{axes.x.points.length === 0 && axes.y.points.length === 0 && !axes.x.error && !axes.y.error ? 'Данные спектра не получены. ' : ''}Спектр {axis.toUpperCase()} не получен</p> : <svg viewBox="0 0 620 220" role="img" aria-label={`Измеренный спектр резонансов ${axis.toUpperCase()}`}>
      <desc>PSD из CSV Klipper, {points.length} точек, частоты {first}–{last} Гц.</desc>
      <g className="shaper-spectrum-grid"><path d="M66 36H592M66 104H592M66 172H592" /></g>
      <path className="shaper-spectrum-axes" d="M66 28V172H600" />
      <path className="shaper-spectrum-measured" d={path} />
      {points.length === 1 && <circle className="shaper-spectrum-point" cx={x(first)} cy={y(points[0].psd)} r="3" />}
      <g className="shaper-spectrum-labels"><text x="8" y="24">PSD</text><text x="4" y="41">{peak.toExponential(1)}</text><text x="40" y="177">0</text><text x="66" y="196">{first.toFixed(1)}</text><text x="592" y="196" textAnchor="end">{last.toFixed(1)}</text><text x="328" y="214" textAnchor="middle">Частота, Гц</text></g>
    </svg>}
    <figcaption>{points.length > 0 && !error && !loading ? 'Измерено · PSD_xyz' : 'Данные спектра текущего запуска'}</figcaption>
  </figure>
}
