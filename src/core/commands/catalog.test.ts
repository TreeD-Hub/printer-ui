import { describe, expect, it } from 'vitest'
import {
  getTreeDCommandBlockReason,
  getTreeDCommandCatalogItem,
  isDangerousTreeDCommand,
  TREE_D_COMMAND_CATALOG,
} from './catalog'
import type { PrinterCapabilitiesSnapshot } from '../transport/types'
import type { PrinterCommandId } from './types'

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
  'turnOffHeaters',
  'setFanPercent',
  'loadFilament',
  'unloadFilament',
  'zParkZeroEddy',
  'shaperCalibrateLight',
  'shaperCalibrateFull',
  'xyMotionTest',
  'consoleGcode',
  'rebootHost',
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
    expect(isDangerousTreeDCommand('shutdownHost')).toBe(true)

    expect(isDangerousTreeDCommand('pause')).toBe(false)
    expect(isDangerousTreeDCommand('setFanPercent')).toBe(false)
  })

  it('keeps Eddy Z-home and TreeD calibration commands out of safe tier', () => {
    expect(getTreeDCommandCatalogItem('homeZ').risk).toBe('caution')
    expect(getTreeDCommandCatalogItem('zParkZeroEddy').risk).toBe('caution')
    expect(getTreeDCommandCatalogItem('shaperCalibrateLight').risk).toBe('caution')
    expect(getTreeDCommandCatalogItem('shaperCalibrateFull').risk).toBe('caution')
  })

  it('blocks commands when capability is missing or connection is unsafe', () => {
    expect(getTreeDCommandBlockReason('pause', {
      capabilities: ALL_CAPABILITIES,
      connection: 'online',
    })).toBeNull()
    expect(getTreeDCommandBlockReason('pause', {
      capabilities: {
        ...ALL_CAPABILITIES,
        print: false,
      },
      connection: 'online',
    })).toContain('capability')
    expect(getTreeDCommandBlockReason('cancel', {
      capabilities: ALL_CAPABILITIES,
      connection: 'degraded',
    })).toContain('ограниченном режиме')
    expect(getTreeDCommandBlockReason('setFanPercent', {
      capabilities: ALL_CAPABILITIES,
      connection: 'degraded',
    })).toBeNull()
    expect(getTreeDCommandBlockReason('pause', {
      capabilities: ALL_CAPABILITIES,
      connection: 'reconnecting',
    })).toContain('восстановление связи')
  })
})
