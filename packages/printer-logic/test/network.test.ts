import { describe, expect, it } from 'vitest'
import {
  filterWifiNetworks,
  getPreferredWifiNetworkId,
  type WifiNetworkItem,
} from '../src'

const networks: WifiNetworkItem[] = [
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

describe('Wi-Fi network helpers', () => {
  it('keeps connected Wi-Fi first and sorts the rest by signal after filtering', () => {
    expect(filterWifiNetworks(networks, '5g').map((item) => item.id)).toEqual([
      'connected-home',
      'saved-office',
    ])
  })

  it('prefers the connected network, then keeps previous selection when possible', () => {
    expect(getPreferredWifiNetworkId(networks, 'workshop')).toBe('connected-home')
    expect(getPreferredWifiNetworkId(networks.filter((item) => !item.connected), 'workshop')).toBe('workshop')
    expect(getPreferredWifiNetworkId([], 'workshop')).toBeNull()
  })
})
