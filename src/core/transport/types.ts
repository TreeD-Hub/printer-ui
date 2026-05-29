export interface PrinterSnapshot {
  source: 'mock' | 'live'
  connection: 'online' | 'offline'
  wifiSsid: string
  ipAddress: string
  state: string
  toolheadX: number
  toolheadY: number
  toolheadZ: number
  homedAxes: string
  extruderTemp: number
  bedTemp: number
  modelFanPercent: number
  updatedAt: string
  message: string
}

export interface TransportClient {
  fetchSnapshot: () => Promise<PrinterSnapshot>
}
