import { moonrakerUrl } from '../config'

export type DetectionStatus = {
  enabled: boolean
  active: boolean
  session_id: string | null
  counter: number
  threshold: number
  pause_state: 'idle' | 'requested' | 'confirmed' | 'failed'
  pause_error: string | null
  analysis_state: 'idle' | 'available' | 'unavailable'
  incident: { incident_id: string; context: Record<string, unknown>; pause_state: 'requested' | 'confirmed' | 'failed'; requested_at: string; pause_error?: string | null } | null
  context: Record<string, unknown> | null
  model_version: string | null
  worker_generation: string | null
  recent_frame: { session_id: string; frame_id: string; captured_at: string; verdict: 'spaghetti' | 'normal' | 'unknown' | 'unavailable'; model_version: string; worker_generation: string } | null
}

export type DetectionFrame = NonNullable<DetectionStatus['recent_frame']> & { jpeg_base64: string }

function detectionRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function detectionRequest(path: 'status' | 'frame' | 'preview', body?: { session_id: string; frame_id: string }, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${moonrakerUrl}/server/treed/detection/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(path === 'preview' ? 35_000 : 5_000)]) : AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`Состояние локального анализа недоступно (HTTP ${response.status}).`)
  return response.json()
}

export async function requestDetectionStatus(): Promise<DetectionStatus> {
  const value: unknown = await detectionRequest('status')
  if (!detectionRecord(value)
    || typeof value.enabled !== 'boolean' || typeof value.active !== 'boolean'
    || (value.session_id !== null && typeof value.session_id !== 'string')
    || !Number.isSafeInteger(value.counter) || (value.counter as number) < 0
    || !Number.isSafeInteger(value.threshold) || (value.threshold as number) < 1
    || !['idle', 'requested', 'confirmed', 'failed'].includes(String(value.pause_state))
    || (value.pause_error !== null && typeof value.pause_error !== 'string')
    || !['idle', 'available', 'unavailable'].includes(String(value.analysis_state))
    || (value.incident !== null && (!detectionRecord(value.incident)
      || typeof value.incident.incident_id !== 'string' || !detectionRecord(value.incident.context)
      || !['requested', 'confirmed', 'failed'].includes(String(value.incident.pause_state))
      || typeof value.incident.requested_at !== 'string' || !Number.isFinite(Date.parse(value.incident.requested_at))
      || (value.incident.pause_error !== undefined && value.incident.pause_error !== null && typeof value.incident.pause_error !== 'string')))
    || (value.context !== null && !detectionRecord(value.context))
    || (value.model_version !== null && typeof value.model_version !== 'string')
    || (value.worker_generation !== null && typeof value.worker_generation !== 'string')) {
    throw new Error('Принтер вернул некорректное состояние локального анализа.')
  }
  const frame = value.recent_frame
  if (frame !== null && (!detectionRecord(frame) || typeof frame.session_id !== 'string'
    || typeof frame.frame_id !== 'string' || typeof frame.captured_at !== 'string' || !Number.isFinite(Date.parse(frame.captured_at))
    || !['spaghetti', 'normal', 'unknown', 'unavailable'].includes(String(frame.verdict)) || typeof frame.model_version !== 'string'
    || typeof frame.worker_generation !== 'string')) {
    throw new Error('Принтер вернул некорректные данные последнего кадра.')
  }
  return value as DetectionStatus
}

export async function requestDetectionFrame(frame: DetectionStatus['recent_frame']): Promise<DetectionFrame> {
  if (!frame) throw new Error('Последний кадр недоступен.')
  const value: unknown = await detectionRequest('frame', { session_id: frame.session_id, frame_id: frame.frame_id })
  if (!detectionRecord(value) || value.session_id !== frame.session_id || value.frame_id !== frame.frame_id
    || typeof value.captured_at !== 'string' || !Number.isFinite(Date.parse(value.captured_at))
    || !['spaghetti', 'normal', 'unknown', 'unavailable'].includes(String(value.verdict))
    || typeof value.model_version !== 'string' || typeof value.worker_generation !== 'string'
    || typeof value.jpeg_base64 !== 'string') {
    throw new Error('Принтер вернул некорректный кадр детектора.')
  }
  validateCameraJpeg(value.jpeg_base64)
  return value as DetectionFrame
}

function validateCameraJpeg(encoded: string): void {
  if (encoded.length > 11_184_812 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('Принтер вернул некорректный JPEG кадра.')
  }
  const jpeg = atob(encoded)
  if (jpeg.length > 8 * 1024 * 1024 || jpeg.length < 4
    || jpeg.charCodeAt(0) !== 0xff || jpeg.charCodeAt(1) !== 0xd8
    || jpeg.charCodeAt(jpeg.length - 2) !== 0xff || jpeg.charCodeAt(jpeg.length - 1) !== 0xd9) {
    throw new Error('Принтер вернул некорректный JPEG кадра.')
  }
}

export type CameraPreview = {
  jpeg_base64: string
  captured_at: string
  task: 'bed' | 'spaghetti' | null
  verdict: 'occupied' | 'unknown' | 'spaghetti' | 'normal' | 'unavailable'
  score: number | null
  threshold: number | null
  consecutive_count?: number | null
  boxes: [number, number, number, number][]
  model_version: string | null
  reason: string | null
}

export async function requestCameraPreview(signal: AbortSignal): Promise<CameraPreview> {
  const value = await detectionRequest('preview', undefined, signal)
  const confidence = (number: unknown) => number === null || (typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1)
  if (!detectionRecord(value) || typeof value.jpeg_base64 !== 'string'
    || typeof value.captured_at !== 'string' || !Number.isFinite(Date.parse(value.captured_at))
    || ![null, 'bed', 'spaghetti'].includes(value.task as CameraPreview['task'])
    || !['occupied', 'unknown', 'spaghetti', 'normal', 'unavailable'].includes(String(value.verdict))
    || !confidence(value.score) || !confidence(value.threshold)
    || (value.consecutive_count != null && (!Number.isSafeInteger(value.consecutive_count)
      || (value.consecutive_count as number) < 0 || value.task !== 'spaghetti'))
    || (value.model_version !== null && (typeof value.model_version !== 'string' || value.model_version.length > 128))
    || (value.reason !== null && (typeof value.reason !== 'string' || !/^[a-z0-9_]{1,64}$/.test(value.reason)))
    || !Array.isArray(value.boxes) || value.boxes.length > 100
    || value.boxes.some((box: unknown) => !Array.isArray(box) || box.length !== 4
      || box.some((coordinate: unknown) => typeof coordinate !== 'number' || !Number.isFinite(coordinate))
      || !(0 <= box[0] && box[0] < box[2] && box[2] <= 8192 && 0 <= box[1] && box[1] < box[3] && box[3] <= 8192))
    || (value.task !== 'bed' && value.boxes.length !== 0)
    || (value.verdict === 'occupied' && (value.task !== 'bed' || value.boxes.length === 0 || value.score === null))
    || (value.task === null && (value.verdict !== 'unavailable' || value.reason === null || value.threshold !== null || value.model_version !== null))
    || (value.verdict !== 'occupied' && value.boxes.length !== 0)
    || (['unknown', 'unavailable'].includes(String(value.verdict)) && value.score !== null)
    || (['normal', 'spaghetti'].includes(String(value.verdict)) && (value.task !== 'spaghetti' || value.score === null))) {
    throw new Error('Принтер вернул некорректную разметку камеры.')
  }
  validateCameraJpeg(value.jpeg_base64)
  return value as CameraPreview
}

// Настройка принадлежит Moonraker; секрет сервера изображений остаётся на принтере.
export async function requestAiDetectionSettings(enabled?: boolean): Promise<boolean> {
  const response = await fetch(`${moonrakerUrl}/server/treed/detection/settings`, {
    method: enabled === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: enabled === undefined ? undefined : JSON.stringify({ enabled }),
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`Не удалось прочитать или сохранить настройку AI (HTTP ${response.status}).`)
  const settings: unknown = await response.json()
  if (typeof settings !== 'object' || settings === null || !('enabled' in settings)
    || typeof settings.enabled !== 'boolean') {
    throw new Error('Принтер не подтвердил настройку локального анализа.')
  }
  if (enabled !== undefined && settings.enabled !== enabled) {
    throw new Error('Принтер не подтвердил изменение настройки локального анализа.')
  }
  return settings.enabled
}
