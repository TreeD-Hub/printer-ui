export interface PrinterSnapshot {
  source: 'mock' | 'live'
  connection: 'online' | 'offline'
  state: string
  extruderTemp: number
  bedTemp: number
  modelFanPercent: number
  updatedAt: string
  message: string
}

export interface TransportClient {
  fetchSnapshot: () => Promise<PrinterSnapshot>
}

