import {
  areHostNetworkStatusesEqual,
  createUnavailableHostNetworkStatus,
  getHostNetworkErrorMessage,
  normalizeHostNetworkStatus,
  type HostNetworkClient,
  type HostNetworkConnectArgs,
  type HostNetworkForgetArgs,
  type HostNetworkStatus,
} from '@treed/printer-logic'
import { moonrakerUrl } from '../config'

export {
  areHostNetworkStatusesEqual,
  createUnavailableHostNetworkStatus,
  getHostNetworkErrorMessage,
  normalizeHostNetworkStatus,
  type HostNetworkClient,
  type HostNetworkConnectArgs,
  type HostNetworkForgetArgs,
  type HostNetworkStatus,
}

export class MoonrakerHostNetworkError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MoonrakerHostNetworkError'
    this.status = status
  }
}

type MoonrakerHostNetworkClientOptions = {
  moonrakerUrl?: string
  fetchImpl?: typeof fetch
}

const HOST_NETWORK_STATUS_TIMEOUT_MS = 8_000
const HOST_NETWORK_SCAN_TIMEOUT_MS = 30_000
const HOST_NETWORK_CONNECT_TIMEOUT_MS = 60_000
const HOST_NETWORK_FORGET_TIMEOUT_MS = 30_000

function readMoonrakerErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const message = 'message' in body ? body.message : undefined
    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }

    const error = 'error' in body ? body.error : undefined
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const errorMessage = error.message
      if (typeof errorMessage === 'string' && errorMessage.trim().length > 0) {
        return errorMessage
      }
    }
  }

  return fallback
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.trim().length === 0) {
    return null
  }

  return JSON.parse(text) as unknown
}

async function requestHostNetworkStatus(
  path: string,
  init: RequestInit,
  options: Required<MoonrakerHostNetworkClientOptions>,
  timeoutMs: number,
): Promise<HostNetworkStatus> {
  const controller = new AbortController()
  let didTimeout = false
  const timeoutId = setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await options.fetchImpl(`${options.moonrakerUrl}${path}`, {
      ...init,
      signal: controller.signal,
    })
    const body = await readJsonResponse(response)

    if (!response.ok) {
      throw new MoonrakerHostNetworkError(
        readMoonrakerErrorMessage(body, `Moonraker network endpoint failed with HTTP ${response.status}`),
        response.status,
      )
    }

    return normalizeHostNetworkStatus(
      body,
      'Moonraker network endpoint returned invalid HostNetworkStatus.',
    )
  } catch (error) {
    if (didTimeout || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new MoonrakerHostNetworkError(
        `Moonraker network endpoint timed out after ${timeoutMs}ms`,
        408,
      )
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export function isMoonrakerHostNetworkEndpointUnavailable(error: unknown): boolean {
  return (
    error instanceof MoonrakerHostNetworkError &&
    (error.status === 404 || error.status === 501)
  )
}

export function createMoonrakerHostNetworkClient(
  options: MoonrakerHostNetworkClientOptions = {},
): HostNetworkClient {
  const clientOptions = {
    moonrakerUrl: options.moonrakerUrl ?? moonrakerUrl,
    fetchImpl: options.fetchImpl ?? fetch.bind(globalThis),
  }

  return {
    getStatus() {
      return requestHostNetworkStatus(
        '/server/treed/network/status',
        { method: 'GET' },
        clientOptions,
        HOST_NETWORK_STATUS_TIMEOUT_MS,
      )
    },
    scan() {
      return requestHostNetworkStatus(
        '/server/treed/network/scan',
        { method: 'POST' },
        clientOptions,
        HOST_NETWORK_SCAN_TIMEOUT_MS,
      )
    },
    connect({ ssid, password }) {
      return requestHostNetworkStatus(
        '/server/treed/network/connect',
        {
          body: JSON.stringify({ ssid, password: password ?? null }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
        clientOptions,
        HOST_NETWORK_CONNECT_TIMEOUT_MS,
      )
    },
    forget({ ssid }) {
      return requestHostNetworkStatus(
        '/server/treed/network/forget',
        {
          body: JSON.stringify({ ssid }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
        clientOptions,
        HOST_NETWORK_FORGET_TIMEOUT_MS,
      )
    },
  }
}
