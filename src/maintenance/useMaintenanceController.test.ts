import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PrinterPrintJobSnapshot, PrinterUsageSnapshot } from '../core/transport/types'
import { createLoadingMoonrakerSystemStatus } from '../settings/systemStatus'
import { createMemoryMaintenanceRepository } from './maintenanceRepository'
import { createMaintenanceStatus, useMaintenanceController } from './useMaintenanceController'

const HOUR = 60 * 60

function createUsage(totalPrintTimeSec: number): PrinterUsageSnapshot {
  return {
    totalPrintTimeSec,
    totalJobTimeSec: totalPrintTimeSec,
    totalJobs: 1,
    totalFilamentUsedMm: 0,
    longestPrintSec: totalPrintTimeSec,
    updatedAt: '2026-07-03T12:00:00.000Z',
    state: 'ready',
    message: null,
  }
}

function createPrintJob(overrides: Partial<PrinterPrintJobSnapshot> = {}): PrinterPrintJobSnapshot {
  return {
    filename: '',
    filePath: null,
    state: 'ready',
    message: '',
    progress: 0,
    progressPercent: 0,
    totalDurationSec: 0,
    printDurationSec: 0,
    filamentUsedMm: 0,
    currentLayer: null,
    totalLayer: null,
    isPaused: false,
    isActive: false,
    ...overrides,
  }
}

function readyLedger(runtimeSec?: number) {
  return {
    loadState: 'ready' as const,
    ledger: {
      schemaVersion: 1 as const,
      records: runtimeSec === undefined ? [] : [{
        id: 'maintenance-record',
        completedAt: '2026-06-01T10:00:00.000Z',
        runtimeSec,
      }],
    },
    error: '',
  }
}

describe('createMaintenanceStatus', () => {
  it('calculates the service cycle from the runtime captured at the last maintenance', () => {
    const status = createMaintenanceStatus({
      usage: createUsage(1437 * HOUR),
      printJob: createPrintJob(),
      systemStatus: createLoadingMoonrakerSystemStatus(),
    }, readyLedger(1000 * HOUR))

    expect(status.runtimeHours).toBe(1437)
    expect(status.cycleRuntimeHours).toBe(437)
    expect(status.hoursLeft).toBe(563)
    expect(status.isCycleBacked).toBe(true)
  })

  it('uses the full printer runtime before the first maintenance is recorded', () => {
    const status = createMaintenanceStatus({
      usage: createUsage(437 * HOUR),
      printJob: createPrintJob(),
      systemStatus: createLoadingMoonrakerSystemStatus(),
    }, readyLedger())

    expect(status.runtimeHours).toBe(437)
    expect(status.cycleRuntimeHours).toBe(437)
    expect(status.hoursLeft).toBe(563)
    expect(status.cycleNotice).toContain('ТО ещё не фиксировалось')
  })

  it('includes the active print duration in the current cycle', () => {
    const status = createMaintenanceStatus({
      usage: createUsage(100 * HOUR),
      printJob: createPrintJob({ isActive: true, printDurationSec: HOUR }),
      systemStatus: createLoadingMoonrakerSystemStatus(),
    }, readyLedger(50 * HOUR))

    expect(status.runtimeHours).toBe(101)
    expect(status.cycleRuntimeHours).toBe(51)
  })

  it('does not claim a valid cycle when Moonraker runtime moved behind the last record', () => {
    const status = createMaintenanceStatus({
      usage: createUsage(100 * HOUR),
      printJob: createPrintJob(),
      systemStatus: createLoadingMoonrakerSystemStatus(),
    }, readyLedger(150 * HOUR))

    expect(status.isRuntimeBacked).toBe(true)
    expect(status.isCycleBacked).toBe(false)
    expect(status.cycleNotice).toContain('Пробег Moonraker меньше значения последнего ТО')
  })
})

describe('useMaintenanceController', () => {
  it('stores the current runtime as a new baseline and resets the cycle', async () => {
    const repository = createMemoryMaintenanceRepository({
      schemaVersion: 1,
      records: [{
        id: 'previous-maintenance',
        completedAt: '2026-06-01T10:00:00.000Z',
        runtimeSec: 100 * HOUR,
      }],
    })
    const args = {
      usage: createUsage(150 * HOUR),
      printJob: createPrintJob(),
      systemStatus: createLoadingMoonrakerSystemStatus(),
      repository,
    }
    const { result } = renderHook(() => useMaintenanceController(args))

    await waitFor(() => {
      expect(result.current.status.isCycleBacked).toBe(true)
      expect(result.current.status.cycleRuntimeHours).toBe(50)
    })

    await act(async () => {
      await expect(result.current.handleMaintenanceComplete()).resolves.toBe(true)
    })

    expect(result.current.status.cycleRuntimeHours).toBe(0)
    expect(result.current.status.hoursLeft).toBe(1000)
    expect(result.current.historyItems[0]?.runtimeHours).toBe(150)
  })

  it('blocks maintenance completion while a print is active', async () => {
    const repository = createMemoryMaintenanceRepository()
    const { result } = renderHook(() => useMaintenanceController({
      usage: createUsage(150 * HOUR),
      printJob: createPrintJob({ isActive: true, printDurationSec: HOUR }),
      systemStatus: createLoadingMoonrakerSystemStatus(),
      repository,
    }))

    await waitFor(() => expect(result.current.status.isCycleBacked).toBe(true))

    await expect(result.current.handleMaintenanceComplete()).resolves.toBe(false)
    expect(result.current.completionBlockReason).toContain('во время печати')
  })
})
