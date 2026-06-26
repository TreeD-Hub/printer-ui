import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChangeEvent } from 'react'
import {
  filterWifiNetworks,
  type WifiNetworkItem,
} from '@treed/printer-logic'
import { createMockSnapshot } from '../../mocks/runtime'
import type { HostNetworkClient } from '../core/hostNetwork'
import type { HostUpdateClient } from '../core/hostUpdate'
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

function changeEvent(value: string): ChangeEvent<HTMLTextAreaElement> {
  return {
    target: {
      value,
    },
  } as ChangeEvent<HTMLTextAreaElement>
}

describe('settings controller helpers', () => {
  it('keeps connected Wi-Fi first and sorts the rest by signal after filtering', () => {
    expect(filterWifiNetworks(wifiNetworks, '5g').map((item) => item.id)).toEqual([
      'connected-home',
      'saved-office',
    ])
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
