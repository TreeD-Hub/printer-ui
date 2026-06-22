import { describe, expect, it } from 'vitest'
import {
  getTreeDCommandBlockReason,
  getTreeDCommandCatalogItem,
  isDangerousTreeDCommand,
  TREE_D_COMMAND_CATALOG,
  TREED_V2_COREXY_V1_LIMITS,
  type PrinterCapabilitiesSnapshot,
  type PrinterCommandId,
  type TreeDCommandRuntimeContext,
} from '../src/index'

const ALL_COMMAND_IDS: PrinterCommandId[] = [
  'start',
  'pause',
  'resume',
  'cancel',
  'emergencyStop',
  'home',
  'homeAll',
  'homeXY',
  'homeZ',
  'moveAxis',
  'setNozzleTarget',
  'setBedTarget',
  'setHeatingTargets',
  'turnOffHeaters',
  'setFanPercent',
  'setPrintSpeedFactorPercent',
  'setPrintFlowFactorPercent',
  'setPrintAccel',
  'setPressureAdvance',
  'setRetractionLength',
  'adjustZOffset',
  'loadFilament',
  'unloadFilament',
  'zParkZeroEddy',
  'shaperCalibrateLight',
  'shaperCalibrateFull',
  'xyMotionTest',
  'disableMotors',
  'consoleGcode',
  'rebootHost',
  'restartKlipper',
  'firmwareRestart',
  'restartMoonraker',
  'shutdownHost',
]

const ALL_CAPABILITIES: PrinterCapabilitiesSnapshot = {
  print: true,
  motion: true,
  thermal: true,
  fan: true,
  filament: true,
  console: true,
  eddy: true,
  shaper: true,
  motionTest: true,
  power: true,
  network: false,
  cloud: false,
  updates: false,
  systemPower: true,
  camera: false,
  serviceCommands: true,
}

const IDLE_CONTEXT: TreeDCommandRuntimeContext = {
  capabilities: ALL_CAPABILITIES,
  connection: 'online',
  printJob: {
    state: 'standby',
    isActive: false,
    isPaused: false,
  },
  homedAxes: 'xyz',
  toolhead: {
    rawX: 10,
    rawY: 20,
    rawZ: 5,
  },
  eddyStatus: 'ready',
  extruderTemp: 210,
  limits: TREED_V2_COREXY_V1_LIMITS,
}

const PRINTING_CONTEXT: TreeDCommandRuntimeContext = {
  ...IDLE_CONTEXT,
  printJob: {
    state: 'printing',
    isActive: true,
    isPaused: false,
  },
}

const PAUSED_CONTEXT: TreeDCommandRuntimeContext = {
  ...IDLE_CONTEXT,
  printJob: {
    state: 'paused',
    isActive: true,
    isPaused: true,
  },
}

describe('TREE_D_COMMAND_CATALOG', () => {
  it('defines metadata for every executable printer command', () => {
    expect(Object.keys(TREE_D_COMMAND_CATALOG).sort()).toEqual([...ALL_COMMAND_IDS].sort())

    for (const commandId of ALL_COMMAND_IDS) {
      expect(getTreeDCommandCatalogItem(commandId)).toEqual(
        expect.objectContaining({
          id: commandId,
          capability: expect.any(String),
          label: expect.any(String),
          requiresConfirmation: expect.any(Boolean),
          risk: expect.stringMatching(/^(safe|caution|danger)$/),
        }),
      )
    }
  })

  it('marks destructive host and print commands as dangerous', () => {
    expect(isDangerousTreeDCommand('cancel')).toBe(true)
    expect(isDangerousTreeDCommand('emergencyStop')).toBe(true)
    expect(isDangerousTreeDCommand('consoleGcode')).toBe(true)
    expect(isDangerousTreeDCommand('rebootHost')).toBe(true)
    expect(isDangerousTreeDCommand('restartKlipper')).toBe(true)
    expect(isDangerousTreeDCommand('firmwareRestart')).toBe(true)
    expect(isDangerousTreeDCommand('restartMoonraker')).toBe(true)
    expect(isDangerousTreeDCommand('shutdownHost')).toBe(true)

    expect(isDangerousTreeDCommand('pause')).toBe(false)
    expect(isDangerousTreeDCommand('setFanPercent')).toBe(false)
    expect(isDangerousTreeDCommand('setPrintSpeedFactorPercent')).toBe(false)
    expect(isDangerousTreeDCommand('disableMotors')).toBe(false)
    expect(getTreeDCommandCatalogItem('emergencyStop').requiresConfirmation).toBe(false)
    expect(getTreeDCommandCatalogItem('consoleGcode').requiresConfirmation).toBe(true)
  })

  it('blocks commands when capability is missing or connection is unsafe', () => {
    expect(getTreeDCommandBlockReason('pause', PRINTING_CONTEXT)).toBeNull()
    expect(getTreeDCommandBlockReason('pause', {
      ...PRINTING_CONTEXT,
      capabilities: {
        ...ALL_CAPABILITIES,
        print: false,
      },
    })).toContain('capability')
    expect(getTreeDCommandBlockReason('cancel', {
      ...PRINTING_CONTEXT,
      connection: 'degraded',
    })).toContain('ограниченном режиме')
    expect(getTreeDCommandBlockReason('setFanPercent', {
      ...IDLE_CONTEXT,
      connection: 'degraded',
    })).toBeNull()
    expect(getTreeDCommandBlockReason('pause', {
      ...PRINTING_CONTEXT,
      connection: 'reconnecting',
    })).toContain('восстановление связи')
  })

  it('blocks print and motion commands that do not match runtime state', () => {
    expect(getTreeDCommandBlockReason('pause', IDLE_CONTEXT)).toContain('нет активной печати')
    expect(getTreeDCommandBlockReason('resume', PRINTING_CONTEXT)).toContain('нет печати на паузе')
    expect(getTreeDCommandBlockReason('resume', PAUSED_CONTEXT)).toBeNull()
    expect(getTreeDCommandBlockReason('cancel', IDLE_CONTEXT)).toContain('нет активной печати')
    expect(getTreeDCommandBlockReason('start', PRINTING_CONTEXT)).toContain('активная печать')
    expect(getTreeDCommandBlockReason('homeZ', {
      ...IDLE_CONTEXT,
      eddyStatus: 'requires_xy_home',
    })).toContain('Home XY')
    expect(getTreeDCommandBlockReason('moveAxis', {
      ...IDLE_CONTEXT,
      homedAxes: 'xy',
    }, {
      command: 'moveAxis',
      axis: 'Z',
      distanceMm: 1,
    })).toContain('Home XYZ')
    expect(getTreeDCommandBlockReason('moveAxis', {
      ...IDLE_CONTEXT,
      toolhead: {
        rawX: 10,
        rawY: Number.NaN,
        rawZ: 5,
      },
    }, {
      command: 'moveAxis',
      axis: 'Y',
      distanceMm: 1,
    })).toContain('координаты XYZ')
    expect(getTreeDCommandBlockReason('loadFilament', {
      ...IDLE_CONTEXT,
      extruderTemp: 169,
    })).toContain('170')
    expect(getTreeDCommandBlockReason('moveAxis', PRINTING_CONTEXT, {
      command: 'moveAxis',
      axis: 'X',
      distanceMm: 1,
    })).toContain('во время печати')
    expect(getTreeDCommandBlockReason('disableMotors', PRINTING_CONTEXT)).toContain('во время печати')
  })

  it('validates movement and heating arguments against the active profile', () => {
    expect(getTreeDCommandBlockReason('moveAxis', IDLE_CONTEXT, {
      command: 'moveAxis',
      axis: 'X',
      distanceMm: 51,
    })).toContain('DISTANCE')
    expect(getTreeDCommandBlockReason('moveAxis', IDLE_CONTEXT, {
      command: 'moveAxis',
      axis: 'X',
      distanceMm: -11,
    })).toContain('0…245')
    expect(getTreeDCommandBlockReason('setNozzleTarget', IDLE_CONTEXT, {
      command: 'setNozzleTarget',
      targetCelsius: 281,
    })).toContain('0…280')
    expect(getTreeDCommandBlockReason('setBedTarget', IDLE_CONTEXT, {
      command: 'setBedTarget',
      targetCelsius: 121,
    })).toContain('0…120')
    expect(getTreeDCommandBlockReason('setBedTarget', IDLE_CONTEXT, {
      command: 'setBedTarget',
      targetCelsius: Number.NaN,
    })).toContain('конечным числом')
  })

  it('allows confirmed host power and service commands during active print', () => {
    expect(getTreeDCommandBlockReason('rebootHost', PRINTING_CONTEXT)).toBeNull()
    expect(getTreeDCommandBlockReason('shutdownHost', PRINTING_CONTEXT)).toBeNull()
    expect(getTreeDCommandBlockReason('restartKlipper', PRINTING_CONTEXT)).toBeNull()
    expect(getTreeDCommandBlockReason('firmwareRestart', PRINTING_CONTEXT)).toBeNull()
    expect(getTreeDCommandBlockReason('restartMoonraker', PRINTING_CONTEXT)).toBeNull()

    expect(getTreeDCommandBlockReason('rebootHost', {
      ...PRINTING_CONTEXT,
      capabilities: {
        ...ALL_CAPABILITIES,
        power: false,
      },
    })).toContain('capability')
    expect(getTreeDCommandBlockReason('restartKlipper', {
      ...PRINTING_CONTEXT,
      capabilities: {
        ...ALL_CAPABILITIES,
        serviceCommands: false,
      },
    })).toContain('capability')
  })

  it('allows runtime tune commands only during active print and requires homed Z for Z-offset', () => {
    expect(getTreeDCommandBlockReason('setPrintSpeedFactorPercent', PRINTING_CONTEXT)).toBeNull()
    expect(getTreeDCommandBlockReason('setPrintFlowFactorPercent', PAUSED_CONTEXT)).toBeNull()
    expect(getTreeDCommandBlockReason('setPrintAccel', PRINTING_CONTEXT)).toBeNull()
    expect(getTreeDCommandBlockReason('setPressureAdvance', PRINTING_CONTEXT)).toBeNull()
    expect(getTreeDCommandBlockReason('setRetractionLength', PAUSED_CONTEXT)).toBeNull()
    expect(getTreeDCommandBlockReason('adjustZOffset', {
      ...PRINTING_CONTEXT,
      homedAxes: 'xyz',
    }, {
      command: 'adjustZOffset',
      deltaMm: 0.025,
    })).toBeNull()

    expect(getTreeDCommandBlockReason('setPrintSpeedFactorPercent', IDLE_CONTEXT)).toContain('нет активной печати')
    expect(getTreeDCommandBlockReason('adjustZOffset', {
      ...PRINTING_CONTEXT,
      homedAxes: 'xy',
    }, {
      command: 'adjustZOffset',
      deltaMm: 0.025,
    })).toContain('Home Z')
  })
})
