import type {
  PrinterCapabilitiesSnapshot,
  PrinterConnectionState,
  PrinterEddyStatus,
  PrinterFileItem,
  PrinterExcludeObjectSnapshot,
  FilamentSensorSnapshot,
  PrinterLimits,
  PrinterTransportState,
} from '@treed/printer-logic'

export type {
  PrinterCapabilitiesSnapshot,
  PrinterConnectionState,
  PrinterEddyStatus,
  PrinterFileItem,
  PrinterExcludeObjectSnapshot,
  FilamentSensorSnapshot,
  PrinterLimits,
  PrinterTransportState,
} from '@treed/printer-logic'

export type PrinterSource = 'mock' | 'live'
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

export interface PrinterUsageSnapshot {
  totalPrintTimeSec: number | null
  totalJobTimeSec: number | null
  totalJobs: number | null
  totalFilamentUsedMm: number | null
  longestPrintSec: number | null
  updatedAt: string | null
  state: 'ready' | 'unavailable'
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

export type PrinterEddyCalibrationStep = 'not_started' | 'primary' | 'temperature' | 'z0' | 'screws' | 'mesh' | 'complete'
export type PrinterEddyOperatorPrompt =
  | 'none'
  | 'drive_current'
  | 'paper_test'
  | 'temperature_points'
  | 'verify_z0'
  | 'adjust_screws'
  | 'mesh_scan'
  | 'restart'

export interface PrinterEddyCalibrationSnapshot {
  activeStep: PrinterEddyCalibrationStep
  operatorPrompt: PrinterEddyOperatorPrompt
  driveCurrentDone: boolean
  primaryDone: boolean
  temperatureDone: boolean
  z0Done: boolean
  screwsDone: boolean
  meshDone: boolean
  requiredDone: boolean
}

export interface PrinterV2Snapshot {
  branch: 'treed-v2'
  profile: 'treed_v2_corexy_v1'
  eddy: {
    status: PrinterEddyStatus
    autosaveEnabled: boolean
    autosavePending: boolean
    calibration: PrinterEddyCalibrationSnapshot
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
  mainLightEnabled: boolean
  updatedAt: string
  message: string
  hardware: PrinterHardwareSnapshot
  uiContract: PrinterUiContractSnapshot
  capabilities: PrinterCapabilitiesSnapshot
  filamentSensor: FilamentSensorSnapshot
  limits: PrinterLimits
  usage: PrinterUsageSnapshot
  printJob: PrinterPrintJobSnapshot
  excludeObjects: PrinterExcludeObjectSnapshot
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

export type PrinterEddyStateSnapshot = Pick<
  PrinterV2Snapshot['eddy'],
  'autosaveEnabled' | 'autosavePending' | 'calibration'
>

export type PrinterPrintJobStateSnapshot = Pick<
  PrinterSnapshot,
  'excludeObjects' | 'files' | 'message' | 'printJob' | 'state' | 'updatedAt'
>

export type PrinterPrintFilesStateSnapshot = Pick<
  PrinterSnapshot,
  'fileList' | 'printFiles' | 'revisions'
>

export type PrinterMotionStateSnapshot = Pick<
  PrinterSnapshot,
  'geometry' | 'homedAxes' | 'message' | 'state' | 'toolhead' | 'toolheadX' | 'toolheadY' | 'toolheadZ' | 'updatedAt'
> & {
  eddyStatus: PrinterV2Snapshot['eddy']['status']
}

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
  fetchUsage: () => Promise<PrinterUsageSnapshot>
  fetchFilamentSensor: () => Promise<FilamentSensorSnapshot>
  fetchEddyState: () => Promise<PrinterEddyStateSnapshot>
  fetchExcludeObjects: () => Promise<PrinterExcludeObjectSnapshot>
  fetchPrintJobState: () => Promise<PrinterPrintJobStateSnapshot>
  fetchPrintFilesState: () => Promise<PrinterPrintFilesStateSnapshot>
  fetchMotionState: () => Promise<PrinterMotionStateSnapshot>
  deletePrintFile?: (path: string) => Promise<void>
  subscribe?: (handlers: TransportSubscriptionHandlers) => TransportSubscription
}
