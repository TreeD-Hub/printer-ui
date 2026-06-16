import { describe, expect, it } from 'vitest'
import {
  filterWifiNetworks,
  type WifiNetworkItem,
} from '@treed/printer-logic'
import {
  getSettingsKeyboardMeta,
  isSettingsKeyboardTarget,
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
})
