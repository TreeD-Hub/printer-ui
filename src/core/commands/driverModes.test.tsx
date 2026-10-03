import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePrinterCommands } from './usePrinterCommands'
import { getTreeDCommandBlockReason, type TreeDCommandRuntimeContext } from './catalog'

const runtime = vi.hoisted(() => ({execute: vi.fn()}))
vi.mock('#runtime', () => ({createCommandClient: () => runtime}))

function context(): TreeDCommandRuntimeContext {
 return {
  source: 'live', capabilities: {driverMode: true, driverFanMode: true, print: true} as TreeDCommandRuntimeContext['capabilities'],
  uiContractStatus: 'compatible', connection: 'online', transportState: 'online', klippyState: 'ready',
  operationPhase: 'idle', printJob: {state: 'standby'},
  driverMode: {supported: true, mode: 'normal', state: 'ready', availableModes: ['normal', 'quiet'], needsRestart: false, message: null},
  driverFanMode: {supported: true, mode: 'normal', state: 'ready', availableModes: ['normal', 'quiet'], needsRestart: false, message: null},
 }
}

describe('Допуск и ожидание режимов', () => {
 it('блокирует XYZ во время печати, разрешает автоматический профиль обдува', () => {
  const state = {...context(), printJob: {state: 'printing'}}
  expect(getTreeDCommandBlockReason('setDriverMode', state, {command: 'setDriverMode', mode: 'quiet'})).not.toBeNull()
  expect(getTreeDCommandBlockReason('setDriverFanMode', state, {command: 'setDriverFanMode', mode: 'quiet'})).toBeNull()
  for (const phase of ['preparing', 'paused', 'calibrating']) {
   expect(getTreeDCommandBlockReason('setDriverMode', {...context(), operationPhase: phase})).not.toBeNull()
  }
 })
 it('не подтверждает HTTP accepted до обновления режима, блокирует старт на это время', async () => {
  runtime.execute.mockResolvedValue({command: 'setDriverMode', ok: true, status: 'accepted', message: 'ok', at: new Date().toISOString()})
  const initial = context()
  const hook = renderHook(({state}) => usePrinterCommands(state), {initialProps: {state: initial}})
  await act(async () => { expect(await hook.result.current.executeCommand({command: 'setDriverMode', mode: 'quiet'})).toBe(true) })
  expect(hook.result.current.pendingCommands.motion).toBe('setDriverMode')
  await act(async () => { expect(await hook.result.current.executeCommand({command: 'start', filename: 'test.gcode'})).toBe(false) })
  expect(runtime.execute).toHaveBeenCalledTimes(1)
  hook.rerender({state: {...initial, driverMode: {...initial.driverMode!, mode: 'quiet'}}})
  expect(hook.result.current.pendingCommands.motion).toBeUndefined()
 })
})
