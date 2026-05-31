import type { PrinterCommandId } from './types'
import type { PrinterCapabilitiesSnapshot, PrinterConnectionState } from '../transport/types'

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
    requiresConfirmation: true,
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

export function getTreeDCommandBlockReason(
  command: PrinterCommandId,
  context: TreeDCommandRuntimeContext,
): string | null {
  const item = getTreeDCommandCatalogItem(command)
  const capabilityEnabled = context.capabilities[item.capability]

  if (capabilityEnabled !== true) {
    return `${item.label}: capability «${COMMAND_CAPABILITY_LABELS[item.capability]}» не подтвержден.`
  }

  if (context.connection === 'online') {
    return null
  }

  if (context.connection === 'degraded') {
    if (item.risk === 'safe') {
      return null
    }

    return `${item.label}: команда уровня ${item.risk} недоступна в ограниченном режиме связи.`
  }

  return `${item.label}: команда недоступна, ${CONNECTION_BLOCK_LABELS[context.connection]}.`
}
