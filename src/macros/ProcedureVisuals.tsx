import { CalibrationPreview } from './CalibrationPreview'
import type { ShaperSpectrumPoint } from './shaperResonanceCsv'
import './procedureVisuals.css'

export type MaterialStudyKind = 'pa' | 'flow' | 'temperature' | 'retraction' | 'maxFlow'

const MATERIAL_STUDIES = {
  pa: { label: 'Сравните углы и переходы', sample: <><path d="M40 145V35h150v110H40M55 135V50h120v85H55M70 125V65h90v60H70" /><path className="procedure-study-callout" d="M190 35h50l20 20" /><circle className="procedure-study-callout" cx="190" cy="35" r="9" /></> },
  flow: { label: 'Поверхность и геометрия заполнения', sample: <><path d="M35 140V40h170v100H35M50 55h140M50 72h140M50 89h140M50 106h140M50 123h140" /><path className="procedure-study-callout" d="M170 89h70l20-25" /><circle className="procedure-study-callout" cx="170" cy="89" r="9" /></> },
  temperature: { label: 'Мосты, нависания и нити', sample: <><path d="M45 145V30h30v115M175 145V30h30v115M75 40h100M75 80h100M75 120h100M45 145h160M100 40v12M140 80v14" /><path className="procedure-study-callout" d="M125 80h115l20-20" /><circle className="procedure-study-callout" cx="125" cy="80" r="9" /></> },
  retraction: { label: 'Нити и пропуски после перехода', sample: <><path d="M45 145V40h45v105M165 145V40h45v105M35 145h185M90 65h75M90 95h75" /><path className="procedure-study-callout" d="M125 95h115l20-25" /><circle className="procedure-study-callout" cx="125" cy="95" r="9" /></> },
  maxFlow: { label: 'Участок с ухудшением поверхности', sample: <><path d="M35 140V70h45v70M105 140V50h45v90M175 140V30h45v110M35 140h185M182 65l30 15-30 15 30 15" /><path className="procedure-study-callout" d="M203 86h45l15-25M35 160h185m-10-6 10 6-10 6" /></> },
}

export function MaterialStudy({ kind, title, compact = false }: { kind: MaterialStudyKind; title: string; compact?: boolean }) {
  const study = MATERIAL_STUDIES[kind]
  return <figure className={`procedure-study material-study${compact ? ' is-compact' : ''}`} aria-label={`Что оценивать: ${title}`}>
    <div className="procedure-study-title"><strong>{title}</strong></div>
    <svg viewBox="0 0 320 180" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 6">{study.sample}</svg>
    <figcaption>Схема образца</figcaption>
  </figure>
}

export function MotionStudy({ diagnostic }: { diagnostic: 'query' | 'noise' | null }) {
  return <figure className="procedure-study motion-study">
    <div className="procedure-motion-subject"><CalibrationPreview kind={diagnostic === 'query' ? 'adxlQuery' : diagnostic === 'noise' ? 'adxlNoise' : 'shaper'} />
      <svg viewBox="0 0 320 192" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M44 155h232m-8-6 8 6-8 6M44 155V35m-6 8 6-8 6 8" />{diagnostic && <path d="m44 155 49-49m-10 1 10-1-1 10" />}<g fill="currentColor" stroke="none"><text x="277" y="159">X</text><text x="39" y="26">Y</text>{diagnostic && <text x="96" y="104">Z</text>}</g></svg>
    </div>
    <figcaption>Схема</figcaption>
  </figure>
}

export function ExtruderStudy({ requestedMm, measuredMm }: { requestedMm: number | null; measuredMm: number | null }) {
  const requested = requestedMm !== null && Number.isFinite(requestedMm) && requestedMm > 0 ? requestedMm : null
  const measured = measuredMm !== null && Number.isFinite(measuredMm) && measuredMm >= 1 && measuredMm <= 120 ? measuredMm : null
  const scale = Math.max(requested ?? 1, measured ?? 1)
  return <figure className="procedure-study extruder-study" aria-label="Сравнение длины подачи">
    <CalibrationPreview kind="extruder" />
    <div className="extruder-lengths">
      <div><span>Запрошено</span><strong>{requested === null ? '—' : `${requested.toFixed(1)} мм`}</strong></div>
      <svg viewBox="0 0 280 16" aria-hidden="true" focusable="false"><line x1="0" y1="8" x2={requested === null ? 0 : requested / scale * 272} y2="8" /></svg>
      <div><span>Измерено вручную</span><strong>{measured === null ? '—' : `${measured.toFixed(1)} мм`}</strong></div>
      <svg viewBox="0 0 280 16" aria-hidden="true" focusable="false"><line x1="0" y1="8" x2={measured === null ? 0 : measured / scale * 272} y2="8" /></svg>
    </div>
    <figcaption>Схема замера</figcaption>
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
