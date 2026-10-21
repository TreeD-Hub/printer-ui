import type { CameraPreview } from '../src/core/hostDetection'

let sequence = 0
const images = new Map<boolean, Promise<string>>()

function cameraImage(spaghetti: boolean): Promise<string> {
  const cached = images.get(spaghetti)
  if (cached) return cached
  const encoded = new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 480
      const context = canvas.getContext('2d')
      if (!context) { reject(new Error('Не удалось создать тестовый кадр.')); return }
      context.drawImage(image, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.9).split(',')[1])
    }
    image.onerror = () => reject(new Error('Не удалось загрузить тестовый кадр.'))
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
      <rect width="640" height="480" fill="#111416"/>
      <path d="M80 450V45H565V450M80 90H565" fill="none" stroke="#3e4448" stroke-width="18"/>
      <path d="M95 50H550M95 62H550M95 80H550" stroke="#737a7f" stroke-width="2"/>
      <path d="M70 270L440 210L590 375L180 440Z" fill="#34393c" stroke="#8a9196" stroke-width="2"/>
      <path d="M125 270L492 240M150 300L515 270M166 332L544 302M180 365L565 338M195 401L586 373M175 255L280 423M250 242L365 411M325 229L450 396M400 216L530 381" fill="none" stroke="#555d62"/>
      <path d="M240 250L330 215L420 265L330 305Z" fill="#d4d8d9" stroke="#f4f4f0"/>
      <path d="M240 250L330 305V385L240 330Z" fill="#9da4a8" stroke="#d4d8d9"/>
      <path d="M330 305L420 265V345L330 385Z" fill="#70797f" stroke="#c3c9cb"/>
      <path d="M240 265L330 320L420 280M240 280L330 335L420 295M240 295L330 350L420 310M240 310L330 365L420 325M240 325L330 380L420 340" fill="none" stroke="#555e64"/>
      <path d="M329 82V168" stroke="#aab1b5" stroke-width="10"/>
      <rect x="302" y="166" width="55" height="41" rx="3" fill="#596269" stroke="#b6bdc1"/>
      <path d="M315 208H344L330 227Z" fill="#d3b26b"/>
      ${spaghetti ? '<path d="M330 228C240 174 445 205 300 251S456 274 362 234S214 267 325 283S463 216 357 262S252 230 396 300M335 245C420 185 215 218 410 245S205 310 365 325S480 263 384 286" fill="none" stroke="#e18f77" stroke-width="4"/>' : '<path d="M330 227V234" stroke="#d4d8d9" stroke-width="2"/>'}
    </svg>`)}`
  })
  images.set(spaghetti, encoded)
  return encoded
}

export async function requestMockCameraPreview(signal: AbortSignal): Promise<CameraPreview> {
  signal.throwIfAborted()
  const scenario = new URLSearchParams(globalThis.location?.search ?? '').get('mockCamera')
  const cycle = sequence % 6
  const task = scenario === 'bed' || (!scenario && cycle < 2) ? 'bed' : 'spaghetti'
  const spaghetti = scenario === 'spaghetti' || (!scenario && cycle >= 3)
  const jpeg_base64 = await cameraImage(spaghetti)
  signal.throwIfAborted()
  sequence += 1
  return {
    jpeg_base64, captured_at: new Date().toISOString(), task,
    verdict: task === 'bed' ? 'occupied' : spaghetti ? 'spaghetti' : 'normal',
    score: task === 'bed' ? 0.87 : spaghetti ? 0.91 : 0.17,
    threshold: task === 'bed' ? 0.52 : 0.6,
    consecutive_count: task === 'bed' ? null : spaghetti ? scenario === 'spaghetti' ? Math.min(sequence, 3) : cycle - 2 : 0,
    boxes: task === 'bed' ? [[235, 210, 425, 390]] : [],
    model_version: task === 'bed' ? 'mock-detail-e0' : 'mock-spaghetti', reason: null,
  }
}
