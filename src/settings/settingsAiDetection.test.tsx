import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockSnapshot, createHostNetworkClient, createHostUpdateClient } from '../../mocks/runtime'
import { useSettingsController } from './settingsController'
import { requestAiDetectionSettings, requestDetectionFrame, requestDetectionStatus } from '../core/hostDetection'

vi.mock('#runtime', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../mocks/runtime')>(), runtimeMode: 'live',
}))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function controller() {
  const snapshot = createMockSnapshot()
  snapshot.printJob.state = 'paused'
  const networkClient = createHostNetworkClient()
  const updateClient = createHostUpdateClient()
  return renderHook(() => useSettingsController({
    snapshot, connectionLabel: 'Подключено', networkClient,
    updateClient, executeCommand: vi.fn(), getCommandBlockReason: () => null,
    activeKeyboardTarget: null, openKeyboard: () => undefined, closeKeyboard: () => undefined,
  }))
}

function fetchWithHealthyDetectionSettings(): ReturnType<typeof vi.fn> {
  return vi.fn((input: string, init?: RequestInit) => {
    if (input.endsWith('/status')) return Promise.resolve(new Response(JSON.stringify({
      enabled: true, active: false, session_id: null, counter: 0, threshold: 3,
      pause_state: 'idle', pause_error: null, analysis_state: 'idle', incident: null,
      context: null, model_version: null, worker_generation: null, recent_frame: null,
    })))
    const enabled = init?.method === 'POST' ? JSON.parse(init.body as string).enabled : true
    return Promise.resolve(new Response(JSON.stringify({ enabled })))
  })
}

it('читает сохранённую настройку, ждёт подтверждения и сохраняет состояние при ошибке', async () => {
  const fetchMock = fetchWithHealthyDetectionSettings()
  vi.stubGlobal('fetch', fetchMock)
  const { result, unmount } = controller()
  await waitFor(() => expect(result.current.pageProps.cloud).toMatchObject({ isAiMonitoringEnabled: true }))
  expect(result.current.pageProps.cloud.isCapabilityAvailable).toBe(true)
  expect(result.current.pageProps.cloud.notice).toContain('Печать на паузе')
  let reply!: (value: Response) => void
  fetchMock.mockImplementationOnce((input: string) => input.endsWith('/status')
    ? Promise.resolve(new Response(JSON.stringify({
      enabled: true, active: false, session_id: null, counter: 0, threshold: 3,
      pause_state: 'idle', pause_error: null, analysis_state: 'idle', incident: null,
      context: null, model_version: null, worker_generation: null, recent_frame: null,
    })))
    : new Promise<Response>((resolve) => { reply = resolve }))
  act(() => { void result.current.pageProps.cloud.onAiMonitoringToggle(false) })
  expect(result.current.pageProps.cloud.isBusy).toBe(true)
  expect(result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(true)
  await act(async () => { reply(new Response('{"enabled":false}')) })
  expect(result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(false)
  expect(fetchMock.mock.calls.find(([, init]) => init?.body === '{"enabled":false}')?.[1]).toMatchObject({ method: 'POST', body: '{"enabled":false}' })
  fetchMock.mockRejectedValueOnce(new Error('Нет связи с принтером'))
  await act(async () => { await result.current.pageProps.cloud.onAiMonitoringToggle(true) })
  expect(result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(false)
  expect(result.current.pageProps.cloud.notice).toContain('Нет связи')
  unmount()
})

it('старый опрос не откатывает подтверждённое переключение', async () => {
  const interval = vi.spyOn(window, 'setInterval')
  const fetchMock = fetchWithHealthyDetectionSettings()
  vi.stubGlobal('fetch', fetchMock)
  const { result, unmount } = controller()
  await waitFor(() => expect(result.current.pageProps.cloud).toMatchObject({ isAiMonitoringEnabled: true }))
  let reply!: (value: Response) => void
  let delaySettingsReply = false
  fetchMock.mockImplementation((input: string, init?: RequestInit) => {
    if (input.endsWith('/status')) return Promise.resolve(new Response(JSON.stringify({
      enabled: true, active: false, session_id: null, counter: 0, threshold: 3,
      pause_state: 'idle', pause_error: null, analysis_state: 'idle', incident: null,
      context: null, model_version: null, worker_generation: null, recent_frame: null,
    })))
    if (delaySettingsReply) {
      delaySettingsReply = false
      return new Promise<Response>((resolve) => { reply = resolve })
    }
    const enabled = init?.method === 'POST' ? JSON.parse(init.body as string).enabled : true
    return Promise.resolve(new Response(JSON.stringify({ enabled })))
  })
  const poll = interval.mock.calls.find((call) => call[1] === 5_000)![0] as () => void
  delaySettingsReply = true
  await act(async () => { poll() })
  fetchMock.mockResolvedValueOnce(new Response('{"enabled":false}'))
  await act(async () => { await result.current.pageProps.cloud.onAiMonitoringToggle(false) })
  await act(async () => { reply(new Response('{"enabled":true}')) })
  expect(result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(false)
  unmount()
})

it('отклоняет неправильный тип, неподтверждённое изменение и отказ доступа', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{"enabled":"false"}'))
    .mockResolvedValueOnce(new Response('{"enabled":true}'))
    .mockResolvedValueOnce(new Response('<html>Forbidden</html>', { status: 403 }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(requestAiDetectionSettings()).rejects.toThrow('не подтвердил настройку')
  await expect(requestAiDetectionSettings(false)).rejects.toThrow('не подтвердил изменение')
  await expect(requestAiDetectionSettings()).rejects.toThrow('HTTP 403')
})

it('читает статус локального анализа и получает только указанный последний кадр по запросу', async () => {
  const frame = {
    session_id: 'session-1', frame_id: 'frame.jpg', captured_at: '2026-10-20T12:00:00Z',
    verdict: 'spaghetti', model_version: 'local-v1', worker_generation: 'generation-1',
  }
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      enabled: true, active: true, session_id: frame.session_id, counter: 3, threshold: 3,
      pause_state: 'confirmed', pause_error: null, analysis_state: 'available', incident: {
        incident_id: 'incident-1', context: { session_id: frame.session_id, frame_id: frame.frame_id },
        pause_state: 'confirmed', requested_at: '2026-10-20T12:00:00Z', pause_error: null,
      },
      context: null, model_version: frame.model_version, worker_generation: frame.worker_generation,
      recent_frame: frame,
    })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...frame, jpeg_base64: '/9j/2Q==' })))
  vi.stubGlobal('fetch', fetchMock)
  const status = await requestDetectionStatus()
  const result = await requestDetectionFrame(status.recent_frame)
  expect(fetchMock.mock.calls[0][0]).toContain('/server/treed/detection/status')
  expect(fetchMock.mock.calls[1][0]).toContain('/server/treed/detection/frame')
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ session_id: frame.session_id, frame_id: frame.frame_id })
  expect(result.jpeg_base64).toBe('/9j/2Q==')
})

it('не принимает кадр с другим id', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    session_id: 'other', frame_id: 'frame.jpg', captured_at: '2026-10-20T12:00:00Z',
    verdict: 'normal', model_version: 'local-v1', worker_generation: 'generation-1', jpeg_base64: '/9j/2Q==',
  }))))
  await expect(requestDetectionFrame({ session_id: 'session-1', frame_id: 'frame.jpg', captured_at: '2026-10-20T12:00:00Z', verdict: 'normal', model_version: 'local-v1', worker_generation: 'generation-1' }))
    .rejects.toThrow('некорректный кадр')
})
