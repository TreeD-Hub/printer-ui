import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestCameraPreview } from '#runtime'
import type { CameraPreview } from '../../core/hostDetection'
import { CameraControlPanel } from './CameraControlPanel'

vi.mock('#runtime', () => ({ runtimeMode: 'live', requestCameraPreview: vi.fn() }))

function frame(changes: Partial<CameraPreview> = {}): CameraPreview {
  return { jpeg_base64: '/9j/2Q==', captured_at: new Date().toISOString(), task: 'bed',
    verdict: 'occupied', score: 0.87, threshold: 0.52, boxes: [[10, 20, 40, 60]],
    model_version: 'e0', reason: null, ...changes }
}

async function loadImage() {
  await act(async () => { await Promise.resolve() })
  const image = screen.getByAltText('Кадр камеры принтера')
  Object.defineProperties(image, { naturalWidth: { value: 640 }, naturalHeight: { value: 480 } })
  fireEvent.load(image)
}

beforeEach(() => { vi.useFakeTimers(); vi.mocked(requestCameraPreview).mockReset() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('CameraControlPanel', () => {
  it('keeps the camera overlay inside the printer canvas', () => {
    vi.mocked(requestCameraPreview).mockImplementation(() => new Promise(() => {}))
    render(<div className="screen-shell" data-testid="printer-canvas" />)
    render(<CameraControlPanel onBack={vi.fn()} />)
    expect(screen.getByTestId('printer-canvas')).toContainElement(screen.getByRole('dialog'))
  })

  it('draws boxes only for the loaded frame and stops requests on exit', async () => {
    vi.mocked(requestCameraPreview).mockResolvedValue(frame())
    const onBack = vi.fn()
    const { unmount } = render(<CameraControlPanel onBack={onBack} />)
    await loadImage()
    expect(screen.getByRole('img', { name: 'Рамки деталей: 1' }).querySelector('rect')).toHaveAttribute('width', '30')
    expect(screen.getByLabelText('Уверенность в спагетти')).toHaveAttribute('aria-valuetext', 'Нет свежих данных')
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(onBack).toHaveBeenCalledOnce()
    const signal = vi.mocked(requestCameraPreview).mock.calls[0][0]
    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { vi.advanceTimersByTime(10_000) })
    expect(requestCameraPreview).toHaveBeenCalledTimes(1)
  })

  it('shows actual spaghetti confidence and removes it when data becomes stale', async () => {
    vi.mocked(requestCameraPreview).mockResolvedValueOnce(frame({ task: 'spaghetti', verdict: 'spaghetti', score: 0.91, threshold: 0.6, boxes: [] }))
      .mockImplementation(() => new Promise(() => {}))
    render(<CameraControlPanel onBack={vi.fn()} />)
    await loadImage()
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '91')
    await act(async () => { vi.advanceTimersByTime(13_000) })
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Кадр устарел')
  })

  it('shows transport failures instead of inventing zero confidence', async () => {
    vi.mocked(requestCameraPreview).mockRejectedValue(new Error('Камера недоступна'))
    render(<CameraControlPanel onBack={vi.fn()} />)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('status')).toHaveTextContent('Камера недоступна')
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
  })

  it('uses the frame counter without counting repeated previews and clears stale counts', async () => {
    const positive = frame({ task: 'spaghetti', verdict: 'spaghetti', score: 0.91, threshold: 0.6, boxes: [], consecutive_count: 2 })
    vi.mocked(requestCameraPreview).mockResolvedValue(positive)
    render(<CameraControlPanel onBack={vi.fn()} />)
    await loadImage()
    const meter = () => screen.getByLabelText('Последовательные срабатывания')
    expect(meter()).toHaveAttribute('aria-valuenow', '2')
    await act(async () => { vi.advanceTimersByTime(5_000) })
    expect(meter()).toHaveAttribute('aria-valuenow', '2')
    vi.mocked(requestCameraPreview).mockResolvedValue({ ...positive, captured_at: new Date().toISOString(), verdict: 'normal', score: 0.1, consecutive_count: 0 })
    await act(async () => { vi.advanceTimersByTime(5_000) })
    expect(meter()).toHaveAttribute('aria-valuenow', '0')
    vi.mocked(requestCameraPreview).mockImplementation(() => new Promise(() => {}))
    await act(async () => { vi.advanceTimersByTime(13_000) })
    expect(meter()).toHaveAttribute('aria-valuetext', 'Нет свежих данных')
    expect(meter()).not.toHaveAttribute('aria-valuenow')
  })
})
