import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockSnapshot, createHostNetworkClient, createHostUpdateClient } from '../../mocks/runtime'
import { useSettingsController } from './settingsController'
import { requestAiDetectionSettings } from '../core/hostDetection'

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

it('читает сохранённую настройку, ждёт подтверждения и сохраняет состояние при ошибке', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{"enabled":true}'))
  vi.stubGlobal('fetch', fetchMock)
  const { result, unmount } = controller()
  await waitFor(() => expect(result.current.pageProps.cloud).toMatchObject({ isAiMonitoringEnabled: true }))
  expect(result.current.pageProps.cloud.isCapabilityAvailable).toBe(true)
  expect(result.current.pageProps.cloud.notice).toContain('На паузе автоотмена заблокирована')
  let reply!: (value: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { reply = resolve }))
  act(() => { void result.current.pageProps.cloud.onAiMonitoringToggle(false) })
  expect(result.current.pageProps.cloud.isBusy).toBe(true)
  expect(result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(true)
  await act(async () => { reply(new Response('{"enabled":false}')) })
  expect(result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(false)
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', body: '{"enabled":false}' })
  fetchMock.mockRejectedValueOnce(new Error('Нет связи с принтером'))
  await act(async () => { await result.current.pageProps.cloud.onAiMonitoringToggle(true) })
  expect(result.current.pageProps.cloud.isAiMonitoringEnabled).toBe(false)
  expect(result.current.pageProps.cloud.notice).toContain('Нет связи')
  unmount()
})

it('старый опрос не откатывает подтверждённое переключение', async () => {
  const interval = vi.spyOn(window, 'setInterval')
  const fetchMock = vi.fn().mockResolvedValue(new Response('{"enabled":true}'))
  vi.stubGlobal('fetch', fetchMock)
  const { result, unmount } = controller()
  await waitFor(() => expect(result.current.pageProps.cloud).toMatchObject({ isAiMonitoringEnabled: true }))
  let reply!: (value: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { reply = resolve }))
  const poll = interval.mock.calls.find((call) => call[1] === 5_000)![0] as () => void
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
