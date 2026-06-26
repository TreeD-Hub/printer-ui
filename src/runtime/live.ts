import { invoke } from '@tauri-apps/api/core'
import { createMoonrakerCommandClient } from '../core/commands/moonrakerCommandClient'
import type { CommandClient } from '../core/commands/types'
import {
  createMoonrakerHostNetworkClient,
  createUnavailableHostNetworkStatus,
  isMoonrakerHostNetworkEndpointUnavailable,
  type HostNetworkClient,
  type HostNetworkStatus,
} from '../core/hostNetwork'
import {
  createMoonrakerHostUpdateClient,
  type HostUpdateClient,
} from '../core/hostUpdate'
import { createMoonrakerClient } from '../core/transport/moonrakerClient'
import type { PrinterSource, TransportClient } from '../core/transport/types'

type RuntimeCommandClientOptions = {
  capabilities?: {
    power?: boolean
  }
}

export const runtimeMode: PrinterSource = 'live'

export function createTransportClient(): TransportClient {
  return createMoonrakerClient()
}

export function createCommandClient(options: RuntimeCommandClientOptions = {}): CommandClient {
  return createMoonrakerCommandClient(options)
}

function isTauriRuntimeAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function invokeHostNetwork(command: string, args?: Record<string, unknown>): Promise<HostNetworkStatus> {
  if (!isTauriRuntimeAvailable()) {
    return Promise.resolve(createUnavailableHostNetworkStatus('Tauri host network bridge недоступен.'))
  }

  return invoke<HostNetworkStatus>(command, args)
}

export function createHostNetworkClient(): HostNetworkClient {
  const moonrakerNetworkClient = createMoonrakerHostNetworkClient()

  function withTauriFallback(
    moonrakerRequest: () => Promise<HostNetworkStatus>,
    tauriCommand: string,
    tauriArgs?: Record<string, unknown>,
  ): Promise<HostNetworkStatus> {
    return moonrakerRequest().catch((error: unknown) => {
      if (isTauriRuntimeAvailable() && isMoonrakerHostNetworkEndpointUnavailable(error)) {
        return invokeHostNetwork(tauriCommand, tauriArgs)
      }

      throw error
    })
  }

  return {
    getStatus() {
      return withTauriFallback(
        () => moonrakerNetworkClient.getStatus(),
        'network_status',
      )
    },
    scan() {
      return withTauriFallback(
        () => moonrakerNetworkClient.scan(),
        'network_scan',
      )
    },
    connect({ ssid, password }) {
      return withTauriFallback(
        () => moonrakerNetworkClient.connect({ ssid, password }),
        'network_connect',
        { ssid, password: password ?? null },
      )
    },
    forget({ ssid }) {
      return withTauriFallback(
        () => moonrakerNetworkClient.forget({ ssid }),
        'network_forget',
        { ssid },
      )
    },
  }
}

export function createHostUpdateClient(): HostUpdateClient {
  return createMoonrakerHostUpdateClient()
}
