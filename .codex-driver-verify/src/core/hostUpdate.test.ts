import { describe, expect, it, vi } from 'vitest'
import { createMoonrakerHostUpdateClient } from './hostUpdate'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

describe('Moonraker host update client', () => {
  it('binds the default fetch implementation to the browser global', async () => {
    const fetchMock = vi.fn(function (this: typeof globalThis) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation')
      }

      return Promise.resolve(jsonResponse({
        available: true,
        busy: false,
        canApply: false,
        message: 'ready',
        releaseResults: [],
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      const client = createMoonrakerHostUpdateClient({
        moonrakerUrl: 'http://moonraker.local',
      })

      await expect(client.getStatus()).resolves.toMatchObject({ available: true })
      expect(fetchMock).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('normalizes status and sends the explicit apply target', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        available: true,
        busy: false,
        canApply: true,
        message: 'ready',
        targetTag: null,
        logPath: '/tmp/treed-update-apply.log',
        releaseResults: [
          {
            id: 'treed-mainshellos',
            label: 'TreeD MainShell OS',
            currentVersion: '0.1.0',
            latestTag: 'v0.2.0',
            latestVersion: '0.2.0',
            status: 'available',
            message: 'Доступно обновление 0.2.0.',
            canApply: true,
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        available: true,
        busy: true,
        canApply: false,
        message: 'queued',
        targetTag: 'v0.2.0',
        logPath: '/tmp/treed-update-apply.log',
        releaseResults: [],
      }))

    const client = createMoonrakerHostUpdateClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl,
    })

    await expect(client.check()).resolves.toMatchObject({
      available: true,
      canApply: true,
      releaseResults: [
        expect.objectContaining({
          id: 'printer-core',
          label: 'TreeD Printer Core',
          latestTag: 'v0.2.0',
          canApply: true,
        }),
      ],
    })

    await expect(client.apply({ targetId: 'printer-core', targetTag: 'v0.2.0' })).resolves.toMatchObject({
      busy: true,
      targetTag: 'v0.2.0',
    })
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'http://moonraker.local/server/treed/update/apply',
      expect.objectContaining({
        body: JSON.stringify({ targetId: 'printer-core', targetTag: 'v0.2.0' }),
        method: 'POST',
      }),
    )
  })

  it('aborts status and check requests after 30 seconds', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    }))
    const client = createMoonrakerHostUpdateClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchImpl as typeof fetch,
    })

    try {
      const statusPromise = client.getStatus()
      const checkPromise = client.check()
      const statusExpectation = expect(statusPromise).rejects.toMatchObject({
        message: expect.stringContaining('30000ms'),
        status: 408,
      })
      const checkExpectation = expect(checkPromise).rejects.toMatchObject({
        message: expect.stringContaining('30000ms'),
        status: 408,
      })
      await vi.advanceTimersByTimeAsync(30_000)
      await Promise.all([statusExpectation, checkExpectation])
    } finally {
      vi.useRealTimers()
    }
  })

  it('aborts apply requests after 10 seconds', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    }))
    const client = createMoonrakerHostUpdateClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchImpl as typeof fetch,
    })

    try {
      const promise = client.apply({ targetId: 'printer-core', targetTag: 'v0.2.0' })
      const timeoutExpectation = expect(promise).rejects.toMatchObject({
        message: expect.stringContaining('10000ms'),
        status: 408,
      })
      await vi.advanceTimersByTimeAsync(10_000)
      await timeoutExpectation
      expect(fetchImpl).toHaveBeenCalledWith(
        'http://moonraker.local/server/treed/update/apply',
        expect.objectContaining({
          body: JSON.stringify({ targetId: 'printer-core', targetTag: 'v0.2.0' }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
          signal: expect.any(AbortSignal),
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
