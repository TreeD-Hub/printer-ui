import type {
  PrinterCapabilitiesSnapshot,
  PrinterConnectionState,
  PrinterEddyStatus,
  PrinterFileItem,
  PrinterLimits,
} from '@treed/printer-logic'

export type {
  PrinterCapabilitiesSnapshot,
  PrinterConnectionState,
  PrinterEddyStatus,
  PrinterFileItem,
  PrinterLimits,
} from '@treed/printer-logic'

export type PrinterSource = 'mock' | 'live'
export type PrinterTransportState = 'connecting' | 'online' | 'reconnecting' | 'offline'
export type PrinterKlippyState = 'startup' | 'ready' | 'shutdown' | 'error' | 'disconnected'
export type PrinterRevisionSource = 'mock' | 'http' | 'websocket'

export interface PrinterDataRevision {
  eventtime: number | null
  receivedAt: number
  source: PrinterRevisionSource
}

export interface PrinterRuntimeRevisions {
  printerObjects: PrinterDataRevision
  files: PrinterDataRevision | null
}

export interface PrinterTransportSnapshot {
  state: PrinterTransportState
  message: string | null
}

export interface PrinterKlippySnapshot {
  state: PrinterKlippyState
  message: string
}

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

export interface PrinterUiContractSnapshot {
  status: 'legacy' | 'compatible' | 'incompatible'
  expectedVersion: '1.0'
  contractVersion: string | null
  profile: string | null
  requiredMacros: string[]
  missingMacros: string[]
  message: string | null
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

export interface PrinterThermalTargetsSnapshot {
  nozzle: number
  bed: number
}

export interface PrinterRuntimeTuneSnapshot {
  contractVersion: string | null
  speedFactorPercent: number
  flowFactorPercent: number
  accelMmS2: number
  pressureAdvance: number
  retractLengthMm: number
  appliedBabystepMm: number
}

export interface PrinterFilesSnapshot {
  type: 'virtual_sdcard' | 'unknown'
  path: string | null
  progress: number
  isActive: boolean
  filePosition: number
  fileSize: number | null
}

export interface PrinterFileListStatusSnapshot {
  state: 'unknown' | 'ready' | 'error'
  message: string | null
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

export type PrinterFileItemSnapshot = PrinterFileItem

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
  revisions: PrinterRuntimeRevisions
  transport: PrinterTransportSnapshot
  klippy: PrinterKlippySnapshot
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
  uiContract: PrinterUiContractSnapshot
  capabilities: PrinterCapabilitiesSnapshot
  limits: PrinterLimits
  printJob: PrinterPrintJobSnapshot
  files: PrinterFilesSnapshot
  fileList?: PrinterFileListStatusSnapshot
  toolhead: PrinterToolheadRuntimeSnapshot
  geometry: PrinterGeometrySnapshot
  thermalTargets: PrinterThermalTargetsSnapshot
  runtimeTune: PrinterRuntimeTuneSnapshot
  macros: PrinterMacroStateSnapshot
  printFiles: PrinterFileItemSnapshot[]
  v2: PrinterV2Snapshot
}

export type PrinterSnapshot = PrinterRuntimeSnapshot

export interface TransportSubscriptionHandlers {
  onSnapshot: (snapshot: PrinterSnapshot) => void
  onConnectionChange: (connection: PrinterConnectionState, message?: string) => void
  onError?: (message: string) => void
  onFileListChanged?: () => void
  onGcodeResponse?: (message: string) => void
}

export interface TransportSubscription {
  close: () => void
}

export interface TransportClient {
  fetchSnapshot: () => Promise<PrinterSnapshot>
  deletePrintFile?: (path: string) => Promise<void>
  subscribe?: (handlers: TransportSubscriptionHandlers) => TransportSubscription
}
