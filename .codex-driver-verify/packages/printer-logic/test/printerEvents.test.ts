import { describe, expect, it } from 'vitest'
import { parsePrinterEvent, readPrinterEvent, describePrinterEvent, getTreeDCommandBlockReason, type TreeDCommandRuntimeContext } from '../src/index'

describe('события и допуск операторских команд', () => {
  it('читает wire-контракт и отклоняет посторонние/повреждённые сообщения', () => {
    const event = parsePrinterEvent('// treed_event v1|12|paused|filament_runout')!
    expect(event).toEqual({ sequence: 12, code: 'paused', detail: 'filament_runout' })
    expect(describePrinterEvent(event).details).toContain('отсутствии филамента')
    expect(parsePrinterEvent('echo: T:200')).toBeNull()
    expect(parsePrinterEvent('treed_event v2|1|paused|operator')).toBeNull()
    expect(readPrinterEvent({ sequence: 0, code: 'paused', detail: '' })).toBeNull()
    expect(readPrinterEvent({ sequence: 1, code: 'paused', detail: '"\nG28' })).toBeNull()
  })

  const context = {
    capabilities: { filament: true, motion: true, lighting: true },
    uiContractStatus: 'compatible', connection: 'online', transportState: 'online',
    extruderTemp: 210, homedAxes: 'xyz',
  } as TreeDCommandRuntimeContext

  it('разрешает филамент только idle/paused, оси и парковку блокирует в обеих фазах задания', () => {
    for (const state of ['printing', 'paused']) {
      const current = { ...context, printJob: { state } }
      for (const command of ['homeAll', 'homeX', 'homeZ', 'parkZBottom', 'disableMotors'] as const) {
        expect(getTreeDCommandBlockReason(command, current)).not.toBeNull()
      }
      for (const command of ['loadFilament', 'unloadFilament'] as const) {
        expect(getTreeDCommandBlockReason(command, current) === null).toBe(state === 'paused')
      }
    }
    expect(getTreeDCommandBlockReason('loadFilament', { ...context, printJob: { state: 'paused' }, clogRecoveryActive: true })).toContain('прочистка')
    expect(getTreeDCommandBlockReason('loadFilament', { ...context, printJob: { state: 'paused' }, extruderTemp: 140 })).not.toBeNull()
    expect(getTreeDCommandBlockReason('loadFilament', { ...context, operationPhase: 'preparing' })).not.toBeNull()
  })

  it('настройки света требуют capability обновлённого core', () => {
    expect(getTreeDCommandBlockReason('setLightPreference', context)).not.toBeNull()
    expect(getTreeDCommandBlockReason('setLightPreference', { ...context, capabilities: { ...context.capabilities, lightingPreferences: true } })).toBeNull()
  })
})
