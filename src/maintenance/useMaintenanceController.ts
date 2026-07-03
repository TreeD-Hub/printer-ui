import { useCallback, useEffect, useMemo, useState } from 'react'
import { runtimeMode } from '#runtime'
import type { MaintenanceHistoryItem, MaintenanceStatus } from '../control'
import type { PrinterPrintJobSnapshot, PrinterUsageSnapshot } from '../core/transport/types'
import {
  summarizeMoonrakerSystemStatus,
  type MoonrakerSystemStatus,
} from '../settings/systemStatus'
import {
  createMemoryMaintenanceRepository,
  createMoonrakerMaintenanceRepository,
  type MaintenanceLedger,
  type MaintenanceRepository,
} from './maintenanceRepository'

const MAINTENANCE_INTERVAL_HOURS = 1000
const MAINTENANCE_PROGRESS_TICKS = Array.from({ length: 31 }, (_item, index) => index)
const RUNTIME_RESET_TOLERANCE_SEC = 60
const MAINTENANCE_LOAD_RETRY_MS = 10_000

const EMPTY_LEDGER: MaintenanceLedger = {
  schemaVersion: 1,
  records: [],
}

type MaintenanceLedgerState = {
  loadState: 'loading' | 'ready' | 'error'
  ledger: MaintenanceLedger
  error: string
}

type UseMaintenanceControllerArgs = {
  usage: PrinterUsageSnapshot
  printJob: PrinterPrintJobSnapshot
  systemStatus: MoonrakerSystemStatus
  repository?: MaintenanceRepository
}

function currentRuntimeSec(usage: PrinterUsageSnapshot, printJob: PrinterPrintJobSnapshot): number | null {
  if (usage.state !== 'ready' || usage.totalPrintTimeSec === null) {
    return null
  }

  const activePrintDurationSec = printJob.isActive ? Math.max(0, printJob.printDurationSec) : 0
  return Math.max(0, usage.totalPrintTimeSec) + activePrintDurationSec
}

function hours(seconds: number): number {
  return seconds / 3600
}

export function createMaintenanceStatus(
  args: UseMaintenanceControllerArgs,
  ledgerState: MaintenanceLedgerState,
): MaintenanceStatus {
  const systemSummary = summarizeMoonrakerSystemStatus(args.systemStatus)
  const totalRuntimeSec = currentRuntimeSec(args.usage, args.printJob)
  const isRuntimeBacked = totalRuntimeSec !== null
  const baseStatus = {
    runtimeHours: totalRuntimeSec === null ? 0 : hours(totalRuntimeSec),
    cycleRuntimeHours: 0,
    hoursLeft: 0,
    intervalHours: MAINTENANCE_INTERVAL_HOURS,
    isRuntimeBacked,
    isCycleBacked: false,
    cycleState: 'unavailable' as const,
    notice: totalRuntimeSec === null
      ? (args.usage.message ?? 'Пробег Moonraker недоступен.')
      : '',
    cycleNotice: '',
    lastMaintenanceAt: null as string | null,
    systemLabel: systemSummary.label,
    systemTone: systemSummary.tone,
    systemNotice: systemSummary.notice,
  }

  if (totalRuntimeSec === null) {
    return {
      ...baseStatus,
      cycleNotice: baseStatus.notice,
    }
  }

  if (ledgerState.loadState === 'loading') {
    return {
      ...baseStatus,
      cycleState: 'loading',
      cycleNotice: 'Загрузка истории технического обслуживания.',
    }
  }

  if (ledgerState.loadState === 'error') {
    return {
      ...baseStatus,
      cycleNotice: ledgerState.error || 'История технического обслуживания недоступна.',
    }
  }

  const latestRecord = ledgerState.ledger.records[0]
  if (latestRecord !== undefined && latestRecord.runtimeSec > totalRuntimeSec + RUNTIME_RESET_TOLERANCE_SEC) {
    return {
      ...baseStatus,
      lastMaintenanceAt: latestRecord.completedAt,
      cycleNotice: 'Пробег Moonraker меньше значения последнего ТО. Зафиксируйте новый сервисный цикл.',
    }
  }

  const baselineRuntimeSec = latestRecord?.runtimeSec ?? 0
  const cycleRuntimeSec = Math.max(0, totalRuntimeSec - baselineRuntimeSec)
  const intervalSec = MAINTENANCE_INTERVAL_HOURS * 60 * 60
  const remainingSec = Math.max(0, intervalSec - cycleRuntimeSec)

  return {
    ...baseStatus,
    cycleRuntimeHours: hours(cycleRuntimeSec),
    hoursLeft: Math.ceil(remainingSec / 3600),
    isCycleBacked: true,
    cycleState: 'ready',
    cycleNotice: latestRecord === undefined
      ? 'ТО ещё не фиксировалось. Отсчёт ведётся от общего пробега.'
      : '',
    lastMaintenanceAt: latestRecord?.completedAt ?? null,
  }
}

function historyItems(ledger: MaintenanceLedger): MaintenanceHistoryItem[] {
  return ledger.records.map((item) => ({
    id: item.id,
    date: new Intl.DateTimeFormat('ru-RU').format(new Date(item.completedAt)),
    runtimeHours: hours(item.runtimeSec),
    label: 'Плановое ТО',
  }))
}

export function useMaintenanceController(args: UseMaintenanceControllerArgs) {
  const repository = useMemo(
    () => args.repository ?? (
      runtimeMode === 'mock'
        ? createMemoryMaintenanceRepository()
        : createMoonrakerMaintenanceRepository()
    ),
    [args.repository],
  )
  const [ledgerState, setLedgerState] = useState<MaintenanceLedgerState>({
    loadState: 'loading',
    ledger: EMPTY_LEDGER,
    error: '',
  })
  const [isCompletingMaintenance, setIsCompletingMaintenance] = useState(false)
  const [completionError, setCompletionError] = useState('')

  useEffect(() => {
    let isDisposed = false
    let retryTimer: number | null = null

    const loadLedger = async (): Promise<void> => {
      try {
        const ledger = await repository.load()
        if (!isDisposed) {
          setLedgerState({ loadState: 'ready', ledger, error: '' })
        }
      } catch (error) {
        if (isDisposed) {
          return
        }

        setLedgerState({
          loadState: 'error',
          ledger: EMPTY_LEDGER,
          error: error instanceof Error ? error.message : String(error),
        })
        retryTimer = window.setTimeout(() => {
          void loadLedger()
        }, MAINTENANCE_LOAD_RETRY_MS)
      }
    }

    void loadLedger()

    return () => {
      isDisposed = true
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
    }
  }, [repository])

  const calculatedStatus = createMaintenanceStatus(args, ledgerState)
  const progressPercent = calculatedStatus.isCycleBacked === true
    ? Math.min(100, Math.max(0, ((calculatedStatus.cycleRuntimeHours ?? 0) / calculatedStatus.intervalHours) * 100))
    : 0
  const totalRuntimeSec = currentRuntimeSec(args.usage, args.printJob)
  const completionBlockReason = args.printJob.isActive
    ? 'Нельзя фиксировать техническое обслуживание во время печати.'
    : totalRuntimeSec === null
      ? (args.usage.message ?? 'Пробег Moonraker недоступен.')
      : ledgerState.loadState === 'loading'
        ? 'История технического обслуживания ещё загружается.'
        : isCompletingMaintenance
          ? 'Сохранение технического обслуживания.'
          : null

  const status: MaintenanceStatus = {
    ...calculatedStatus,
    isCompletingMaintenance,
    completionError,
    completionBlockReason,
  }

  const handleMaintenanceComplete = useCallback(async (): Promise<boolean> => {
    const runtimeSec = currentRuntimeSec(args.usage, args.printJob)
    if (args.printJob.isActive || runtimeSec === null || isCompletingMaintenance) {
      return false
    }

    setIsCompletingMaintenance(true)
    setCompletionError('')

    try {
      const ledger = await repository.complete(runtimeSec)
      setLedgerState({ loadState: 'ready', ledger, error: '' })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setCompletionError(message)
      setLedgerState((current) => ({
        ...current,
        loadState: current.ledger.records.length > 0 ? 'ready' : 'error',
        error: message,
      }))
      return false
    } finally {
      setIsCompletingMaintenance(false)
    }
  }, [args.printJob, args.usage, isCompletingMaintenance, repository])

  return {
    status,
    historyItems: historyItems(ledgerState.ledger),
    progressTicks: MAINTENANCE_PROGRESS_TICKS,
    progressPercent,
    isCompletingMaintenance,
    completionError,
    completionBlockReason,
    handleMaintenanceComplete,
  }
}
