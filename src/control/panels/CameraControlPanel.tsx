import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { requestCameraPreview } from '#runtime'
import type { CameraPreview } from '../../core/hostDetection'
import './CameraControlPanel.css'

type ImageSize = { source: string; width: number; height: number }

export function CameraControlPanel({ onBack }: { onBack: () => void }) {
  const [preview, setPreview] = useState<CameraPreview | null>(null)
  const [size, setSize] = useState<ImageSize | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const back = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    back.current?.focus()
    const controller = new AbortController()
    let next: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const frame = await requestCameraPreview(controller.signal)
        if (controller.signal.aborted) return
        setPreview(frame)
        setError(null)
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Камера недоступна.')
      }
      if (!controller.signal.aborted) next = setTimeout(() => { void refresh() }, 5_000)
    }
    void refresh()
    return () => { controller.abort(); clearTimeout(next) }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])

  const age = preview ? Math.max(0, Math.floor((now - Date.parse(preview.captured_at)) / 1_000)) : 0
  const stale = age > 12
  const loaded = preview && size?.source === preview.jpeg_base64
  const invalidBoxes = loaded && preview.boxes.some((box) => box[2] > size.width || box[3] > size.height)
  const score = preview?.task === 'spaghetti' && loaded && !stale && !error && !invalidBoxes ? preview.score : null
  const percent = score === null ? null : Math.round(score * 100)
  const consecutive = score === null || preview?.consecutive_count == null ? null : Math.min(3, preview.consecutive_count)
  const threshold = preview?.task === 'spaghetti' ? preview.threshold : null
  const danger = score !== null && threshold !== null && score >= threshold
  const notice = error ?? (invalidBoxes ? 'Разметка не соответствует размеру кадра.'
    : !preview ? 'Подключение к камере…'
    : stale ? 'Кадр устарел'
    : preview.reason === 'ai_disabled' ? 'AI выключен'
    : preview.reason === 'warming' ? 'Модель прогревается…'
    : preview.reason ? 'Анализ недоступен'
    : danger ? 'Обнаружены спагетти' : null)

  return createPortal(
    <section className="camera-inspector" role="dialog" aria-modal="true" aria-label="Камера AI" onKeyDown={(event) => { if (event.key === 'Escape') onBack() }}>
      <div className="camera-inspector-body">
        <div className={`camera-inspector-frame ${stale ? 'is-stale' : ''}`}>
          {preview && <img key={preview.jpeg_base64} src={`data:image/jpeg;base64,${preview.jpeg_base64}`} alt="Кадр камеры принтера" onLoad={(event) => {
            setSize({ source: preview.jpeg_base64, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
          }} onError={() => setError('Не удалось показать изображение камеры.')} />}
          {loaded && !stale && !error && !invalidBoxes && <svg viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Рамки деталей: ${preview.boxes.length}`}>
            {preview.boxes.map(([x1, y1, x2, y2], index) => <g key={index}>
              <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} vectorEffect="non-scaling-stroke" />
              <text x={x1 + 6} y={Math.max(size.width / 60, y1 - 8)} fontSize={Math.max(16, size.width / 60)}>Деталь</text>
            </g>)}
          </svg>}
          {notice && <p className={`camera-inspector-notice ${!preview ? 'is-empty' : ''} ${danger ? 'is-danger' : ''}`} role="status">{notice}</p>}
        </div>
        <aside className={`camera-inspector-confidence ${danger ? 'is-danger' : ''}`} aria-label="Анализ спагетти">
          <button className="camera-inspector-back" ref={back} type="button" onClick={onBack}>Назад</button>
          <span>Спагетти</span>
          <strong>{percent === null ? '—' : <>{percent}<small>%</small></>}</strong>
          <div className="camera-inspector-meter" role={percent === null ? 'img' : 'meter'} aria-label="Уверенность в спагетти" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={percent === null ? 'Нет свежих данных' : `${percent}%`}>
            <div className="camera-inspector-meter-segments"><span className="camera-inspector-meter-fill" style={{ height: `${percent ?? 0}%` }} /></div>
            {threshold !== null && <span className="camera-inspector-threshold" style={{ bottom: `${threshold * 100}%` }} />}
          </div>
          <div className="camera-inspector-streak" role={consecutive === null ? 'img' : 'meter'} aria-label="Последовательные срабатывания" aria-valuemin={0} aria-valuemax={3} aria-valuenow={consecutive ?? undefined} aria-valuetext={consecutive === null ? 'Нет свежих данных' : `${consecutive} из 3`}>
            <span className="camera-inspector-streak-segments" aria-hidden="true">
              {[1, 2, 3].map((step) => <i key={step} className={consecutive !== null && step <= consecutive ? 'is-filled' : ''} />)}
            </span>
            <span aria-hidden="true">{consecutive === null ? '—' : consecutive}<small>/3</small></span>
          </div>
        </aside>
      </div>
    </section>, document.querySelector('.screen-shell') ?? document.body,
  )
}
