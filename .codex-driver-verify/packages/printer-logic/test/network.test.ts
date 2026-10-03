import { describe, expect, it } from 'vitest'
import {
  areHostNetworkStatusesEqual,
  createUnavailableHostNetworkStatus,
  filterWifiNetworks,
  getHostNetworkErrorMessage,
  getPreferredWifiNetworkId,
  normalizeHostNetworkStatus,
  type HostNetworkStatus,
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

  it('exposes shared host network status helpers without runtime dependencies', () => {
    const unavailable = createUnavailableHostNetworkStatus('network bridge unavailable')
    const matching: HostNetworkStatus = {
      ...unavailable,
      networks: [],
    }
    const changed: HostNetworkStatus = {
      ...unavailable,
      message: 'different',
    }

    expect(unavailable).toEqual({
      available: false,
      ssid: null,
      ipAddress: null,
      message: 'network bridge unavailable',
      networks: [],
    })
    expect(areHostNetworkStatusesEqual(unavailable, matching)).toBe(true)
    expect(areHostNetworkStatusesEqual(unavailable, changed)).toBe(false)
    expect(getHostNetworkErrorMessage(new Error('nmcli failed'), 'fallback')).toBe('nmcli failed')
    expect(getHostNetworkErrorMessage('', 'fallback')).toBe('fallback')
  })

  it('normalizes host network runtime responses before UI consumes them', () => {
    expect(normalizeHostNetworkStatus(null, 'invalid network response')).toEqual(
      createUnavailableHostNetworkStatus('invalid network response'),
    )

    expect(normalizeHostNetworkStatus({
      available: true,
      ssid: 'TreeD Lab',
      ipAddress: '',
      message: '',
      networks: [
        {
          id: '',
          ssid: 'TreeD Lab',
          signalPercent: 140,
          security: 'wpa-enterprise',
          saved: true,
          connected: true,
        },
        {
          id: 'broken',
          signalPercent: 80,
          security: 'wpa2',
          saved: false,
          connected: false,
        },
      ],
    }, 'invalid network response')).toEqual({
      available: true,
      ssid: 'TreeD Lab',
      ipAddress: null,
      message: 'invalid network response',
      networks: [
        {
          id: 'TreeD Lab',
          ssid: 'TreeD Lab',
          signalPercent: 100,
          security: 'wpa2',
          saved: true,
          connected: true,
        },
      ],
    })
  })
})
