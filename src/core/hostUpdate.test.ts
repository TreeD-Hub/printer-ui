import { describe, expect, it, vi } from 'vitest'
import { createMoonrakerHostUpdateClient, getHostUpdateErrorMessage, isHostUpdateRequestRejected } from './hostUpdate'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

describe('Moonraker host update client', () => {
  it('объясняет запрет доступа к системному API при HTML-ответе nginx', async () => {
    const client = createMoonrakerHostUpdateClient({
      fetchImpl: vi.fn().mockResolvedValue(new Response('<html>403 Forbidden</html>', { status: 403 })),
    })
    const error: unknown = await client.check().catch((reason: unknown) => reason)
    const message = 'Нет доступа к системным функциям принтера (HTTP 403). Проверьте настройку подключения интерфейса.'

    expect(error).toMatchObject({ name: 'MoonrakerHostUpdateError', status: 403, message })
    expect(getHostUpdateErrorMessage(error, 'Не удалось проверить обновления.')).toBe(message)
  })

  it('не принимает успешный HTML-ответ за состояние обновлений', async () => {
    const client = createMoonrakerHostUpdateClient({
      fetchImpl: vi.fn().mockResolvedValue(new Response('<html>invalid status</html>')),
    })

    await expect(client.getStatus()).rejects.toBeInstanceOf(SyntaxError)
  })

  it('sends explicit confirmation for resetting overrides and keeps restart outcome', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      reset: true, restartRequired: true, backupPath: '/config/local_overrides.cfg.backup.bak',
      message: 'Настройки сброшены. Перезапустите Klipper для применения.',
    }))
    const client = createMoonrakerHostUpdateClient({ moonrakerUrl: 'http://moonraker.local', fetchImpl })
    await expect(client.resetOverrides!()).resolves.toMatchObject({ reset: true, restartRequired: true })
    expect(fetchImpl).toHaveBeenCalledWith('http://moonraker.local/server/treed/settings/reset',
      expect.objectContaining({ method: 'POST', body: '{"confirm":true}' }))
  })

  it('passes cancellation consent only when explicitly requested', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ available: true, busy: false }))
    const client = createMoonrakerHostUpdateClient({ moonrakerUrl: 'http://moonraker.local', fetchImpl })
    await client.apply({ targetId: 'printer-core', targetTag: 'v0.2.0', cancelPausedPrint: true })
    const request = fetchImpl.mock.calls[0][1] as RequestInit
    expect(JSON.parse(request.body as string)).toHaveProperty('cancelPausedPrint', true)
  })

  it('preserves a definite rejection message from Moonraker', async () => {
    const client = createMoonrakerHostUpdateClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: { code: 409, message: 'Принтер ещё печатает.' },
      }), { status: 409 })),
    })
    try {
      await client.apply({ targetId: 'printer-core', targetTag: 'v0.2.0' })
      expect.fail('Expected rejection')
    } catch (error) {
      expect(isHostUpdateRequestRejected(error)).toBe(true)
      expect(error).toHaveProperty('message', 'Принтер ещё печатает.')
    }
  })

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
        accepted: true,
        operationId: 'operation-1',
        requestId: 'request-1',
        status: 'queued',
        phase: 'queued',
        progress: 0,
        targetTag: 'v0.2.0',
        targetId: 'printer-core',
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
          label: 'Система TreeD',
          latestTag: 'v0.2.0',
          canApply: true,
        }),
      ],
    })

    await expect(client.apply({ targetId: 'printer-core', targetTag: 'v0.2.0' })).resolves.toMatchObject({
      busy: true,
      targetTag: 'v0.2.0',
      operation: {
        operationId: 'operation-1',
        status: 'queued',
        phase: 'queued',
        progress: 0,
      },
    })
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'http://moonraker.local/server/treed/update/apply',
      expect.objectContaining({
        body: expect.stringMatching(/^\{"requestId":"[^"]+","targetId":"printer-core","targetTag":"v0.2.0"\}$/),
        method: 'POST',
      }),
    )
  })

  it('restores a durable in-progress operation and its history after reconnect', async () => {
    const client = createMoonrakerHostUpdateClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({
        available: true,
        busy: true,
        canApply: false,
        message: 'Запись новой версии.',
        operation: {
          operationId: 'operation-2',
          requestId: 'request-2',
          status: 'installing',
          phase: 'installing',
          progress: null,
          resultCode: null,
          message: 'Запись новой версии.',
          targetId: 'printer-ui',
          targetTag: 'ui-main-42-1',
        },
        latestOperation: null,
        history: [{
          operationId: 'operation-1',
          requestId: 'request-1',
          status: 'rolled_back',
          phase: 'complete',
          message: 'Предыдущая версия восстановлена.',
          targetId: 'printer-ui',
          targetTag: 'ui-main-41-1',
        }],
        releaseResults: [],
      })),
    })

    await expect(client.getStatus()).resolves.toMatchObject({
      busy: true,
      operation: { operationId: 'operation-2', status: 'installing', progress: null },
      history: [{ operationId: 'operation-1', status: 'rolled_back' }],
    })
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
      const promise = client.apply({ targetId: 'printer-core', targetTag: 'v0.2.0', uiTargetTag: 'ui-main-42-1' })
      const timeoutExpectation = expect(promise).rejects.toMatchObject({
        message: expect.stringContaining('10000ms'),
        status: 408,
      })
      await vi.advanceTimersByTimeAsync(10_000)
      await timeoutExpectation
      expect(fetchImpl).toHaveBeenCalledWith(
        'http://moonraker.local/server/treed/update/apply',
        expect.objectContaining({
        body: expect.stringMatching(/^\{"requestId":"[^"]+","targetId":"printer-core","targetTag":"v0.2.0","uiTargetTag":"ui-main-42-1"\}$/),
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
