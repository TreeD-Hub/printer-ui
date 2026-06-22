export type PrinterDataMode = 'mock' | 'live'
export type PrinterConnectionState =
  | 'connecting'
  | 'online'
  | 'degraded'
  | 'reconnecting'
  | 'offline'
  | 'shutdown'
export type PrinterConnection = PrinterConnectionState

export type PrinterCommandId =
  | 'start'
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'emergencyStop'
  | 'home'
  | 'homeAll'
  | 'homeXY'
  | 'homeZ'
  | 'moveAxis'
  | 'setNozzleTarget'
  | 'setBedTarget'
  | 'setHeatingTargets'
  | 'turnOffHeaters'
  | 'setFanPercent'
  | 'setPrintSpeedFactorPercent'
  | 'setPrintFlowFactorPercent'
  | 'setPrintAccel'
  | 'setPressureAdvance'
  | 'setRetractionLength'
  | 'adjustZOffset'
  | 'loadFilament'
  | 'unloadFilament'
  | 'zParkZeroEddy'
  | 'shaperCalibrateLight'
  | 'shaperCalibrateFull'
  | 'xyMotionTest'
  | 'disableMotors'
  | 'consoleGcode'
  | 'rebootHost'
  | 'restartKlipper'
  | 'firmwareRestart'
  | 'restartMoonraker'
  | 'shutdownHost'

export type AxisId = 'X' | 'Y' | 'Z'

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
        | 'homeXY'
        | 'homeZ'
        | 'turnOffHeaters'
        | 'disableMotors'
        | 'zParkZeroEddy'
        | 'shaperCalibrateLight'
        | 'shaperCalibrateFull'
        | 'xyMotionTest'
        | 'rebootHost'
        | 'restartKlipper'
        | 'firmwareRestart'
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
      command: 'loadFilament' | 'unloadFilament'
      lengthMm?: number
      speedMmS?: number
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

export type PrinterEddyStatus = 'unknown' | 'ready' | 'uncalibrated' | 'requires_xy_home'

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
  pendingCommand: PrinterCommandId | null
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
  const baseAvailability = resolveRegularAction('print', snapshot, context)

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

function resolveRegularAction(
  group: CapabilityGroup,
  snapshot: PrinterSnapshot,
  context: PrinterCapabilityContext,
): ActionAvailability {
  const connectionBlock = CAPABILITY_CONNECTION_BLOCKS[snapshot.connection]
  if (connectionBlock !== undefined) {
    return connectionBlock
  }

  if (context.pendingCommand !== null) {
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
  | 'filament'
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
  printJob?: {
    filename?: string
    state: string
    isActive: boolean
    isPaused: boolean
  }
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
}

const MIN_FILAMENT_EXTRUDE_TEMP_C = 170
const MAX_UI_MOVE_DISTANCE_MM = 50

const COMMAND_CAPABILITY_LABELS: Record<TreeDCommandCapability, string> = {
  print: 'печать',
  motion: 'перемещение',
  thermal: 'нагрев',
  fan: 'обдув',
  filament: 'филамент',
  console: 'консоль G-code',
  eddy: 'Eddy/Z-контур',
  shaper: 'input shaper',
  motionTest: 'тест движения',
  power: 'питание host',
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
  zParkZeroEddy: {
    id: 'zParkZeroEddy',
    risk: 'caution',
    label: 'Парковка Z через Eddy',
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
    requiresConfirmation: false,
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
    label: 'Перезагрузка host',
    capability: 'power',
    requiresConfirmation: true,
  },
  restartKlipper: {
    id: 'restartKlipper',
    risk: 'danger',
    label: 'Restart Klipper',
    capability: 'serviceCommands',
    requiresConfirmation: true,
  },
  firmwareRestart: {
    id: 'firmwareRestart',
    risk: 'danger',
    label: 'Firmware restart',
    capability: 'serviceCommands',
    requiresConfirmation: true,
  },
  restartMoonraker: {
    id: 'restartMoonraker',
    risk: 'danger',
    label: 'Restart Moonraker',
    capability: 'serviceCommands',
    requiresConfirmation: true,
  },
  shutdownHost: {
    id: 'shutdownHost',
    risk: 'danger',
    label: 'Выключение host',
    capability: 'power',
    requiresConfirmation: true,
  },
}

export function getTreeDCommandCatalogItem(command: PrinterCommandId): TreeDCommandCatalogItem {
  return TREE_D_COMMAND_CATALOG[command]
}

export function isDangerousTreeDCommand(command: PrinterCommandId): boolean {
  return TREE_D_COMMAND_CATALOG[command].risk === 'danger'
}

const ACTIVE_PRINT_STATES = new Set(['printing', 'paused'])
const PAUSED_PRINT_STATES = new Set(['paused'])
const RUNTIME_TUNE_COMMANDS = new Set<PrinterCommandId>([
  'setPrintSpeedFactorPercent',
  'setPrintFlowFactorPercent',
  'setPrintAccel',
  'setPressureAdvance',
  'setRetractionLength',
  'adjustZOffset',
])
const MOTION_COMMANDS_BLOCKED_DURING_PRINT = new Set<PrinterCommandId>([
  'home',
  'homeAll',
  'homeXY',
  'homeZ',
  'moveAxis',
  'disableMotors',
  'zParkZeroEddy',
  'shaperCalibrateLight',
  'shaperCalibrateFull',
  'xyMotionTest',
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

function isAxisHomed(homedAxes: string | undefined, axis: AxisId): boolean {
  if (homedAxes === undefined) {
    return true
  }

  return homedAxes.toLowerCase().includes(axis.toLowerCase())
}

function areXyzAxesHomed(homedAxes: string | undefined): boolean {
  if (homedAxes === undefined) {
    return false
  }

  return isAxisHomed(homedAxes, 'X') && isAxisHomed(homedAxes, 'Y') && isAxisHomed(homedAxes, 'Z')
}

function areXyzCoordinatesKnown(toolhead: TreeDCommandRuntimeContext['toolhead']): boolean {
  return (
    toolhead !== undefined &&
    Number.isFinite(toolhead.rawX) &&
    Number.isFinite(toolhead.rawY) &&
    Number.isFinite(toolhead.rawZ)
  )
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
    if (!areXyzAxesHomed(context.homedAxes)) {
      return `${item.label}: сначала выполните Home XYZ.`
    }

    if (!areXyzCoordinatesKnown(context.toolhead)) {
      return `${item.label}: координаты XYZ неизвестны.`
    }

    if (args?.command === 'moveAxis' && context.toolhead !== undefined) {
      const limits = context.limits ?? TREED_V2_COREXY_V1_LIMITS
      const current = args.axis === 'X'
        ? context.toolhead.rawX
        : args.axis === 'Y'
          ? context.toolhead.rawY
          : context.toolhead.rawZ
      const target = (current ?? Number.NaN) + args.distanceMm
      const axisLimit = limits.axis[args.axis]
      if (!Number.isFinite(target) || target < axisLimit.min || target > axisLimit.max) {
        return `${item.label}: целевая координата вне диапазона ${axisLimit.min}…${axisLimit.max} мм.`
      }
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
    case 'setNozzleTarget':
      return getRangeError(args.targetCelsius, 0, limits.nozzleMaxC, 'Температура сопла')
    case 'setBedTarget':
      return getRangeError(args.targetCelsius, 0, limits.bedMaxC, 'Температура стола')
    case 'setHeatingTargets':
      return getRangeError(args.nozzleCelsius, 0, limits.nozzleMaxC, 'Температура сопла')
        ?? getRangeError(args.bedCelsius, 0, limits.bedMaxC, 'Температура стола')
    case 'setFanPercent':
      return getRangeError(args.percent, 0, 100, 'Скорость вентилятора')
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
