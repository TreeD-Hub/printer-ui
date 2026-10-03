import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChangeEvent } from 'react'
import {
  filterWifiNetworks,
  type WifiNetworkItem,
} from '@treed/printer-logic'
import { createHostUpdateClient, createMockSnapshot } from '../../mocks/runtime'
import type { HostNetworkClient, HostNetworkStatus } from '../core/hostNetwork'
import type { HostUpdateClient, HostUpdateOperation, HostUpdateStatus } from '../core/hostUpdate'
import {
  getSettingsKeyboardMeta,
  isSettingsKeyboardTarget,
  useSettingsController,
} from './settingsController'

const wifiNetworks: WifiNetworkItem[] = [
  {
    id: 'saved-office',
    ssid: 'Office_Main_5G',
    signalPercent: 73,
    security: 'wpa2',
    saved: true,
    connected: false,
  },
  {
    id: 'connected-home',
    ssid: 'Home_2F_5G',
    signalPercent: 58,
    security: 'wpa2',
    saved: true,
    connected: true,
  },
  {
    id: 'workshop',
    ssid: 'TreeD_Workshop',
    signalPercent: 92,
    security: 'wpa3',
    saved: false,
    connected: false,
  },
]

const unavailableNetworkClient: HostNetworkClient = {
  getStatus: () => Promise.resolve({
    available: false,
    ssid: null,
    ipAddress: null,
    message: 'offline',
    networks: [],
  }),
  scan: () => Promise.reject(new Error('offline')),
  connect: () => Promise.reject(new Error('offline')),
  forget: () => Promise.reject(new Error('offline')),
}

const unavailableUpdateClient: HostUpdateClient = {
  getStatus: () => Promise.reject(new Error('offline')),
  check: () => Promise.reject(new Error('offline')),
  apply: () => Promise.reject(new Error('offline')),
}

const availableUpdateStatus: HostUpdateStatus = {
  available: true,
  busy: false,
  canApply: true,
  message: 'Проверка обновлений завершена.',
  targetId: null,
  targetTag: null,
  logPath: '/tmp/treed-update-apply.log',
  releaseResults: [
    {
      id: 'printer-ui',
      label: 'TreeD Printer UI',
      currentVersion: 'ui-main-15-1',
      latestTag: 'ui-main-16-1',
      latestVersion: 'ui-main-16-1',
      status: 'available',
      message: 'Доступен новый UI bundle.',
      canApply: true,
    },
    {
      id: 'printer-core',
      label: 'TreeD Printer Core',
      currentVersion: '0.1.0',
      latestTag: null,
      latestVersion: null,
      status: 'unknown',
      message: 'Релиз системы не опубликован.',
      canApply: false,
    },
  ],
}

function changeEvent(value: string): ChangeEvent<HTMLTextAreaElement> {
  return {
    target: {
      value,
    },
  } as ChangeEvent<HTMLTextAreaElement>
}

describe('settings controller helpers', () => {
  it.each([
    [availableUpdateStatus, ''],
    [{ ...availableUpdateStatus, available: false }, 'Служба обновлений недоступна. Повторите проверку позже.'],
    [{ ...availableUpdateStatus, releaseResults: availableUpdateStatus.releaseResults.map((release) => ({ ...release, status: 'error' as const })) }, 'Не удалось проверить обновления. Повторите попытку.'],
  ])('shows only actionable notices for the received update status', async (status, notice) => {
    const { result } = renderHook(() => useSettingsController({
      snapshot: createMockSnapshot(),
      connectionLabel: 'Подключено',
      networkClient: unavailableNetworkClient,
      updateClient: { ...unavailableUpdateClient, getStatus: vi.fn().mockResolvedValue(status) },
      executeCommand: vi.fn().mockResolvedValue(true),
      getCommandBlockReason: () => null,
      activeKeyboardTarget: null,
      openKeyboard: () => undefined,
      closeKeyboard: () => undefined,
    }))

    await waitFor(() => expect(result.current.pageProps.updates.releaseResults).toBe(status.releaseResults))
    expect(result.current.pageProps.updates.notice).toBe(notice)
  })

  it('loads host update status and applies the selected release target', async () => {
    const apply = vi.fn().mockResolvedValue({
      ...availableUpdateStatus,
      busy: true,
      canApply: false,
      targetId: 'printer-ui',
      targetTag: 'ui-main-16-1',
    })
    const updateClient: HostUpdateClient = {
      getStatus: vi.fn().mockResolvedValue(availableUpdateStatus),
      check: vi.fn().mockResolvedValue(availableUpdateStatus),
      apply,
    }
    const { result } = renderHook(() => useSettingsController({
      snapshot: createMockSnapshot(),
      connectionLabel: 'Подключено',
      networkClient: unavailableNetworkClient,
      updateClient,
      executeCommand: vi.fn().mockResolvedValue(true),
      getCommandBlockReason: () => null,
      activeKeyboardTarget: null,
      openKeyboard: () => undefined,
      closeKeyboard: () => undefined,
    }))

    await waitFor(() => {
      expect(result.current.pageProps.updates.releaseResults[0]?.canApply).toBe(true)
    })

    await act(async () => {
      await result.current.pageProps.updates.onApplyUpdate('printer-ui')
    })

    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      targetId: 'printer-ui',
      targetTag: 'ui-main-42-1',
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }))
  })

  it('blocks host update apply while a print is paused', async () => {
    const snapshot = createMockSnapshot()
    snapshot.printJob.state = 'paused'
    const apply = vi.fn()
    const updateClient: HostUpdateClient = {
      getStatus: vi.fn().mockResolvedValue(availableUpdateStatus),
      check: vi.fn().mockResolvedValue(availableUpdateStatus),
      apply,
    }
    const { result } = renderHook(() => useSettingsController({
      snapshot,
      connectionLabel: 'Подключено',
      networkClient: unavailableNetworkClient,
      updateClient,
      executeCommand: vi.fn().mockResolvedValue(true),
      getCommandBlockReason: () => null,
      activeKeyboardTarget: null,
      openKeyboard: () => undefined,
      closeKeyboard: () => undefined,
    }))

    await waitFor(() => {
      expect(result.current.pageProps.updates.releaseResults[0]?.canApply).toBe(true)
    })

    await act(async () => {
      await result.current.pageProps.updates.onApplyUpdate('printer-ui')
    })

    expect(result.current.pageProps.updates.isApplyBlockedByActivePrint).toBe(true)
    expect(result.current.pageProps.updates.notice).toContain('активной печати')
    expect(apply).not.toHaveBeenCalled()
  })

  it('keeps the accepted operation active when the apply request times out', async () => {
    const runningStatus: HostUpdateStatus = {
      ...availableUpdateStatus,
      busy: true,
      canApply: false,
      operation: {
        operationId: 'operation-1',
        requestId: 'request-1',
        status: 'running',
        phase: 'installing',
        progress: 64,
        resultCode: null,
        message: 'Запись новой версии.',
        targetId: 'printer-ui',
        targetTag: 'ui-main-16-1',
        startedAt: null,
        updatedAt: null,
        finishedAt: null,
      },
    }
    const getStatus = vi.fn()
      .mockResolvedValueOnce(availableUpdateStatus)
      .mockResolvedValueOnce(runningStatus)
    const updateClient: HostUpdateClient = {
      getStatus,
      check: vi.fn().mockResolvedValue(availableUpdateStatus),
      apply: vi.fn().mockRejectedValue(new Error('Request timed out')),
    }
    const { result, unmount } = renderHook(() => useSettingsController({
      snapshot: createMockSnapshot(),
      connectionLabel: 'Подключено',
      networkClient: unavailableNetworkClient,
      updateClient,
      executeCommand: vi.fn().mockResolvedValue(true),
      getCommandBlockReason: () => null,
      activeKeyboardTarget: null,
      openKeyboard: () => undefined,
      closeKeyboard: () => undefined,
    }))

    await waitFor(() => expect(result.current.pageProps.updates.releaseResults[0]?.canApply).toBe(true))
    await act(async () => {
      await result.current.pageProps.updates.onApplyUpdate('printer-ui')
    })
    await waitFor(() => expect(result.current.pageProps.updates.operation?.phase).toBe('installing'))

    expect(getStatus).toHaveBeenCalledTimes(2)
    expect(result.current.pageProps.updates.operation?.status).toBe('running')
    expect(result.current.pageProps.updates.notice).toBe('Запись новой версии.')
    unmount()
  })

  it('blocks release checks while a durable update operation is active', async () => {
    const activeStatus: HostUpdateStatus = {
      ...availableUpdateStatus,
      busy: true,
      operation: {
        operationId: 'operation-active',
        requestId: 'request-active',
        status: 'installing',
        phase: 'installing',
        progress: null,
        resultCode: null,
        message: 'Установка продолжается.',
        targetId: 'printer-ui',
        targetTag: 'ui-main-16-1',
        startedAt: null,
        updatedAt: null,
        finishedAt: null,
      },
    }
    const check = vi.fn()
    const updateClient: HostUpdateClient = {
      getStatus: () => Promise.resolve(activeStatus),
      check,
      apply: vi.fn(),
    }
    const { result, unmount } = renderHook(() => useSettingsController({
      snapshot: createMockSnapshot(),
      connectionLabel: 'Подключено',
      networkClient: unavailableNetworkClient,
      updateClient,
      executeCommand: vi.fn().mockResolvedValue(true),
      getCommandBlockReason: () => null,
      activeKeyboardTarget: null,
      openKeyboard: () => undefined,
      closeKeyboard: () => undefined,
    }))
    await waitFor(() => expect(result.current.pageProps.updates.operation?.operationId).toBe('operation-active'))
    await act(async () => result.current.pageProps.updates.onCheckUpdates())
    expect(check).not.toHaveBeenCalled()
    expect(result.current.pageProps.updates.notice).toContain('пока выполняется обновление')
    unmount()
  })

  it('keeps connected Wi-Fi first and sorts the rest by signal after filtering', () => {
    expect(filterWifiNetworks(wifiNetworks, '5g').map((item) => item.id)).toEqual([
      'connected-home',
      'saved-office',
    ])
  })

  it('refreshes host network status when opening network settings group', async () => {
    const initialStatus: HostNetworkStatus = {
      available: true,
      ssid: 'Office_Main_5G',
      ipAddress: '192.168.1.10',
      message: 'initial status',
      networks: [],
    }
    const refreshedStatus: HostNetworkStatus = {
      available: true,
      ssid: 'TreeD_Workshop',
      ipAddress: '192.168.1.11',
      message: 'refreshed status',
      networks: [],
    }
    const getStatus = vi.fn()
      .mockResolvedValueOnce(initialStatus)
      .mockResolvedValueOnce(refreshedStatus)
    const networkClient: HostNetworkClient = {
      getStatus,
      scan: vi.fn().mockResolvedValue(refreshedStatus),
      connect: vi.fn().mockResolvedValue(refreshedStatus),
      forget: vi.fn().mockResolvedValue(refreshedStatus),
    }
    const { result } = renderHook(() => useSettingsController({
      snapshot: createMockSnapshot(),
      connectionLabel: 'Подключено',
      networkClient,
      updateClient: unavailableUpdateClient,
      executeCommand: vi.fn().mockResolvedValue(true),
      getCommandBlockReason: () => null,
      activeKeyboardTarget: null,
      openKeyboard: () => undefined,
      closeKeyboard: () => undefined,
    }))

    await waitFor(() => {
      expect(result.current.pageProps.network.currentSsid).toBe('Office_Main_5G')
    })

    act(() => {
      result.current.pageProps.onSettingsGroupChange('network')
    })

    await waitFor(() => {
      expect(getStatus).toHaveBeenCalledTimes(2)
      expect(result.current.pageProps.network.currentSsid).toBe('TreeD_Workshop')
    })
  })

  it('describes settings keyboard targets without treating idle notes as settings input', () => {
    expect(isSettingsKeyboardTarget('wifiSearch')).toBe(true)
    expect(isSettingsKeyboardTarget('idleNotes')).toBe(false)
    expect(getSettingsKeyboardMeta('wifiPassword')).toEqual({
      valueLabel: 'Ввод пароля',
      placeholder: 'Введите пароль...',
      testId: 'settings-wifi-keyboard',
      previewTestId: 'settings-wifi-keyboard-preview',
      isMultiline: false,
    })
    expect(getSettingsKeyboardMeta('consoleCommand')).toEqual({
      valueLabel: 'Ввод команды',
      placeholder: 'Введите команду...',
      testId: 'settings-console-keyboard',
      previewTestId: 'settings-console-keyboard-preview',
      isMultiline: true,
    })
  })

  it('requires an explicit second submit before sending raw console G-code', async () => {
    const executeCommand = vi.fn().mockResolvedValue(true)
    const { result } = renderHook(() => useSettingsController({
      snapshot: createMockSnapshot(),
      connectionLabel: 'Подключено',
      networkClient: unavailableNetworkClient,
      updateClient: unavailableUpdateClient,
      executeCommand,
      getCommandBlockReason: () => null,
      activeKeyboardTarget: null,
      openKeyboard: () => undefined,
      closeKeyboard: () => undefined,
    }))

    act(() => {
      result.current.pageProps.onSettingsGroupChange('console')
      result.current.pageProps.console.onInputChange(changeEvent('G28'))
    })

    act(() => {
      result.current.pageProps.console.onSubmit()
    })

    expect(executeCommand).not.toHaveBeenCalled()
    expect(result.current.pageProps.console.notice).toContain('подтверждения')

    act(() => {
      result.current.pageProps.console.onSubmit()
    })

    await waitFor(() => {
      expect(executeCommand).toHaveBeenCalledWith({ command: 'consoleGcode', gcode: 'G28' })
    })
  })
})

describe('автоматическое завершение обновления', () => {
  const runningOperation: HostUpdateOperation = {
    operationId: 'update-1', requestId: 'request-1', targetId: 'printer-ui', targetTag: 'ui-main-42-1',
    status: 'running', phase: 'verifying', progress: null, resultCode: null,
    message: 'Проверка новой версии.', startedAt: null, updatedAt: null, finishedAt: null,
  }

  function mountController(updateClient: HostUpdateClient, onUpdateApplied: () => void) {
    return renderHook(() => useSettingsController({
      snapshot: createMockSnapshot(), connectionLabel: 'Подключено',
      networkClient: unavailableNetworkClient, updateClient, onUpdateApplied,
      executeCommand: vi.fn().mockResolvedValue(true), getCommandBlockReason: () => null,
      activeKeyboardTarget: null, openKeyboard: () => undefined, closeKeyboard: () => undefined,
    }))
  }

  it.each(['applied', 'error', 'rolled_back'] as const)('обрабатывает %s без ложной перезагрузки', async (status) => {
    vi.useFakeTimers()
    let current: HostUpdateStatus = { ...availableUpdateStatus, busy: true, operation: runningOperation }
    const updateClient: HostUpdateClient = {
      getStatus: async () => current, check: async () => current, apply: async () => current,
    }
    const onUpdateApplied = vi.fn()
    const view = mountController(updateClient, onUpdateApplied)
    try {
      await act(async () => { await Promise.resolve() })
      expect(view.result.current.pageProps.updates.operation?.status).toBe('running')
      const completed = { ...runningOperation, status, phase: 'complete' as const }
      current = { ...availableUpdateStatus, busy: false, operation: completed }
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(onUpdateApplied).toHaveBeenCalledTimes(status === 'applied' ? 1 : 0)
      expect(view.result.current.pageProps.updates.operation?.status ?? null).toBe(status === 'applied' ? null : status)
      view.unmount()

      if (status === 'applied') {
        current = { ...current, operation: null, latestOperation: completed }
        const reloaded = mountController(updateClient, onUpdateApplied)
        try {
          await act(async () => { await Promise.resolve() })
          expect(onUpdateApplied).toHaveBeenCalledTimes(1)
          expect(reloaded.result.current.pageProps.updates.operation).toBeNull()
        } finally { reloaded.unmount() }
      }
    } finally {
      view.unmount()
      vi.useRealTimers()
    }
  })

  it('загружает интерфейс и при немедленном успешном ответе на собственный запрос', async () => {
    const updateClient: HostUpdateClient = {
      getStatus: async () => availableUpdateStatus,
      check: async () => availableUpdateStatus,
      apply: async (args) => ({
        ...availableUpdateStatus,
        operation: { ...runningOperation, requestId: args.requestId!, status: 'applied', phase: 'complete' },
      }),
    }
    const onUpdateApplied = vi.fn()
    const view = mountController(updateClient, onUpdateApplied)
    try {
      await waitFor(() => expect(view.result.current.pageProps.updates.releaseResults[0]?.canApply).toBe(true))
      await act(async () => view.result.current.pageProps.updates.onApplyUpdate('printer-ui'))
      expect(onUpdateApplied).toHaveBeenCalledOnce()
      expect(view.result.current.pageProps.updates.operation).toBeNull()
    } finally { view.unmount() }
  })
})

describe('mock update scenarios', () => {
  it('simulates rollback and preserves the operation outcome', async () => {
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    window.history.replaceState({}, '', '/?mockUpdate=rollback')
    vi.useFakeTimers()
    try {
      const client = createHostUpdateClient()
      const accepted = await client.apply({ targetId: 'printer-ui', targetTag: 'ui-main-42-1', requestId: 'request-rollback' })
      expect(accepted.busy).toBe(true)
      await vi.advanceTimersByTimeAsync(10_000)
      const completed = await client.getStatus()
      expect(completed.busy).toBe(false)
      expect(completed.operation).toMatchObject({ status: 'rolled_back', phase: 'complete' })
      expect(completed.history?.at(-1)?.status).toBe('rolled_back')
      expect(completed.releaseResults[0]).toMatchObject({ currentVersion: '0.1.0', canApply: true })
    } finally {
      vi.useRealTimers()
      window.history.replaceState({}, '', previousUrl || '/')
    }
  })

  it('simulates a health check error without changing the installed version', async () => {
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    window.history.replaceState({}, '', '/?mockUpdate=error')
    vi.useFakeTimers()
    try {
      const client = createHostUpdateClient()
      await client.apply({ targetId: 'printer-ui', targetTag: 'ui-main-42-1', requestId: 'request-error' })
      await vi.advanceTimersByTimeAsync(10_000)
      const completed = await client.getStatus()
      expect(completed.operation).toMatchObject({ status: 'error', phase: 'complete' })
      expect(completed.releaseResults[0]).toMatchObject({ currentVersion: '0.1.0', canApply: true })
    } finally {
      vi.useRealTimers()
      window.history.replaceState({}, '', previousUrl || '/')
    }
  })

  it('updates the installed version after a successful mock operation', async () => {
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    window.history.replaceState({}, '', '/')
    vi.useFakeTimers()
    try {
      const client = createHostUpdateClient()
      await client.apply({ targetId: 'printer-ui', targetTag: 'ui-main-42-1', requestId: 'request-success' })
      await vi.advanceTimersByTimeAsync(10_000)
      const completed = await client.getStatus()
      expect(completed.operation).toMatchObject({ status: 'applied', phase: 'complete' })
      expect(completed.releaseResults[0]).toMatchObject({
        currentVersion: 'ui-main-42-1',
        latestVersion: 'ui-main-42-1',
        status: 'latest',
        canApply: false,
      })
    } finally {
      vi.useRealTimers()
      window.history.replaceState({}, '', previousUrl || '/')
    }
  })
})
