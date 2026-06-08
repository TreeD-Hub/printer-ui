import { describe, expect, test } from 'vitest'
import {
  getPrinterCapabilities,
  normalizeHomedAxes,
  type PrinterSnapshot,
} from '../src/index'

function createSnapshot(overrides: Partial<PrinterSnapshot> = {}): PrinterSnapshot {
  return {
    source: 'mock',
    connection: 'online',
    wifiSsid: 'Mock Wi-Fi',
    ipAddress: '127.0.0.1',
    state: 'standby',
    toolheadX: 0,
    toolheadY: 0,
    toolheadZ: 0,
    homedAxes: '',
    extruderTemp: 24,
    bedTemp: 25,
    modelFanPercent: 0,
    updatedAt: '2026-06-05T00:00:00.000Z',
    message: 'mock',
    ...overrides,
  }
}

function createCapabilities(overrides: Partial<PrinterSnapshot> = {}, scenarioLocks: string[] = []) {
  return getPrinterCapabilities(createSnapshot(overrides), {
    pendingCommand: null,
    scenarioLocks,
  })
}

describe('normalizeHomedAxes', () => {
  test('marks xyz as homed axes', () => {
    expect(normalizeHomedAxes('xyz')).toEqual({ X: true, Y: true, Z: true })
  })
})

describe('getPrinterCapabilities', () => {
  test.each([
    ['connecting', 'connecting'],
    ['reconnecting', 'reconnecting'],
    ['offline', 'offline'],
    ['shutdown', 'shutdown'],
  ] as const)('%s blocks regular actions and emergency stop', (connection, blockingState) => {
    const capabilities = createCapabilities({ connection })

    expect(capabilities.motion.xy).toMatchObject({ enabled: false, blockingState })
    expect(capabilities.parking.all).toMatchObject({ enabled: false, blockingState })
    expect(capabilities.print.start).toMatchObject({ enabled: false, blockingState })
    expect(capabilities.thermal.nozzle).toMatchObject({ enabled: false, blockingState })
    expect(capabilities.fan.model).toMatchObject({ enabled: false, blockingState })
    expect(capabilities.emergencyStop).toMatchObject({ enabled: false, blockingState })
  })

  test('degraded keeps regular capability checks available', () => {
    const capabilities = createCapabilities({ connection: 'degraded' })

    expect(capabilities.motion.xy).toEqual({ enabled: true, reason: null, blockingState: null })
    expect(capabilities.parking.all).toEqual({ enabled: true, reason: null, blockingState: null })
    expect(capabilities.print.start).toEqual({ enabled: true, reason: null, blockingState: null })
    expect(capabilities.thermal.nozzle).toEqual({ enabled: true, reason: null, blockingState: null })
    expect(capabilities.fan.model).toEqual({ enabled: true, reason: null, blockingState: null })
    expect(capabilities.emergencyStop).toEqual({ enabled: true, reason: null, blockingState: null })
  })

  test('pending command blocks regular actions but keeps emergency stop available', () => {
    const capabilities = getPrinterCapabilities(createSnapshot(), {
      pendingCommand: 'home',
      scenarioLocks: [],
    })

    expect(capabilities.motion.xy).toMatchObject({ enabled: false, blockingState: 'pendingCommand' })
    expect(capabilities.parking.axis.X).toMatchObject({ enabled: false, blockingState: 'pendingCommand' })
    expect(capabilities.print.start).toMatchObject({ enabled: false, blockingState: 'pendingCommand' })
    expect(capabilities.emergencyStop).toEqual({ enabled: true, reason: null, blockingState: null })
  })

  test('printing blocks motion and parking while allowing pause cancel thermal and fan tune', () => {
    const capabilities = createCapabilities({ state: 'printing' })

    expect(capabilities.motion.xy).toMatchObject({ enabled: false, blockingState: 'printing' })
    expect(capabilities.motion.z).toMatchObject({ enabled: false, blockingState: 'printing' })
    expect(capabilities.parking.all).toMatchObject({ enabled: false, blockingState: 'printing' })
    expect(capabilities.print.pause).toEqual({ enabled: true, reason: null, blockingState: null })
    expect(capabilities.print.cancel).toEqual({ enabled: true, reason: null, blockingState: null })
    expect(capabilities.thermal.nozzle).toEqual({ enabled: true, reason: null, blockingState: null })
    expect(capabilities.fan.model).toEqual({ enabled: true, reason: null, blockingState: null })
  })

  test('paused allows resume and cancel while blocking motion and parking', () => {
    const capabilities = createCapabilities({ state: 'paused' })

    expect(capabilities.print.resume).toEqual({ enabled: true, reason: null, blockingState: null })
    expect(capabilities.print.cancel).toEqual({ enabled: true, reason: null, blockingState: null })
    expect(capabilities.motion.xy).toMatchObject({ enabled: false, blockingState: 'paused' })
    expect(capabilities.parking.all).toMatchObject({ enabled: false, blockingState: 'paused' })
  })

  test('homing scenario lock blocks motion and parking', () => {
    const capabilities = createCapabilities({}, ['homing'])

    expect(capabilities.motion.xy).toMatchObject({ enabled: false, blockingState: 'homing' })
    expect(capabilities.motion.z).toMatchObject({ enabled: false, blockingState: 'homing' })
    expect(capabilities.parking.axis.Z).toMatchObject({ enabled: false, blockingState: 'homing' })
    expect(capabilities.print.start).toEqual({ enabled: true, reason: null, blockingState: null })
  })
})
