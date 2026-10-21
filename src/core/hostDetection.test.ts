import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestCameraPreview } from './hostDetection'

const frame = {
  jpeg_base64: '/9j/2Q==', captured_at: '2026-10-21T12:00:00Z', task: 'bed',
  verdict: 'occupied', score: 0.87, threshold: 0.52, boxes: [[10, 20, 40, 60]],
  model_version: 'e0', reason: null,
}

afterEach(() => vi.unstubAllGlobals())

describe('camera preview boundary', () => {
  it('validates the image and coordinates from a single response and supports cancellation', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => frame })
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    expect(await requestCameraPreview(controller.signal)).toEqual(frame)
    expect(fetch.mock.calls[0][0]).toContain('/server/treed/detection/preview')
    controller.abort()
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
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
