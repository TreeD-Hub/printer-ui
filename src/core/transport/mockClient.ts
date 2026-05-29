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
        wifiSsid: 'TreeD-Lab',
        ipAddress: '192.168.0.21',
        state: 'printing',
        toolheadX: 125,
        toolheadY: 125,
        toolheadZ: 12.4,
        homedAxes: 'xyz',
        extruderTemp: 215,
        bedTemp: 58,
        modelFanPercent: 78,
        updatedAt: nowIso(),
        message: 'Design preview mode',
      }
    },
  }
}
