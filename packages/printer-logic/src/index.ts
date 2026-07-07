export type PrinterDataMode = 'mock' | 'live'
export type PrinterConnectionState =
  | 'connecting'
  | 'online'
  | 'degraded'
  | 'reconnecting'
  | 'offline'
  | 'shutdown'
export type PrinterConnection = PrinterConnectionState
export type PrinterTransportState = 'connecting' | 'online' | 'reconnecting' | 'offline'

export type PrinterCommandId =
  | 'start'
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'emergencyStop'
  | 'home'
  | 'homeAll'
  | 'homeX'
  | 'homeY'
  | 'homeXY'
  | 'homeZ'
  | 'moveAxis'
  | 'setNozzleTarget'
  | 'setBedTarget'
  | 'setHeatingTargets'
  | 'turnOffHeaters'
  | 'setFanPercent'
  | 'setMainLightEnabled'
  | 'setPrintSpeedFactorPercent'
  | 'setPrintFlowFactorPercent'
  | 'setPrintAccel'
  | 'setPressureAdvance'
  | 'setRetractionLength'
  | 'adjustZOffset'
  | 'excludeObject'
  | 'loadFilament'
  | 'unloadFilament'
  | 'setFilamentSensorMode'
  | 'setFilamentEncoderSensitivity'
  | 'zParkZeroEddy'
  | 'eddyDriveCurrentCalibrate'
  | 'eddyPrimaryHeightStart'
  | 'eddyPrimaryAcceptSave'
  | 'eddyTemperatureStart'
  | 'eddyTemperatureAcceptSave'
  | 'eddyCheckZ0'
  | 'eddyScrewsTiltStart'
  | 'eddyScrewsTiltDone'
  | 'eddyBedMeshCalibrate'
  | 'eddyAutosaveEnable'
  | 'eddyAutosaveDisable'
  | 'eddyAutosaveStatus'
  | 'eddyTestZ'
  | 'shaperCalibrateLight'
  | 'shaperCalibrateFull'
  | 'xyMotionTest'
  | 'disableMotors'
  | 'consoleGcode'
  | 'rebootHost'
  | 'restartKlipper'
  | 'firmwareRestart'
  | 'restartUi'
  | 'restartMoonraker'
  | 'shutdownHost'

export type PrinterCommandPendingDomain =
  | 'light'
  | 'fan'
  | 'thermal'
  | 'print'
  | 'motion'
  | 'filament'
  | 'system'
  | 'critical'

export type PrinterPendingCommands = Partial<Record<PrinterCommandPendingDomain, PrinterCommandId | null>>

const PRINTER_PENDING_DOMAIN_ORDER: readonly PrinterCommandPendingDomain[] = [
  'critical',
  'print',
  'motion',
  'thermal',
  'fan',
  'light',
  'filament',
  'system',
]

export type AxisId = 'X' | 'Y' | 'Z'
export type FilamentSensorMode = 'presence' | 'motion'
export type FilamentSensorSensitivity = 'low' | 'medium' | 'high'

export type FilamentSensorSnapshot = {
  supported: boolean
  motionSupported: boolean
  mode: FilamentSensorMode
  sensitivity: FilamentSensorSensitivity
  filamentDetected: boolean | null
  switchEnabled: boolean
  motionEnabled: boolean
  message: string | null
}

export type ExecuteCommandArgs =
  | {
      command: 'start'
      filename: string
    }
  | {
      command: 'pause' | 'resume' | 'cancel' | 'emergencyStop'
    }
  | {
      command:
        | 'home'
        | 'homeAll'
        | 'homeX'
        | 'homeY'
        | 'homeXY'
        | 'homeZ'
        | 'turnOffHeaters'
        | 'disableMotors'
        | 'zParkZeroEddy'
        | 'eddyDriveCurrentCalibrate'
        | 'eddyPrimaryHeightStart'
        | 'eddyPrimaryAcceptSave'
        | 'eddyTemperatureStart'
        | 'eddyTemperatureAcceptSave'
        | 'eddyCheckZ0'
        | 'eddyScrewsTiltStart'
        | 'eddyScrewsTiltDone'
        | 'eddyBedMeshCalibrate'
        | 'eddyAutosaveEnable'
        | 'eddyAutosaveDisable'
        | 'eddyAutosaveStatus'
        | 'shaperCalibrateLight'
        | 'shaperCalibrateFull'
        | 'xyMotionTest'
        | 'rebootHost'
        | 'restartKlipper'
        | 'firmwareRestart'
        | 'restartUi'
        | 'restartMoonraker'
        | 'shutdownHost'
    }
  | {
      command: 'moveAxis'
      axis: AxisId
      distanceMm: number
      feedRateMmPerMin?: number
      speedMmS?: number
    }
  | {
      command: 'setNozzleTarget' | 'setBedTarget'
      targetCelsius: number
      wait?: boolean
    }
  | {
      command: 'setHeatingTargets'
      nozzleCelsius: number
      bedCelsius: number
    }
  | {
      command: 'setFanPercent'
      percent: number
    }
  | {
      command: 'setMainLightEnabled'
      enabled: boolean
    }
  | {
      command: 'setPrintSpeedFactorPercent' | 'setPrintFlowFactorPercent'
      percent: number
    }
  | {
      command: 'setPrintAccel'
      accelMmS2: number
    }
  | {
      command: 'setPressureAdvance'
      advance: number
    }
  | {
      command: 'setRetractionLength'
      retractLengthMm: number
    }
  | {
      command: 'adjustZOffset'
      deltaMm: number
    }
  | {
      command: 'excludeObject'
      objectName: string
    }
  | {
      command: 'loadFilament' | 'unloadFilament'
      lengthMm?: number
      speedMmS?: number
    }
  | {
      command: 'setFilamentSensorMode'
      mode: FilamentSensorMode
    }
  | {
      command: 'setFilamentEncoderSensitivity'
      sensitivity: FilamentSensorSensitivity
    }
  | {
      command: 'eddyTestZ'
      deltaMm: number
    }
  | {
      command: 'consoleGcode'
      gcode?: string
      script?: string
    }

export interface CommandSuccessResult {
  command: PrinterCommandId
  ok: true
  status: 'accepted' | 'confirmed'
  message: string
  at: string
}

export interface CommandUnsupportedResult {
  command: PrinterCommandId
  ok: false
  kind: 'unsupported'
  message: string
  at: string
}

export interface CommandFailedResult {
  command: PrinterCommandId
  ok: false
  kind: 'failed' | 'confirmation_timeout'
  message: string
  at: string
}

export type CommandResult = CommandSuccessResult | CommandUnsupportedResult | CommandFailedResult

export interface CommandClient {
  execute: (args: ExecuteCommandArgs) => Promise<CommandResult>
}

export type WifiNetworkSecurity = 'open' | 'wpa2' | 'wpa3'

export interface WifiNetworkItem {
  id: string
  ssid: string
  signalPercent: number
  security: WifiNetworkSecurity
  saved: boolean
  connected: boolean
}

export interface HostNetworkStatus {
  available: boolean
  ssid: string | null
  ipAddress: string | null
  message: string
  networks: WifiNetworkItem[]
}

export interface HostNetworkConnectArgs {
  ssid: string
  password?: string
}

export interface HostNetworkForgetArgs {
  ssid: string
}

export interface HostNetworkClient {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeWifiNetworkSecurity(value: unknown): WifiNetworkSecurity {
  if (value === 'open' || value === 'wpa2' || value === 'wpa3') {
    return value
  }

  return 'wpa2'
}

function normalizeSignalPercent(value: unknown): number {
  const percent = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(percent)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(percent)))
}

function normalizeWifiNetworkItem(value: unknown): WifiNetworkItem | null {
  if (!isRecord(value)) {
    return null
  }

  const ssid = nonEmptyString(value.ssid)
  if (ssid === null) {
    return null
  }

  return {
    id: nonEmptyString(value.id) ?? ssid,
    ssid,
    signalPercent: normalizeSignalPercent(value.signalPercent),
    security: normalizeWifiNetworkSecurity(value.security),
    saved: value.saved === true,
    connected: value.connected === true,
  }
}

export function normalizeHostNetworkStatus(value: unknown, fallbackMessage: string): HostNetworkStatus {
  if (!isRecord(value) || typeof value.available !== 'boolean') {
    return createUnavailableHostNetworkStatus(fallbackMessage)
  }

  const message = nonEmptyString(value.message) ?? fallbackMessage

  if (!value.available) {
    return createUnavailableHostNetworkStatus(message)
  }

  const networks = Array.isArray(value.networks)
    ? value.networks.flatMap((network) => {
        const normalizedNetwork = normalizeWifiNetworkItem(network)
        return normalizedNetwork === null ? [] : [normalizedNetwork]
      })
    : []

  return {
    available: true,
    ssid: nonEmptyString(value.ssid),
    ipAddress: nonEmptyString(value.ipAddress),
    message,
    networks,
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

export interface PrinterCapabilitiesSnapshot {
  print: boolean
  motion: boolean
  thermal: boolean
  fan: boolean
  lighting: boolean
  filament: boolean
  filamentSensorControl: boolean
  filamentEncoderSensitivity: boolean
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

export type PrinterEddyStatus = 'unknown' | 'ready' | 'uncalibrated' | 'requires_xy_home'

export type PrinterExcludeObjectPoint = {
  x: number
  y: number
}

export type PrinterExcludeObjectItem = {
  name: string
  displayName: string
  center: PrinterExcludeObjectPoint | null
  polygon: PrinterExcludeObjectPoint[] | null
  isCurrent: boolean
  isExcluded: boolean
}

export type PrinterExcludeObjectSnapshot = {
  supported: boolean
  state: 'unavailable' | 'waiting' | 'ready'
  objects: PrinterExcludeObjectItem[]
  currentObjectName: string | null
  excludedObjectNames: string[]
  message: string | null
}

export interface PrinterSnapshot {
  source: PrinterDataMode
  connection: PrinterConnection
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

export interface PrinterAxisLimit {
  min: number
  max: number
}

export interface PrinterLimits {
  nozzleMaxC: number
  bedMaxC: number
  axis: Record<AxisId, PrinterAxisLimit>
}

export const TREED_V2_COREXY_V1_LIMITS: PrinterLimits = {
  nozzleMaxC: 280,
  bedMaxC: 120,
  axis: {
    X: { min: 0, max: 245 },
    Y: { min: 0, max: 245 },
    Z: { min: -5, max: 255 },
  },
}

export function filterWifiNetworks(networks: readonly WifiNetworkItem[], query: string): WifiNetworkItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU')

  return networks
    .filter((item) => item.ssid.toLocaleLowerCase('ru-RU').includes(normalizedQuery))
    .sort((left, right) => {
      if (left.connected !== right.connected) {
        return left.connected ? -1 : 1
      }
      return right.signalPercent - left.signalPercent
    })
}

export function getPreferredWifiNetworkId(
  networks: readonly WifiNetworkItem[],
  previousNetworkId: string | null,
): string | null {
  return (
    networks.find((item) => item.connected)?.id ??
    networks.find((item) => item.id === previousNetworkId)?.id ??
    networks[0]?.id ??
    null
  )
}

export interface PrinterFileItem {
  id: string
  path: string
  name: string
  directory: string | null
  printTime: string
  weight: string
  material: string
  addedAt: string
  metadataStatus?: PrinterFileMetadataStatus
  metadataError?: string | null
  preview?: PrinterFilePreview
}

export type PrinterFileMetadataStatus = 'idle' | 'queued' | 'loading' | 'ready' | 'error'

export interface PrinterFilePreviewImage {
  src: string
  width: 48 | 300
  height: 48 | 300
  format: 'png'
}

export interface PrinterFilePreview {
  small?: PrinterFilePreviewImage
  large?: PrinterFilePreviewImage
}

export type PrinterFileSortKey = 'name' | 'addedAt'

export function normalizePrinterFilePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\/+/, '')
}

export function normalizePrinterFileId(path: string): string {
  const slug = normalizePrinterFilePath(path)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `file-${slug || 'gcode'}`
}

export function getPrinterFileNameFromPath(path: string): string {
  const normalizedPath = normalizePrinterFilePath(path)
  const lastSlashIndex = normalizedPath.lastIndexOf('/')

  return lastSlashIndex === -1 ? normalizedPath : normalizedPath.slice(lastSlashIndex + 1)
}

export function getPrinterFileDirectoryFromPath(path: string): string | null {
  const normalizedPath = normalizePrinterFilePath(path)
  const lastSlashIndex = normalizedPath.lastIndexOf('/')

  if (lastSlashIndex <= 0) {
    return null
  }

  return normalizedPath.slice(0, lastSlashIndex)
}

export function sortPrinterFileItems<T extends Pick<PrinterFileItem, 'name' | 'addedAt'>>(
  items: readonly T[],
  sortKey: PrinterFileSortKey,
): T[] {
  const nextItems = [...items]

  if (sortKey === 'addedAt') {
    nextItems.sort((left, right) => Date.parse(right.addedAt) - Date.parse(left.addedAt))
    return nextItems
  }

  nextItems.sort((left, right) => left.name.localeCompare(right.name, 'en'))
  return nextItems
}

export interface ActionAvailability {
  enabled: boolean
  reason: string | null
  blockingState: string | null
}

export interface PrinterCapabilityContext {
  pendingCommand?: PrinterCommandId | null
  pendingCommands?: PrinterPendingCommands
  scenarioLocks: string[]
}

export interface PrinterCapabilities {
  print: Record<'start' | 'pause' | 'resume' | 'cancel', ActionAvailability>
  parking: {
    all: ActionAvailability
    axis: Record<'X' | 'Y' | 'Z', ActionAvailability>
  }
  motion: Record<'xy' | 'z' | 'extruder', ActionAvailability>
  thermal: Record<'nozzle' | 'bed', ActionAvailability>
  fan: {
    model: ActionAvailability
  }
  emergencyStop: ActionAvailability
}

type CapabilityGroup = 'print' | 'parking' | 'motion' | 'thermal' | 'fan' | 'emergencyStop'

const AVAILABLE: ActionAvailability = {
  enabled: true,
  reason: null,
  blockingState: null,
}

const SCENARIO_LOCK_REASONS: Record<string, string> = {
  homing: 'Идет парковка осей',
  calibrationMove: 'Идет перемещение калибровки',
}

const SCENARIO_LOCK_GROUPS: Record<string, CapabilityGroup[]> = {
  homing: ['parking', 'motion'],
  calibrationMove: ['parking', 'motion'],
}

const CAPABILITY_CONNECTION_BLOCKS: Partial<Record<PrinterConnectionState, ActionAvailability>> = {
  connecting: blocked('Идет подключение к принтеру', 'connecting'),
  reconnecting: blocked('Идет восстановление связи с принтером', 'reconnecting'),
  offline: blocked('Принтер офлайн', 'offline'),
  shutdown: blocked('Klipper остановлен', 'shutdown'),
}

function getCapabilityPendingDomain(group: CapabilityGroup): PrinterCommandPendingDomain | null {
  switch (group) {
    case 'print':
      return 'print'
    case 'parking':
    case 'motion':
      return 'motion'
    case 'thermal':
      return 'thermal'
    case 'fan':
      return 'fan'
    case 'emergencyStop':
      return null
  }
}

function getCapabilityPendingCommand(
  group: CapabilityGroup,
  context: PrinterCapabilityContext,
): PrinterCommandId | null {
  const domain = getCapabilityPendingDomain(group)
  if (domain === null) {
    return null
  }

  if (context.pendingCommands !== undefined) {
    return getPrinterPendingCommand(context.pendingCommands, domain)
  }

  return context.pendingCommand ?? null
}

export function normalizeHomedAxes(homedAxes: string): { X: boolean; Y: boolean; Z: boolean } {
  const normalizedAxes = homedAxes.toLocaleLowerCase('en-US')

  return {
    X: normalizedAxes.includes('x'),
    Y: normalizedAxes.includes('y'),
    Z: normalizedAxes.includes('z'),
  }
}

export function getPrinterCapabilities(
  snapshot: PrinterSnapshot,
  context: PrinterCapabilityContext,
): PrinterCapabilities {
  return {
    print: {
      start: resolvePrintAction('start', snapshot, context),
      pause: resolvePrintAction('pause', snapshot, context),
      resume: resolvePrintAction('resume', snapshot, context),
      cancel: resolvePrintAction('cancel', snapshot, context),
    },
    parking: {
      all: resolveRegularAction('parking', snapshot, context),
      axis: {
        X: resolveRegularAction('parking', snapshot, context),
        Y: resolveRegularAction('parking', snapshot, context),
        Z: resolveRegularAction('parking', snapshot, context),
      },
    },
    motion: {
      xy: resolveRegularAction('motion', snapshot, context),
      z: resolveRegularAction('motion', snapshot, context),
      extruder: resolveRegularAction('motion', snapshot, context),
    },
    thermal: {
      nozzle: resolveRegularAction('thermal', snapshot, context),
      bed: resolveRegularAction('thermal', snapshot, context),
    },
    fan: {
      model: resolveRegularAction('fan', snapshot, context),
    },
    emergencyStop: resolveEmergencyStop(snapshot),
  }
}

function resolvePrintAction(
  action: 'start' | 'pause' | 'resume' | 'cancel',
  snapshot: PrinterSnapshot,
  context: PrinterCapabilityContext,
): ActionAvailability {
  const baseAvailability = action === 'cancel'
    ? resolvePendingFreeAction('print', snapshot, context)
    : resolveRegularAction('print', snapshot, context)

  if (!baseAvailability.enabled) {
    return baseAvailability
  }

  const printerState = normalizePrinterState(snapshot.state)

  if (printerState === 'printing') {
    if (action === 'pause' || action === 'cancel') {
      return AVAILABLE
    }

    return blocked('Идет печать', 'printing')
  }

  if (printerState === 'paused') {
    if (action === 'resume' || action === 'cancel') {
      return AVAILABLE
    }

    return blocked('Печать на паузе', 'paused')
  }

  if (action === 'start') {
    return AVAILABLE
  }

  return blocked('Нет активной печати', 'idle')
}

function resolvePendingFreeAction(
  group: CapabilityGroup,
  snapshot: PrinterSnapshot,
  context: PrinterCapabilityContext,
): ActionAvailability {
  const connectionBlock = CAPABILITY_CONNECTION_BLOCKS[snapshot.connection]
  if (connectionBlock !== undefined) {
    return connectionBlock
  }

  const scenarioLock = findBlockingScenarioLock(group, context.scenarioLocks)
  if (scenarioLock !== null) {
    return blocked(SCENARIO_LOCK_REASONS[scenarioLock] ?? 'Сценарий блокирует действие', scenarioLock)
  }

  return AVAILABLE
}

function resolveRegularAction(
  group: CapabilityGroup,
  snapshot: PrinterSnapshot,
  context: PrinterCapabilityContext,
): ActionAvailability {
  const connectionBlock = CAPABILITY_CONNECTION_BLOCKS[snapshot.connection]
  if (connectionBlock !== undefined) {
    return connectionBlock
  }

  if (getCapabilityPendingCommand(group, context) !== null) {
    return blocked('Выполняется команда', 'pendingCommand')
  }

  const scenarioLock = findBlockingScenarioLock(group, context.scenarioLocks)
  if (scenarioLock !== null) {
    return blocked(SCENARIO_LOCK_REASONS[scenarioLock] ?? 'Сценарий блокирует действие', scenarioLock)
  }

  const printerState = normalizePrinterState(snapshot.state)
  if ((group === 'motion' || group === 'parking') && printerState === 'printing') {
    return blocked('Идет печать', 'printing')
  }

  if ((group === 'motion' || group === 'parking') && printerState === 'paused') {
    return blocked('Печать на паузе', 'paused')
  }

  return AVAILABLE
}

function resolveEmergencyStop(snapshot: PrinterSnapshot): ActionAvailability {
  const connectionBlock = CAPABILITY_CONNECTION_BLOCKS[snapshot.connection]
  if (connectionBlock !== undefined) {
    return connectionBlock
  }

  return AVAILABLE
}

function findBlockingScenarioLock(group: CapabilityGroup, scenarioLocks: string[]): string | null {
  for (const scenarioLock of scenarioLocks) {
    const lockedGroups = SCENARIO_LOCK_GROUPS[scenarioLock]

    if (lockedGroups?.includes(group)) {
      return scenarioLock
    }
  }

  return null
}

function normalizePrinterState(state: string): string {
  return state.trim().toLocaleLowerCase('en-US')
}

function blocked(reason: string, blockingState: string): ActionAvailability {
  return {
    enabled: false,
    reason,
    blockingState,
  }
}

export type TreeDCommandRisk = 'safe' | 'caution' | 'danger'

export type TreeDCommandCapability =
  | 'print'
  | 'motion'
  | 'thermal'
  | 'fan'
  | 'lighting'
  | 'filament'
  | 'filamentSensorControl'
  | 'filamentEncoderSensitivity'
  | 'console'
  | 'eddy'
  | 'shaper'
  | 'motionTest'
  | 'power'
  | 'serviceCommands'

export interface TreeDCommandCatalogItem {
  id: PrinterCommandId
  risk: TreeDCommandRisk
  label: string
  capability: TreeDCommandCapability
  requiresConfirmation: boolean
}

export interface TreeDCommandRuntimeContext {
  source?: PrinterDataMode
  capabilities: PrinterCapabilitiesSnapshot
  connection: PrinterConnectionState
  transportState: PrinterTransportState
  printJob?: {
    filename?: string
    state: string
    isActive: boolean
    isPaused: boolean
  }
  klippyState?: string
  excludeObjects?: PrinterExcludeObjectSnapshot
  homedAxes?: string
  toolhead?: {
    rawX?: number
    rawY?: number
    rawZ?: number
  }
  eddyStatus?: PrinterEddyStatus
  extruderTemp?: number
  limits?: PrinterLimits
  thermalTargets?: {
    nozzle: number
    bed: number
  }
  modelFanPercent?: number
  mainLightEnabled?: boolean
  filamentSensor?: FilamentSensorSnapshot
}

const MIN_FILAMENT_EXTRUDE_TEMP_C = 170
const MAX_UI_MOVE_DISTANCE_MM = 100
export const Z_OFFSET_BABYSTEP_STEP_OPTIONS = [0.01, 0.025, 0.05] as const
const MIN_Z_OFFSET_BABYSTEP_DELTA_MM = Z_OFFSET_BABYSTEP_STEP_OPTIONS[0]
const MAX_Z_OFFSET_BABYSTEP_DELTA_MM = Z_OFFSET_BABYSTEP_STEP_OPTIONS[Z_OFFSET_BABYSTEP_STEP_OPTIONS.length - 1]
export const EDDY_TEST_Z_STEP_OPTIONS = [-1, -0.1, -0.05, 0.05, 0.1, 1] as const

const COMMAND_CAPABILITY_LABELS: Record<TreeDCommandCapability, string> = {
  print: 'печать',
  motion: 'перемещение',
  thermal: 'нагрев',
  fan: 'обдув',
  lighting: 'подсветка',
  filament: 'филамент',
  filamentSensorControl: 'управление датчиком филамента',
  filamentEncoderSensitivity: 'чувствительность энкодера филамента',
  console: 'консоль G-code',
  eddy: 'Eddy/Z-контур',
  shaper: 'input shaper',
  motionTest: 'тест движения',
  power: 'питание хоста',
  serviceCommands: 'сервисные команды',
}

const CONNECTION_BLOCK_LABELS: Record<Exclude<PrinterConnectionState, 'online' | 'degraded'>, string> = {
  connecting: 'идет подключение к принтеру',
  reconnecting: 'идет восстановление связи с принтером',
  offline: 'нет связи с принтером',
  shutdown: 'Klipper остановлен',
}

export const TREE_D_COMMAND_CATALOG: Record<PrinterCommandId, TreeDCommandCatalogItem> = {
  start: {
    id: 'start',
    risk: 'caution',
    label: 'Старт печати',
    capability: 'print',
    requiresConfirmation: true,
  },
  pause: {
    id: 'pause',
    risk: 'safe',
    label: 'Пауза',
    capability: 'print',
    requiresConfirmation: false,
  },
  resume: {
    id: 'resume',
    risk: 'safe',
    label: 'Продолжить',
    capability: 'print',
    requiresConfirmation: false,
  },
  cancel: {
    id: 'cancel',
    risk: 'danger',
    label: 'Отмена печати',
    capability: 'print',
    requiresConfirmation: true,
  },
  emergencyStop: {
    id: 'emergencyStop',
    risk: 'danger',
    label: 'Аварийная остановка',
    capability: 'motion',
    requiresConfirmation: false,
  },
  home: {
    id: 'home',
    risk: 'caution',
    label: 'Home all',
    capability: 'motion',
    requiresConfirmation: false,
  },
  homeAll: {
    id: 'homeAll',
    risk: 'caution',
    label: 'Home all',
    capability: 'motion',
    requiresConfirmation: false,
  },
  homeX: {
    id: 'homeX',
    risk: 'caution',
    label: 'Home X',
    capability: 'motion',
    requiresConfirmation: false,
  },
  homeY: {
    id: 'homeY',
    risk: 'caution',
    label: 'Home Y',
    capability: 'motion',
    requiresConfirmation: false,
  },
  homeXY: {
    id: 'homeXY',
    risk: 'caution',
    label: 'Home XY',
    capability: 'motion',
    requiresConfirmation: false,
  },
  homeZ: {
    id: 'homeZ',
    risk: 'caution',
    label: 'Home Z через Eddy',
    capability: 'eddy',
    requiresConfirmation: false,
  },
  moveAxis: {
    id: 'moveAxis',
    risk: 'caution',
    label: 'Перемещение оси',
    capability: 'motion',
    requiresConfirmation: false,
  },
  setNozzleTarget: {
    id: 'setNozzleTarget',
    risk: 'caution',
    label: 'Нагрев сопла',
    capability: 'thermal',
    requiresConfirmation: false,
  },
  setBedTarget: {
    id: 'setBedTarget',
    risk: 'caution',
    label: 'Нагрев стола',
    capability: 'thermal',
    requiresConfirmation: false,
  },
  setHeatingTargets: {
    id: 'setHeatingTargets',
    risk: 'caution',
    label: 'Нагрев сопла и стола',
    capability: 'thermal',
    requiresConfirmation: false,
  },
  turnOffHeaters: {
    id: 'turnOffHeaters',
    risk: 'safe',
    label: 'Выключить нагрев',
    capability: 'thermal',
    requiresConfirmation: false,
  },
  setFanPercent: {
    id: 'setFanPercent',
    risk: 'safe',
    label: 'Обдув модели',
    capability: 'fan',
    requiresConfirmation: false,
  },
  setMainLightEnabled: {
    id: 'setMainLightEnabled',
    risk: 'safe',
    label: 'Основной свет',
    capability: 'lighting',
    requiresConfirmation: false,
  },
  setPrintSpeedFactorPercent: {
    id: 'setPrintSpeedFactorPercent',
    risk: 'safe',
    label: 'Скорость печати',
    capability: 'print',
    requiresConfirmation: false,
  },
  setPrintFlowFactorPercent: {
    id: 'setPrintFlowFactorPercent',
    risk: 'safe',
    label: 'Поток экструдера',
    capability: 'print',
    requiresConfirmation: false,
  },
  setPrintAccel: {
    id: 'setPrintAccel',
    risk: 'caution',
    label: 'Ускорение печати',
    capability: 'print',
    requiresConfirmation: false,
  },
  setPressureAdvance: {
    id: 'setPressureAdvance',
    risk: 'caution',
    label: 'Pressure advance',
    capability: 'print',
    requiresConfirmation: false,
  },
  setRetractionLength: {
    id: 'setRetractionLength',
    risk: 'caution',
    label: 'Откат',
    capability: 'print',
    requiresConfirmation: false,
  },
  adjustZOffset: {
    id: 'adjustZOffset',
    risk: 'caution',
    label: 'Z-offset',
    capability: 'print',
    requiresConfirmation: false,
  },
  excludeObject: {
    id: 'excludeObject',
    risk: 'caution',
    label: 'Исключение объекта',
    capability: 'print',
    requiresConfirmation: true,
  },
  loadFilament: {
    id: 'loadFilament',
    risk: 'caution',
    label: 'Загрузка филамента',
    capability: 'filament',
    requiresConfirmation: false,
  },
  unloadFilament: {
    id: 'unloadFilament',
    risk: 'caution',
    label: 'Выгрузка филамента',
    capability: 'filament',
    requiresConfirmation: false,
  },
  setFilamentSensorMode: {
    id: 'setFilamentSensorMode',
    risk: 'caution',
    label: 'Режим датчика филамента',
    capability: 'filamentSensorControl',
    requiresConfirmation: false,
  },
  setFilamentEncoderSensitivity: {
    id: 'setFilamentEncoderSensitivity',
    risk: 'caution',
    label: 'Чувствительность энкодера филамента',
    capability: 'filamentEncoderSensitivity',
    requiresConfirmation: true,
  },
  zParkZeroEddy: {
    id: 'zParkZeroEddy',
    risk: 'caution',
    label: 'Парковка Z через Eddy',
    capability: 'eddy',
    requiresConfirmation: false,
  },
  eddyDriveCurrentCalibrate: {
    id: 'eddyDriveCurrentCalibrate',
    risk: 'caution',
    label: 'Калибровка тока Eddy',
    capability: 'eddy',
    requiresConfirmation: true,
  },
  eddyPrimaryHeightStart: {
    id: 'eddyPrimaryHeightStart',
    risk: 'caution',
    label: 'Первичная высота Eddy',
    capability: 'eddy',
    requiresConfirmation: false,
  },
  eddyPrimaryAcceptSave: {
    id: 'eddyPrimaryAcceptSave',
    risk: 'caution',
    label: 'Сохранить первичную калибровку Eddy',
    capability: 'eddy',
    requiresConfirmation: true,
  },
  eddyTemperatureStart: {
    id: 'eddyTemperatureStart',
    risk: 'caution',
    label: 'Температурная калибровка Eddy',
    capability: 'eddy',
    requiresConfirmation: true,
  },
  eddyTemperatureAcceptSave: {
    id: 'eddyTemperatureAcceptSave',
    risk: 'caution',
    label: 'Сохранить температурную калибровку Eddy',
    capability: 'eddy',
    requiresConfirmation: true,
  },
  eddyCheckZ0: {
    id: 'eddyCheckZ0',
    risk: 'caution',
    label: 'Поиск Z0 через Eddy',
    capability: 'eddy',
    requiresConfirmation: false,
  },
  eddyScrewsTiltStart: {
    id: 'eddyScrewsTiltStart',
    risk: 'caution',
    label: 'Выравнивание винтов Eddy',
    capability: 'eddy',
    requiresConfirmation: false,
  },
  eddyScrewsTiltDone: {
    id: 'eddyScrewsTiltDone',
    risk: 'caution',
    label: 'Винты стола выровнены',
    capability: 'eddy',
    requiresConfirmation: false,
  },
  eddyBedMeshCalibrate: {
    id: 'eddyBedMeshCalibrate',
    risk: 'caution',
    label: 'Карта стола Eddy',
    capability: 'eddy',
    requiresConfirmation: true,
  },
  eddyAutosaveEnable: {
    id: 'eddyAutosaveEnable',
    risk: 'caution',
    label: 'Включить автосохранение Z-offset',
    capability: 'eddy',
    requiresConfirmation: true,
  },
  eddyAutosaveDisable: {
    id: 'eddyAutosaveDisable',
    risk: 'caution',
    label: 'Отключить автосохранение Z-offset',
    capability: 'eddy',
    requiresConfirmation: false,
  },
  eddyAutosaveStatus: {
    id: 'eddyAutosaveStatus',
    risk: 'caution',
    label: 'Статус автосохранения Z-offset',
    capability: 'eddy',
    requiresConfirmation: false,
  },
  eddyTestZ: {
    id: 'eddyTestZ',
    risk: 'caution',
    label: 'TESTZ Eddy',
    capability: 'eddy',
    requiresConfirmation: false,
  },
  shaperCalibrateLight: {
    id: 'shaperCalibrateLight',
    risk: 'caution',
    label: 'Input shaper light',
    capability: 'shaper',
    requiresConfirmation: true,
  },
  shaperCalibrateFull: {
    id: 'shaperCalibrateFull',
    risk: 'caution',
    label: 'Input shaper full',
    capability: 'shaper',
    requiresConfirmation: true,
  },
  xyMotionTest: {
    id: 'xyMotionTest',
    risk: 'caution',
    label: 'XY motion test',
    capability: 'motionTest',
    requiresConfirmation: true,
  },
  disableMotors: {
    id: 'disableMotors',
    risk: 'caution',
    label: 'Отключить моторы',
    capability: 'motion',
    requiresConfirmation: true,
  },
  consoleGcode: {
    id: 'consoleGcode',
    risk: 'danger',
    label: 'Console G-code',
    capability: 'console',
    requiresConfirmation: true,
  },
  rebootHost: {
    id: 'rebootHost',
    risk: 'danger',
    label: 'Перезагрузка хоста',
    capability: 'power',
    requiresConfirmation: true,
  },
  restartKlipper: {
    id: 'restartKlipper',
    risk: 'danger',
    label: 'Перезапуск Klipper',
    capability: 'serviceCommands',
    requiresConfirmation: true,
  },
  firmwareRestart: {
    id: 'firmwareRestart',
    risk: 'danger',
    label: 'Перезапуск прошивки MCU',
    capability: 'serviceCommands',
    requiresConfirmation: true,
  },
  restartUi: {
    id: 'restartUi',
    risk: 'danger',
    label: 'Перезапуск интерфейса',
    capability: 'serviceCommands',
    requiresConfirmation: true,
  },
  restartMoonraker: {
    id: 'restartMoonraker',
    risk: 'danger',
    label: 'Перезапуск Moonraker',
    capability: 'serviceCommands',
    requiresConfirmation: true,
  },
  shutdownHost: {
    id: 'shutdownHost',
    risk: 'danger',
    label: 'Выключение хоста',
    capability: 'power',
    requiresConfirmation: true,
  },
}

export function getTreeDCommandCatalogItem(command: PrinterCommandId): TreeDCommandCatalogItem {
  return TREE_D_COMMAND_CATALOG[command]
}

const TREE_D_COMMAND_PENDING_DOMAINS: Record<PrinterCommandId, PrinterCommandPendingDomain> = {
  start: 'print',
  pause: 'print',
  resume: 'print',
  cancel: 'critical',
  emergencyStop: 'critical',
  home: 'motion',
  homeAll: 'motion',
  homeX: 'motion',
  homeY: 'motion',
  homeXY: 'motion',
  homeZ: 'motion',
  moveAxis: 'motion',
  setNozzleTarget: 'thermal',
  setBedTarget: 'thermal',
  setHeatingTargets: 'thermal',
  turnOffHeaters: 'thermal',
  setFanPercent: 'fan',
  setMainLightEnabled: 'light',
  setPrintSpeedFactorPercent: 'print',
  setPrintFlowFactorPercent: 'print',
  setPrintAccel: 'print',
  setPressureAdvance: 'print',
  setRetractionLength: 'print',
  adjustZOffset: 'print',
  excludeObject: 'print',
  loadFilament: 'filament',
  unloadFilament: 'filament',
  setFilamentSensorMode: 'filament',
  setFilamentEncoderSensitivity: 'filament',
  zParkZeroEddy: 'motion',
  eddyDriveCurrentCalibrate: 'motion',
  eddyPrimaryHeightStart: 'motion',
  eddyPrimaryAcceptSave: 'motion',
  eddyTemperatureStart: 'motion',
  eddyTemperatureAcceptSave: 'motion',
  eddyCheckZ0: 'motion',
  eddyScrewsTiltStart: 'motion',
  eddyScrewsTiltDone: 'motion',
  eddyBedMeshCalibrate: 'motion',
  eddyAutosaveEnable: 'motion',
  eddyAutosaveDisable: 'motion',
  eddyAutosaveStatus: 'motion',
  eddyTestZ: 'motion',
  shaperCalibrateLight: 'motion',
  shaperCalibrateFull: 'motion',
  xyMotionTest: 'motion',
  disableMotors: 'motion',
  consoleGcode: 'system',
  rebootHost: 'system',
  restartKlipper: 'system',
  firmwareRestart: 'system',
  restartUi: 'system',
  restartMoonraker: 'system',
  shutdownHost: 'system',
}

export function getPrinterCommandPendingDomain(command: PrinterCommandId): PrinterCommandPendingDomain {
  return TREE_D_COMMAND_PENDING_DOMAINS[command]
}

export function getPrinterPendingCommand(
  pendingCommands: PrinterPendingCommands,
  domain: PrinterCommandPendingDomain,
): PrinterCommandId | null {
  return pendingCommands[domain] ?? null
}

export function getFirstPrinterPendingCommand(
  pendingCommands: PrinterPendingCommands,
): PrinterCommandId | null {
  for (const domain of PRINTER_PENDING_DOMAIN_ORDER) {
    const command = getPrinterPendingCommand(pendingCommands, domain)
    if (command !== null) {
      return command
    }
  }

  return null
}

export function isDangerousTreeDCommand(command: PrinterCommandId): boolean {
  return TREE_D_COMMAND_CATALOG[command].risk === 'danger'
}

const ACTIVE_PRINT_STATES = new Set(['printing', 'paused'])
const PAUSED_PRINT_STATES = new Set(['paused'])
const DIRECT_MOONRAKER_SYSTEM_COMMANDS = new Set<PrinterCommandId>([
  'rebootHost',
  'shutdownHost',
  'restartKlipper',
  'firmwareRestart',
  'restartUi',
  'restartMoonraker',
])
const FAILSAFE_COMMANDS = new Set<PrinterCommandId>([
  'emergencyStop',
  'turnOffHeaters',
])
const RUNTIME_TUNE_COMMANDS = new Set<PrinterCommandId>([
  'setPrintSpeedFactorPercent',
  'setPrintFlowFactorPercent',
  'setPrintAccel',
  'setPressureAdvance',
  'setRetractionLength',
  'adjustZOffset',
])
const FILAMENT_COMMANDS = new Set<PrinterCommandId>([
  'loadFilament',
  'unloadFilament',
])
const FILAMENT_SENSOR_SETTING_COMMANDS = new Set<PrinterCommandId>([
  'setFilamentSensorMode',
  'setFilamentEncoderSensitivity',
])
const MOTION_COMMANDS_BLOCKED_DURING_PRINT = new Set<PrinterCommandId>([
  'home',
  'homeAll',
  'homeX',
  'homeY',
  'homeXY',
  'homeZ',
  'moveAxis',
  'disableMotors',
  'zParkZeroEddy',
  'shaperCalibrateLight',
  'shaperCalibrateFull',
  'xyMotionTest',
])
const EDDY_CALIBRATION_COMMANDS_BLOCKED_DURING_PRINT = new Set<PrinterCommandId>([
  'eddyDriveCurrentCalibrate',
  'eddyPrimaryHeightStart',
  'eddyPrimaryAcceptSave',
  'eddyTemperatureStart',
  'eddyTemperatureAcceptSave',
  'eddyCheckZ0',
  'eddyScrewsTiltStart',
  'eddyScrewsTiltDone',
  'eddyBedMeshCalibrate',
  'eddyTestZ',
])

function normalizeState(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function hasActivePrint(context: TreeDCommandRuntimeContext): boolean {
  const state = normalizeState(context.printJob?.state)

  return Boolean(
    context.printJob?.isActive ||
    context.printJob?.isPaused ||
    ACTIVE_PRINT_STATES.has(state),
  )
}

function hasPausedPrint(context: TreeDCommandRuntimeContext): boolean {
  const state = normalizeState(context.printJob?.state)

  return Boolean(context.printJob?.isPaused || PAUSED_PRINT_STATES.has(state))
}

function getExcludeObjectBlockReason(
  context: TreeDCommandRuntimeContext,
  args: ExecuteCommandArgs | undefined,
): string | null {
  const item = getTreeDCommandCatalogItem('excludeObject')

  if (args?.command !== 'excludeObject') {
    return `${item.label}: объект не указан.`
  }

  if (context.transportState !== 'online') {
    return `${item.label}: Moonraker недоступен.`
  }

  if (!hasActivePrint(context)) {
    return `${item.label}: нет активной печати.`
  }

  if (normalizeState(context.klippyState) !== 'ready') {
    return `${item.label}: Klipper не готов.`
  }

  const snapshot = context.excludeObjects
  if (snapshot === undefined || !snapshot.supported || snapshot.state === 'unavailable') {
    return `${item.label}: exclude_object не поддерживается текущей конфигурацией.`
  }

  if (snapshot.state === 'waiting') {
    return `${item.label}: список объектов еще загружается.`
  }

  const object = snapshot.objects.find((candidate) => candidate.name === args.objectName)
  if (object === undefined) {
    return `${item.label}: объект не найден в текущей печати.`
  }

  if (object.isExcluded || snapshot.excludedObjectNames.includes(args.objectName)) {
    return `${item.label}: объект уже исключён.`
  }

  const remainingObjects = snapshot.objects.filter((candidate) => (
    !candidate.isExcluded && !snapshot.excludedObjectNames.includes(candidate.name)
  ))
  if (remainingObjects.length <= 1) {
    return `${item.label}: это последняя оставшаяся деталь.`
  }

  return null
}

function isAxisHomed(homedAxes: string | undefined, axis: AxisId): boolean {
  if (homedAxes === undefined) {
    return true
  }

  return homedAxes.toLowerCase().includes(axis.toLowerCase())
}

function getCommandSpecificBlockReason(
  command: PrinterCommandId,
  context: TreeDCommandRuntimeContext,
  args?: ExecuteCommandArgs,
): string | null {
  const item = getTreeDCommandCatalogItem(command)
  const argumentError = args === undefined ? null : getTreeDCommandArgumentError(args, context.limits)
  if (argumentError !== null) {
    return `${item.label}: ${argumentError}`
  }
  const activePrint = hasActivePrint(context)
  const pausedPrint = hasPausedPrint(context)

  if (command === 'excludeObject' || args?.command === 'excludeObject') {
    return getExcludeObjectBlockReason(context, args)
  }

  if (command === 'start' && activePrint) {
    return `${item.label}: уже есть активная печать.`
  }

  if (command === 'pause') {
    if (!activePrint) {
      return `${item.label}: нет активной печати.`
    }

    if (pausedPrint) {
      return `${item.label}: печать уже на паузе.`
    }
  }

  if (command === 'resume' && !pausedPrint) {
    return `${item.label}: нет печати на паузе.`
  }

  if (command === 'cancel' && !activePrint) {
    return `${item.label}: нет активной печати.`
  }

  if (RUNTIME_TUNE_COMMANDS.has(command)) {
    if (!activePrint) {
      return `${item.label}: нет активной печати.`
    }

    if (command === 'adjustZOffset' && !context.homedAxes?.toLowerCase().includes('z')) {
      return `${item.label}: сначала выполните Home Z.`
    }
  }

  if (activePrint && MOTION_COMMANDS_BLOCKED_DURING_PRINT.has(command)) {
    return `${item.label}: движение недоступно во время печати.`
  }

  if (activePrint && EDDY_CALIBRATION_COMMANDS_BLOCKED_DURING_PRINT.has(command)) {
    return `${item.label}: калибровка Eddy недоступна во время печати.`
  }

  if (activePrint && !pausedPrint && FILAMENT_COMMANDS.has(command)) {
    return `${item.label}: перемещение филамента недоступно во время печати.`
  }

  if (activePrint && FILAMENT_SENSOR_SETTING_COMMANDS.has(command)) {
    return `${item.label}: настройка недоступна во время печати.`
  }

  if (command === 'setFilamentSensorMode' || args?.command === 'setFilamentSensorMode') {
    if (!context.filamentSensor?.supported) {
      return `${item.label}: датчик наличия недоступен.`
    }
    if (args?.command === 'setFilamentSensorMode' && args.mode === 'motion' && !context.filamentSensor.motionSupported) {
      return `${item.label}: канал движения недоступен.`
    }
  }

  if (command === 'setFilamentEncoderSensitivity' || args?.command === 'setFilamentEncoderSensitivity') {
    if (!context.filamentSensor?.motionSupported) {
      return `${item.label}: канал движения недоступен.`
    }
  }

  if (command === 'homeZ') {
    if (context.eddyStatus === 'uncalibrated') {
      return `${item.label}: Eddy не калиброван.`
    }

    if (context.eddyStatus === 'requires_xy_home') {
      return `${item.label}: сначала выполните Home XY.`
    }

    if (!isAxisHomed(context.homedAxes, 'X') || !isAxisHomed(context.homedAxes, 'Y')) {
      return `${item.label}: сначала выполните Home XY.`
    }
  }

  if (command === 'moveAxis' || args?.command === 'moveAxis') {
    if (args?.command !== 'moveAxis') {
      return `${item.label}: не указана ось перемещения.`
    }

    if (!isAxisHomed(context.homedAxes, args.axis)) {
      return `${item.label}: сначала выполните Home ${args.axis}.`
    }

    if (context.toolhead === undefined) {
      return `${item.label}: координата ${args.axis} неизвестна.`
    }

    const current = args.axis === 'X'
      ? context.toolhead.rawX
      : args.axis === 'Y'
        ? context.toolhead.rawY
        : context.toolhead.rawZ
    if (typeof current !== 'number' || !Number.isFinite(current)) {
      return `${item.label}: координата ${args.axis} неизвестна.`
    }

    const limits = context.limits ?? TREED_V2_COREXY_V1_LIMITS
    const target = current + args.distanceMm
    const axisLimit = limits.axis[args.axis]
    if (!Number.isFinite(target) || target < axisLimit.min || target > axisLimit.max) {
      return `${item.label}: целевая координата вне диапазона ${axisLimit.min}…${axisLimit.max} мм.`
    }
  }

  if (
    (command === 'loadFilament' || command === 'unloadFilament') &&
    (
      context.extruderTemp === undefined ||
      !Number.isFinite(context.extruderTemp) ||
      context.extruderTemp < MIN_FILAMENT_EXTRUDE_TEMP_C
    )
  ) {
    return `${item.label}: сопло должно быть не ниже ${MIN_FILAMENT_EXTRUDE_TEMP_C}°C.`
  }

  return null
}

export function getTreeDCommandArgumentError(
  args: ExecuteCommandArgs,
  limits: PrinterLimits = TREED_V2_COREXY_V1_LIMITS,
): string | null {
  switch (args.command) {
    case 'moveAxis': {
      if (!Number.isFinite(args.distanceMm) || args.distanceMm === 0 || Math.abs(args.distanceMm) > MAX_UI_MOVE_DISTANCE_MM) {
        return `DISTANCE должен быть в диапазоне -${MAX_UI_MOVE_DISTANCE_MM}…${MAX_UI_MOVE_DISTANCE_MM} мм и не равен 0.`
      }

      const feedRate = args.feedRateMmPerMin ?? (args.speedMmS === undefined ? undefined : args.speedMmS * 60)
      const maxFeedRate = args.axis === 'Z' ? 1200 : 6000
      if (feedRate !== undefined && (!Number.isFinite(feedRate) || feedRate < 60 || feedRate > maxFeedRate)) {
        return `FEEDRATE должен быть в диапазоне 60…${maxFeedRate} мм/мин.`
      }
      return null
    }
    case 'loadFilament':
    case 'unloadFilament':
      if (args.lengthMm !== undefined && (!Number.isFinite(args.lengthMm) || args.lengthMm <= 0)) {
        return 'LENGTH должна быть конечным положительным числом.'
      }
      if (args.speedMmS !== undefined && (!Number.isFinite(args.speedMmS) || args.speedMmS <= 0)) {
        return 'SPEED должна быть конечным положительным числом.'
      }
      return null
    case 'setFilamentSensorMode':
      return args.mode === 'presence' || args.mode === 'motion'
        ? null
        : 'MODE должен быть presence или motion.'
    case 'setFilamentEncoderSensitivity':
      return args.sensitivity === 'low' || args.sensitivity === 'medium' || args.sensitivity === 'high'
        ? null
        : 'SENSITIVITY должна быть low, medium или high.'
    case 'setNozzleTarget':
      return getRangeError(args.targetCelsius, 0, limits.nozzleMaxC, 'Температура сопла')
    case 'setBedTarget':
      return getRangeError(args.targetCelsius, 0, limits.bedMaxC, 'Температура стола')
    case 'setHeatingTargets':
      return getRangeError(args.nozzleCelsius, 0, limits.nozzleMaxC, 'Температура сопла')
        ?? getRangeError(args.bedCelsius, 0, limits.bedMaxC, 'Температура стола')
    case 'setFanPercent':
      return getRangeError(args.percent, 0, 100, 'Скорость вентилятора')
    case 'adjustZOffset': {
      const deltaMagnitude = Math.abs(args.deltaMm)
      if (
        !Number.isFinite(args.deltaMm) ||
        deltaMagnitude < MIN_Z_OFFSET_BABYSTEP_DELTA_MM ||
        deltaMagnitude > MAX_Z_OFFSET_BABYSTEP_DELTA_MM
      ) {
        return `Z-offset delta должен быть конечным числом в диапазоне -${MAX_Z_OFFSET_BABYSTEP_DELTA_MM}…-${MIN_Z_OFFSET_BABYSTEP_DELTA_MM} или ${MIN_Z_OFFSET_BABYSTEP_DELTA_MM}…${MAX_Z_OFFSET_BABYSTEP_DELTA_MM}.`
      }
      return null
    }
    case 'excludeObject':
      if (typeof args.objectName !== 'string' || args.objectName.length === 0) {
        return 'NAME должен быть непустой строкой.'
      }
      if (args.objectName.includes('\n') || args.objectName.includes('\r')) {
        return 'NAME не должен содержать переносы строк.'
      }
      return null
    case 'eddyTestZ':
      if (!EDDY_TEST_Z_STEP_OPTIONS.some((step) => Math.abs(step - args.deltaMm) < 0.0001)) {
        return `TESTZ delta должен быть одним из значений: ${EDDY_TEST_Z_STEP_OPTIONS.join(', ')}.`
      }
      return null
    default:
      return null
  }
}

function getRangeError(value: number, min: number, max: number, label: string): string | null {
  if (!Number.isFinite(value) || value < min || value > max) {
    return `${label} должна быть конечным числом в диапазоне ${min}…${max}.`
  }

  return null
}

export function getTreeDCommandBlockReason(
  command: PrinterCommandId,
  context: TreeDCommandRuntimeContext,
  args?: ExecuteCommandArgs,
): string | null {
  const item = getTreeDCommandCatalogItem(command)
  const capabilityEnabled = context.capabilities[item.capability]

  if (FAILSAFE_COMMANDS.has(command)) {
    if (context.transportState !== 'online') {
      return `${item.label}: Moonraker недоступен.`
    }

    return getCommandSpecificBlockReason(command, context, args)
  }

  if (DIRECT_MOONRAKER_SYSTEM_COMMANDS.has(command)) {
    if (context.transportState !== 'online') {
      return `${item.label}: Moonraker недоступен.`
    }

    return getCommandSpecificBlockReason(command, context, args)
  }

  if (capabilityEnabled !== true) {
    return `${item.label}: capability «${COMMAND_CAPABILITY_LABELS[item.capability]}» не подтвержден.`
  }

  if (context.connection === 'online') {
    return getCommandSpecificBlockReason(command, context, args)
  }

  if (context.connection === 'degraded') {
    if (item.risk === 'safe') {
      return getCommandSpecificBlockReason(command, context, args)
    }

    return `${item.label}: команда уровня ${item.risk} недоступна в ограниченном режиме связи.`
  }

  return `${item.label}: команда недоступна, ${CONNECTION_BLOCK_LABELS[context.connection]}.`
}
