import { invoke } from '@tauri-apps/api/core'
import { createMoonrakerCommandClient } from '../core/commands/moonrakerCommandClient'
import type { CommandClient } from '../core/commands/types'
import {
  createUnavailableHostNetworkStatus,
  type HostNetworkClient,
  type HostNetworkStatus,
} from '../core/hostNetwork'
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
  return {
    getStatus() {
      return invokeHostNetwork('network_status')
    },
    scan() {
      return invokeHostNetwork('network_scan')
    },
    connect({ ssid, password }) {
      return invokeHostNetwork('network_connect', { ssid, password: password ?? null })
    },
    forget({ ssid }) {
      return invokeHostNetwork('network_forget', { ssid })
    },
  }
}
