import { describe, expect, it, vi } from 'vitest'
import { normalizeMoonrakerRuntimeSnapshot } from './moonrakerNormalizer'
import { createMoonrakerCommandClient } from '../commands/moonrakerCommandClient'

describe('Контракт режимов драйверов', () => {
 it('старый core не получает новые возможности', () => {
  const snapshot = normalizeMoonrakerRuntimeSnapshot({status: {}})
  expect(snapshot.capabilities.driverMode).toBeUndefined()
  expect(snapshot.driverMode?.supported).toBe(false)
 })
 it('проверяет версию, значения и наличие макросов', () => {
  const snapshot = normalizeMoonrakerRuntimeSnapshot({status: {
   'gcode_macro _TREED_UI_CONTRACT': {contract_version: '1.0', profile: 'treed_v2_corexy_v1', required_macros: '', capability_driver_mode: 1, capability_driver_fan_mode: 1},
   treed_driver_mode: {contract_version: '1.0', mode: 'quiet', state: 'ready', available_modes: ['normal', 'quiet']},
   treed_driver_fan_mode: {contract_version: '2.0', mode: 'quiet', state: 'ready', available_modes: ['normal', 'quiet'], active_speed: NaN},
  }}, {availableObjects: ['gcode_macro TREED_UI_SET_DRIVER_MODE', 'gcode_macro TREED_UI_SET_DRIVER_FAN_MODE']})
  expect(snapshot.capabilities.driverMode).toBe(true)
  expect(snapshot.capabilities.driverFanMode).toBe(false)
  expect(snapshot.driverFanMode?.activePercent).toBeNull()
 })
 it('использует отдельные макросы и отклоняет G-code в MODE', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({result: 'ok'})})
  const client = createMoonrakerCommandClient({moonrakerUrl: 'http://moonraker.local', fetchImpl: fetchMock})
  await client.execute({command: 'setDriverMode', mode: 'quiet'})
  await client.execute({command: 'setDriverFanMode', mode: 'normal'})
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).script).toBe('TREED_UI_SET_DRIVER_MODE MODE=quiet')
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).script).toBe('TREED_UI_SET_DRIVER_FAN_MODE MODE=normal')
  await expect(client.execute({command: 'setDriverMode', mode: 'quiet\nM112' as 'quiet'})).rejects.toThrow('MODE')
  expect(fetchMock).toHaveBeenCalledTimes(2)
 })
})
