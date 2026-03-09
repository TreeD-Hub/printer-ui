import type { PrinterSnapshot, TransportClient } from './types'

function nowIso(): string {
  return new Date().toISOString()
}

export function createMockClient(): TransportClient {
  return {
    async fetchSnapshot(): Promise<PrinterSnapshot> {
      return {
        source: 'mock',
        connection: 'online',
        state: 'printing',
        extruderTemp: 215,
        bedTemp: 58,
        modelFanPercent: 78,
        updatedAt: nowIso(),
        message: 'Design preview mode',
      }
    },
  }
}
