import { describe, expect, it } from 'vitest'
import { getTreeDCommandBlockReason, type TreeDCommandRuntimeContext } from '../src/index'

const context: TreeDCommandRuntimeContext = {
  source: 'live', capabilities: { driverFanMode: true } as TreeDCommandRuntimeContext['capabilities'],
  uiContractStatus: 'compatible', connection: 'online', transportState: 'online', klippyState: 'ready',
  operationPhase: 'idle', printJob: { state: 'standby' },
  driverFanMode: { supported: true, mode: 'normal', state: 'ready', availableModes: ['normal'],
    needsRestart: false, message: null, powerControlSupported: true, minPowerPercent: 80, maxPowerPercent: 100 },
}

describe('Мощность обдува в проверенном диапазоне', () => {
  it('разрешает подтверждённый диапазон и блокирует недопущенные значения', () => {
    for (const percent of [80, 90, 100]) {
      expect(getTreeDCommandBlockReason('setDriverFanMode', context, { command: 'setDriverFanMode', mode: 'normal', percent })).toBeNull()
    }
    for (const percent of [0, 79, 101, NaN, Infinity, 90.5]) {
      expect(getTreeDCommandBlockReason('setDriverFanMode', context, { command: 'setDriverFanMode', mode: 'normal', percent })).not.toBeNull()
    }
  })
  it('не отправляет POWER старому core или без границ устройства', () => {
    for (const state of [{ powerControlSupported: false }, { minPowerPercent: null }, { maxPowerPercent: null }]) {
      expect(getTreeDCommandBlockReason('setDriverFanMode', { ...context, driverFanMode: { ...context.driverFanMode!, ...state } },
        { command: 'setDriverFanMode', mode: 'normal', percent: 90 })).not.toBeNull()
    }
    expect(getTreeDCommandBlockReason('setDriverFanMode', context, { command: 'setDriverFanMode', mode: 'normal' })).toBeNull()
  })
})
