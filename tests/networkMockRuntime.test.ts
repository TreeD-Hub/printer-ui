import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearMockNetworkRuntime, createHostNetworkClient } from '../mocks/runtime'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  clearMockNetworkRuntime()
  vi.useRealTimers()
})

function clientFor(scenario: string) {
  window.history.replaceState(null, '', scenario ? `/?mockNetwork=${scenario}` : '/')
  clearMockNetworkRuntime()
  return createHostNetworkClient()
}

describe('Wi-Fi mock scenarios', () => {
  it.each(['', 'unknown'])('provides available networks by default for %s', async (scenario) => {
    const status = await clientFor(scenario).getStatus()
    expect(status).toMatchObject({ available: true, ssid: null, ipAddress: null })
    expect(status.networks.some((network) => network.security === 'open')).toBe(true)
    expect(status.networks.some((network) => network.saved)).toBe(true)
  })

  it('preserves unavailable and empty as separate states', async () => {
    expect(await clientFor('unavailable').getStatus()).toMatchObject({ available: false, networks: [] })
    expect(await clientFor('empty').getStatus()).toMatchObject({ available: true, networks: [] })
  })

  it('connects, clears the address when forgetting, and returns independent snapshots', async () => {
    const client = clientFor('connected')
    const before = await client.getStatus()
    expect(before).toMatchObject({ ssid: 'TreeD_Home', ipAddress: '192.168.0.120' })
    const guest = await client.connect({ ssid: 'TreeD_Guest' })
    expect(guest.networks.filter((network) => network.connected).map((network) => network.ssid)).toEqual(['TreeD_Guest'])
    const forgotten = await client.forget({ ssid: 'TreeD_Guest' })
    expect(forgotten).toMatchObject({ ssid: null, ipAddress: null })
    expect(forgotten.networks.find((network) => network.id === 'guest')).toMatchObject({ saved: false, connected: false })
    expect(before.networks.find((network) => network.id === 'home')?.connected).toBe(true)
  })

  it.each(['scan', 'connect', 'forget'] as const)('keeps state intact on %s error', async (operation) => {
    const client = clientFor(`${operation}-error`)
    const before = await client.getStatus()
    const result = operation === 'scan' ? client.scan() : client[operation]({ ssid: 'TreeD_Home' })
    await expect(result).rejects.toThrow('Не удалось')
    expect(await client.getStatus()).toEqual(before)
  })

  it('holds operations pending for the slow scenario and then completes', async () => {
    vi.useFakeTimers()
    const client = clientFor('slow')
    let completed = false
    const pending = client.scan().then(() => { completed = true })
    await vi.advanceTimersByTimeAsync(3999)
    expect(completed).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(completed).toBe(true)
  })

  it('provides a scrollable fixture with long names', async () => {
    const status = await clientFor('long-names').getStatus()
    expect(status.networks).toHaveLength(12)
    expect(status.networks.some((network) => network.ssid.length === 32)).toBe(true)
  })
})
