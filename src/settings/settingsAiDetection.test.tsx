import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockSnapshot, createHostNetworkClient, createHostUpdateClient } from '../../mocks/runtime'
import { useSettingsController } from './settingsController'
import { SettingsPage } from './SettingsPage'
import { requestAiDetectionSettings, requestDetectionFrame, requestDetectionStatus } from '../core/hostDetection'

vi.mock('#runtime', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../mocks/runtime')>(), runtimeMode: 'live',
}))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function controller(onPrintStart = true, executeCommand = vi.fn().mockResolvedValue(true), blockReason: string | null = null) {
  const snapshot = createMockSnapshot()
  snapshot.printJob.state = 'paused'
  snapshot.lightPreferences = { onStartup: false, onPrintStart }
  const networkClient = createHostNetworkClient()
  const updateClient = createHostUpdateClient()
  return renderHook(() => useSettingsController({
    snapshot, connectionLabel: 'Подключено', networkClient,
    updateClient, executeCommand, getCommandBlockReason: () => blockReason,
    activeKeyboardTarget: null, openKeyboard: () => undefined, closeKeyboard: () => undefined,
  }))
}

it('предупреждает до включения AI; закрытие и Escape не меняют настройки', async () => {
  const fetchMock = fetchWithHealthyDetectionSettings(false)
  vi.stubGlobal('fetch', fetchMock)
  const execute = vi.fn().mockResolvedValue(true)
  const { result, unmount } = controller(false, execute)
  await waitFor(() => expect(result.current.pageProps.cloud.isConnected).toBe(true))
  expect(result.current.pageProps.cloud.lightWarning.isOpen).toBe(false)
  await act(async () => { await result.current.pageProps.cloud.onAiMonitoringToggle(true) })
  const view = render(<SettingsPage {...result.current.pageProps} />)
  expect(screen.getByRole('dialog', { name: 'Свет для AI-детекции' })).toHaveTextContent('может не обнаружить дефекты')
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
  view.rerender(<SettingsPage {...result.current.pageProps} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(false)
  await act(async () => { await result.current.pageProps.cloud.onAiMonitoringToggle(true) })
  view.rerender(<SettingsPage {...result.current.pageProps} />)
  fireEvent.keyDown(document, { key: 'Escape' })
  view.rerender(<SettingsPage {...result.current.pageProps} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(false)
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  expect(execute).not.toHaveBeenCalled()
  unmount()
})

it('кнопка предупреждения включает существующую настройку света и не дублирует команду', async () => {
  const fetchMock = fetchWithHealthyDetectionSettings(false)
  vi.stubGlobal('fetch', fetchMock)
  let reply!: (accepted: boolean) => void
  const execute = vi.fn(() => new Promise<boolean>((resolve) => { reply = resolve }))
  const { result, unmount } = controller(false, execute)
  await waitFor(() => expect(result.current.pageProps.cloud.isConnected).toBe(true))
  await act(async () => { await result.current.pageProps.cloud.onAiMonitoringToggle(true) })
  const view = render(<SettingsPage {...result.current.pageProps} />)
  fireEvent.click(screen.getByRole('button', { name: 'Включить свет' }))
  fireEvent.click(screen.getByRole('button', { name: 'Включить свет' }))
  view.rerender(<SettingsPage {...result.current.pageProps} />)
  expect(screen.getByRole('button', { name: 'Включаем…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Закрыть' })).toBeDisabled()
  expect(execute).toHaveBeenCalledExactlyOnceWith({ command: 'setLightPreference', setting: 'onPrintStart', enabled: true })
  await act(async () => { reply(false) })
  view.rerender(<SettingsPage {...result.current.pageProps} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось включить автосвет')
  expect(result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(false)
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Включить свет' }))
  await act(async () => { reply(true) })
  view.rerender(<SettingsPage {...result.current.pageProps} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(true)
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => init?.body)).toEqual(['{"enabled":true}'])
  unmount()
})

it('не предлагает уже включённый автосвет и соблюдает блокировку команды', async () => {
  vi.stubGlobal('fetch', fetchWithHealthyDetectionSettings(false))
  const execute = vi.fn().mockResolvedValue(true)
  const first = controller(true, execute)
  await waitFor(() => expect(first.result.current.pageProps.cloud.isConnected).toBe(true))
  await act(async () => { await first.result.current.pageProps.cloud.onAiMonitoringToggle(true) })
  expect(first.result.current.pageProps.cloud.lightWarning.isOpen).toBe(false)
  expect(first.result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(true)
  expect(execute).not.toHaveBeenCalled()
  first.unmount()
  vi.stubGlobal('fetch', fetchWithHealthyDetectionSettings(false))
  const blocked = controller(false, execute, 'Принтер недоступен')
  await waitFor(() => expect(blocked.result.current.pageProps.cloud.isConnected).toBe(true))
  await act(async () => { await blocked.result.current.pageProps.cloud.onAiMonitoringToggle(true) })
  await act(async () => { await blocked.result.current.pageProps.cloud.lightWarning.onEnable() })
  expect(blocked.result.current.pageProps.cloud.lightWarning).toMatchObject({ isOpen: true, error: 'Принтер недоступен' })
  expect(execute).not.toHaveBeenCalled()
  expect(blocked.result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(false)
  blocked.unmount()
})

it('показывает отказ включения AI после принятой команды света', async () => {
  const fetchMock = fetchWithHealthyDetectionSettings(false)
  vi.stubGlobal('fetch', fetchMock)
  const execute = vi.fn().mockResolvedValue(true)
  const { result, unmount } = controller(false, execute)
  await waitFor(() => expect(result.current.pageProps.cloud.isConnected).toBe(true))
  await act(async () => { await result.current.pageProps.cloud.onAiMonitoringToggle(true) })
  fetchMock.mockRejectedValueOnce(new Error('Нет связи'))
  await act(async () => { await result.current.pageProps.cloud.lightWarning.onEnable() })
  expect(execute).toHaveBeenCalledTimes(1)
  expect(result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(false)
  expect(result.current.pageProps.cloud.lightWarning.isOpen).toBe(true)
  expect(result.current.pageProps.cloud.lightWarning.error).toContain('включить AI-детекцию не удалось')
  unmount()
})

function fetchWithHealthyDetectionSettings(initialEnabled = true): ReturnType<typeof vi.fn> {
  let enabled = initialEnabled
  return vi.fn((input: string, init?: RequestInit) => {
    if (input.endsWith('/status')) return Promise.resolve(new Response(JSON.stringify({
      enabled, active: false, session_id: null, counter: 0, threshold: 3,
      pause_state: 'idle', pause_error: null, analysis_state: 'idle', incident: null,
      context: null, model_version: null, worker_generation: null, recent_frame: null,
    })))
    if (init?.method === 'POST') enabled = JSON.parse(init.body as string).enabled
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
