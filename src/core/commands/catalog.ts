import type { AxisId, ExecuteCommandArgs, PrinterCommandId } from './types'
import type { PrinterCapabilitiesSnapshot, PrinterConnectionState, PrinterEddyStatus } from '../transport/types'

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
  capabilities: PrinterCapabilitiesSnapshot
  connection: PrinterConnectionState
  printJob?: {
    state: string
    isActive: boolean
    isPaused: boolean
  }
  homedAxes?: string
  eddyStatus?: PrinterEddyStatus
}

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
  consoleGcode: {
    id: 'consoleGcode',
    risk: 'danger',
    label: 'Console G-code',
    capability: 'console',
    requiresConfirmation: false,
  },
  rebootHost: {
    id: 'rebootHost',
    risk: 'danger',
    label: 'Перезагрузка host',
    capability: 'power',
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
const MOTION_COMMANDS_BLOCKED_DURING_PRINT = new Set<PrinterCommandId>([
  'home',
  'homeAll',
  'homeXY',
  'homeZ',
  'moveAxis',
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

function getCommandSpecificBlockReason(
  command: PrinterCommandId,
  context: TreeDCommandRuntimeContext,
  args?: ExecuteCommandArgs,
): string | null {
  const item = getTreeDCommandCatalogItem(command)
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

  if (args?.command === 'moveAxis' && !isAxisHomed(context.homedAxes, args.axis)) {
    return `${item.label}: ось ${args.axis} не захоумлена.`
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
