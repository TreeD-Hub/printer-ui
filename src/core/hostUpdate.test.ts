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
          id: 'treed-mainshellos',
          latestTag: 'v0.2.0',
          canApply: true,
        }),
      ],
    })

    await expect(client.apply({ targetId: 'treed-mainshellos', targetTag: 'v0.2.0' })).resolves.toMatchObject({
      busy: true,
      targetTag: 'v0.2.0',
    })
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'http://moonraker.local/server/treed/update/apply',
      expect.objectContaining({
        body: JSON.stringify({ targetId: 'treed-mainshellos', targetTag: 'v0.2.0' }),
        method: 'POST',
      }),
    )
  })
})
