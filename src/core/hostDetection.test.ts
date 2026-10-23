import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestCameraPreview } from './hostDetection'

const frame = {
  jpeg_base64: '/9j/2Q==', captured_at: '2026-10-21T12:00:00Z', task: 'bed',
  verdict: 'occupied', score: 0.87, threshold: 0.52, boxes: [[10, 20, 40, 60]],
  model_version: 'e0', reason: null,
}

afterEach(() => vi.unstubAllGlobals())

describe('camera preview boundary', () => {
  it('работает в Chromium без AbortSignal.any', async () => {
    const any = vi.spyOn(AbortSignal, 'any').mockImplementation(() => { throw new TypeError('AbortSignal.any is unavailable') })
    vi.useFakeTimers()
    const controller = new AbortController()
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener')
    let markBodyStarted!: () => void
    const bodyStarted = new Promise<void>((resolve) => { markBodyStarted = resolve })
    const fetchMock = vi.fn((_url: string, init: RequestInit) => Promise.resolve({
      ok: true,
      json: () => {
        const requestSignal = init.signal as AbortSignal
        const body = new Promise<unknown>((_resolve, reject) => {
          requestSignal.addEventListener('abort', () => reject(requestSignal.reason), { once: true })
        })
        markBodyStarted()
        return body
      },
    } as Response))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const request = requestCameraPreview(controller.signal)
      await Promise.race([bodyStarted, request])
      const timedOut = expect(request).rejects.toMatchObject({ name: 'TimeoutError' })
      await vi.advanceTimersByTimeAsync(35_000)
      await timedOut
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      any.mockRestore()
      vi.useRealTimers()
    }
  })

  it('validates the image and coordinates from a single response', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => frame })
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    expect(await requestCameraPreview(controller.signal)).toEqual(frame)
    expect(fetch.mock.calls[0][0]).toContain('/server/treed/detection/preview')
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    { score: Number.NaN }, { score: 1.01 }, { threshold: false },
    { boxes: [[40, 20, 10, 60]] }, { boxes: [[0, 0, Infinity, 10]] },
    { task: 'spaghetti' }, { verdict: 'unknown' }, { jpeg_base64: btoa('not a jpeg') },
    { consecutive_count: -1 }, { consecutive_count: 1.5 }, { consecutive_count: true },
    { consecutive_count: 1 },
  ])('rejects malformed or contradictory metadata: %j', async (changes) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...frame, ...changes }) }))
    await expect(requestCameraPreview(new AbortController().signal)).rejects.toThrow()
  })

  it('accepts the detector counter for a spaghetti frame', async () => {
    const preview = { ...frame, task: 'spaghetti', verdict: 'spaghetti', boxes: [], consecutive_count: 3 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => preview }))
    expect((await requestCameraPreview(new AbortController().signal)).consecutive_count).toBe(3)
  })
})
