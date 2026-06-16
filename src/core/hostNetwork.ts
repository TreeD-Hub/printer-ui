import type { WifiNetworkItem } from '@treed/printer-logic'

export type HostNetworkStatus = {
  available: boolean
  ssid: string | null
  ipAddress: string | null
  message: string
  networks: WifiNetworkItem[]
}

export type HostNetworkConnectArgs = {
  ssid: string
  password?: string
}

export type HostNetworkForgetArgs = {
  ssid: string
}

export type HostNetworkClient = {
  getStatus: () => Promise<HostNetworkStatus>
  scan: () => Promise<HostNetworkStatus>
  connect: (args: HostNetworkConnectArgs) => Promise<HostNetworkStatus>
  forget: (args: HostNetworkForgetArgs) => Promise<HostNetworkStatus>
}

export function createUnavailableHostNetworkStatus(message: string): HostNetworkStatus {
  return {
    available: false,
    ssid: null,
    ipAddress: null,
    message,
    networks: [],
  }
}

export function areHostNetworkStatusesEqual(left: HostNetworkStatus, right: HostNetworkStatus): boolean {
  return (
    left.available === right.available &&
    left.ssid === right.ssid &&
    left.ipAddress === right.ipAddress &&
    left.message === right.message &&
    left.networks.length === right.networks.length &&
    left.networks.every((leftNetwork, index) => {
      const rightNetwork = right.networks[index]
      return (
        rightNetwork !== undefined &&
        leftNetwork.id === rightNetwork.id &&
        leftNetwork.ssid === rightNetwork.ssid &&
        leftNetwork.signalPercent === rightNetwork.signalPercent &&
        leftNetwork.security === rightNetwork.security &&
        leftNetwork.saved === rightNetwork.saved &&
        leftNetwork.connected === rightNetwork.connected
      )
    })
  )
}

export function getHostNetworkErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }

  return fallback
}
