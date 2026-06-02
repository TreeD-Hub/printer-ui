import { createMoonrakerCommandClient } from '../core/commands/moonrakerCommandClient'
import type { CommandClient } from '../core/commands/types'
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
