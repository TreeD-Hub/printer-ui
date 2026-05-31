export type PrinterSource = 'mock' | 'live'

export type PrinterConnectionState =
  | 'connecting'
  | 'online'
  | 'degraded'
  | 'reconnecting'
  | 'offline'
  | 'shutdown'

export interface PrinterHardwareSnapshot {
  marker: 'treed-v2'
  profile: 'treed_v2_corexy_v1'
  host: string
  mainMcu: string
  toolheadMcu: string
  probe: string
  model: string
  revision: string | null
}

export interface PrinterCapabilitiesSnapshot {
  print: boolean
  motion: boolean
  thermal: boolean
  fan: boolean
  filament: boolean
  console: boolean
  eddy: boolean
  shaper: boolean
  motionTest: boolean
  power: boolean
  network: boolean
  cloud: boolean
  updates: boolean
  systemPower: boolean
  camera: boolean
  serviceCommands: boolean
}

export interface PrinterPositionSnapshot {
  x: number
  y: number
  z: number
  e: number
}

export interface PrinterGeometrySnapshot {
  toolhead: PrinterPositionSnapshot
  gcode: PrinterPositionSnapshot
  homingOrigin: PrinterPositionSnapshot
  absoluteCoordinates: boolean
  absoluteExtrude: boolean
  speedFactor: number
  speed: number
  extrudeFactor: number
}

export interface PrinterFilesSnapshot {
  type: 'virtual_sdcard' | 'unknown'
  path: string | null
  progress: number
  isActive: boolean
  filePosition: number
  fileSize: number | null
}

export interface PrinterPrintJobSnapshot {
  filename: string
  filePath: string | null
  state: string
  message: string
  progress: number
  progressPercent: number
  totalDurationSec: number
  printDurationSec: number
  filamentUsedMm: number
  currentLayer: number | null
  totalLayer: number | null
  isPaused: boolean
  isActive: boolean
}

export interface PrinterMacroStateSnapshot {
  available: string[]
  values: Record<string, Record<string, unknown>>
}

export interface PrinterFileItemSnapshot {
  id: string
  name: string
  printTime: string
  weight: string
  material: string
  addedAt: string
}

export interface PrinterToolheadRuntimeSnapshot {
  rawX: number
  rawY: number
  rawZ: number
  rawE: number
  printOffsetX: number
  printOffsetY: number
  homedAxes: string
  coordinateMode: 'raw'
}

export type PrinterEddyStatus = 'unknown' | 'ready' | 'uncalibrated' | 'requires_xy_home'

export interface PrinterV2Snapshot {
  branch: 'treed-v2'
  profile: 'treed_v2_corexy_v1'
  eddy: {
    status: PrinterEddyStatus
    autosaveEnabled: boolean
    autosavePending: boolean
  }
}

export interface PrinterRuntimeSnapshot {
  source: PrinterSource
  connection: PrinterConnectionState
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
  hardware: PrinterHardwareSnapshot
  capabilities: PrinterCapabilitiesSnapshot
  printJob: PrinterPrintJobSnapshot
  files: PrinterFilesSnapshot
  toolhead: PrinterToolheadRuntimeSnapshot
  geometry: PrinterGeometrySnapshot
  macros: PrinterMacroStateSnapshot
  printFiles: PrinterFileItemSnapshot[]
  v2: PrinterV2Snapshot
}

export type PrinterSnapshot = PrinterRuntimeSnapshot

export interface TransportSubscriptionHandlers {
  onSnapshot: (snapshot: PrinterSnapshot) => void
  onConnectionChange: (connection: PrinterConnectionState, message?: string) => void
  onError?: (message: string) => void
}

export interface TransportSubscription {
  close: () => void
}

export interface TransportClient {
  fetchSnapshot: () => Promise<PrinterSnapshot>
  subscribe?: (handlers: TransportSubscriptionHandlers) => TransportSubscription
}
