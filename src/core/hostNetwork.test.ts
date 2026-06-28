import { describe, expect, it, vi } from 'vitest'

import { createUnavailableHostNetworkStatus } from '@treed/printer-logic'
import { createMoonrakerHostNetworkClient } from './hostNetwork'

const statusPayload = {
  available: true,
  ssid: 'TreeD Lab',
  ipAddress: '192.168.0.42',
  message: 'ready',
  networks: [
    {
      id: 'treed-lab',
      ssid: 'TreeD Lab',
      signalPercent: 87,
      security: 'wpa2',
      saved: true,
      connected: true,
    },
  ],
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
    ...init,
  })
}

describe('createMoonrakerHostNetworkClient', () => {
  it('binds the default fetch implementation to the browser global', async () => {
    const fetchMock = vi.fn(function (this: typeof globalThis) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation')
      }

      return Promise.resolve(jsonResponse(statusPayload))
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      const client = createMoonrakerHostNetworkClient({
        moonrakerUrl: 'http://moonraker.local',
      })

      await expect(client.scan()).resolves.toEqual(statusPayload)
      expect(fetchMock).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('maps host network operations to Moonraker network endpoints', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(statusPayload))
      .mockResolvedValueOnce(jsonResponse({ ...statusPayload, message: 'scan complete' }))
      .mockResolvedValueOnce(jsonResponse({ ...statusPayload, message: 'connected' }))
      .mockResolvedValueOnce(jsonResponse({ ...statusPayload, ssid: null, message: 'forgotten' }))
    const client = createMoonrakerHostNetworkClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await expect(client.getStatus()).resolves.toEqual(statusPayload)
    await expect(client.scan()).resolves.toMatchObject({ message: 'scan complete' })
    await expect(client.connect({ ssid: 'TreeD Lab', password: 'secret' })).resolves.toMatchObject({ message: 'connected' })
    await expect(client.forget({ ssid: 'TreeD Lab' })).resolves.toMatchObject({ message: 'forgotten' })

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://moonraker.local/server/treed/network/status', {
      method: 'GET',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://moonraker.local/server/treed/network/scan', {
      method: 'POST',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://moonraker.local/server/treed/network/connect', {
      body: JSON.stringify({ ssid: 'TreeD Lab', password: 'secret' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(4, 'http://moonraker.local/server/treed/network/forget', {
      body: JSON.stringify({ ssid: 'TreeD Lab' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
  })

  it('surfaces Moonraker endpoint errors as host network errors', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      error: {
        message: 'network component missing',
      },
    }, { status: 404 }))
    const client = createMoonrakerHostNetworkClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await expect(client.getStatus()).rejects.toThrow('network component missing')
  })

  it('returns unavailable status when Moonraker returns invalid host network payload', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      result: 'not a host network status',
    }))
    const client = createMoonrakerHostNetworkClient({
      moonrakerUrl: 'http://moonraker.local',
      fetchImpl: fetchMock,
    })

    await expect(client.getStatus()).resolves.toEqual(
      createUnavailableHostNetworkStatus('Moonraker network endpoint returned invalid HostNetworkStatus.'),
    )
  })
})
