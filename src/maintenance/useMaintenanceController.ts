import { useCallback, useState } from 'react'
import { clampPercent } from '../dashboard/helpers'
import type { MaintenanceChecklistItem, MaintenanceHistoryItem, MaintenanceStatus } from '../control'
import type { PrinterPrintJobSnapshot, PrinterUsageSnapshot } from '../core/transport/types'

const MAINTENANCE_INTERVAL_HOURS = 1000

const MAINTENANCE_HISTORY_ITEMS: readonly MaintenanceHistoryItem[] = []

const MAINTENANCE_CHECKLIST_ITEMS = [
  { id: 'belts', label: 'Проверка натяжения ремней' },
  { id: 'guides', label: 'Очистка направляющих и винтов' },
  { id: 'axes', label: 'Смазка осей и подшипников' },
  { id: 'fans', label: 'Проверка вентиляторов и обдува' },
  { id: 'hotend', label: 'Осмотр сопла и хотэнда' },
  { id: 'calibration', label: 'Калибровка стола (при необходимости)' },
] as const satisfies readonly MaintenanceChecklistItem[]

const MAINTENANCE_PROGRESS_TICKS = Array.from({ length: 31 }, (_item, index) => index)

type MaintenanceChecklistItemId = (typeof MAINTENANCE_CHECKLIST_ITEMS)[number]['id']

type UseMaintenanceControllerArgs = {
  usage: PrinterUsageSnapshot
  printJob: PrinterPrintJobSnapshot
}

function createMaintenanceChecklistState(checked: boolean): Record<MaintenanceChecklistItemId, boolean> {
  return MAINTENANCE_CHECKLIST_ITEMS.reduce<Record<MaintenanceChecklistItemId, boolean>>((state, item) => {
    state[item.id] = checked
    return state
  }, {} as Record<MaintenanceChecklistItemId, boolean>)
}

function secondsToDisplayHours(seconds: number): number {
  return Math.round((seconds / 3600) * 10) / 10
}

function createMaintenanceStatus({ usage, printJob }: UseMaintenanceControllerArgs): MaintenanceStatus {
  const activePrintDurationSec = printJob.isActive ? Math.max(0, printJob.printDurationSec) : 0
  const displayedRuntimeSec = usage.totalPrintTimeSec === null
    ? null
    : Math.max(0, usage.totalPrintTimeSec) + activePrintDurationSec
  const isRuntimeBacked = usage.state === 'ready' && displayedRuntimeSec !== null

  if (!isRuntimeBacked) {
    return {
      runtimeHours: 0,
      hoursLeft: 0,
      intervalHours: MAINTENANCE_INTERVAL_HOURS,
      isRuntimeBacked: false,
      notice: usage.message ?? 'Пробег Moonraker недоступен.',
    }
  }

  const intervalSec = MAINTENANCE_INTERVAL_HOURS * 60 * 60
  const remainingSec = Math.max(0, intervalSec - displayedRuntimeSec)

  return {
    runtimeHours: secondsToDisplayHours(displayedRuntimeSec),
    hoursLeft: Math.ceil(remainingSec / 3600),
    intervalHours: MAINTENANCE_INTERVAL_HOURS,
    isRuntimeBacked: true,
    notice: '',
  }
}

export function useMaintenanceController(args: UseMaintenanceControllerArgs) {
  const [checklistState, setChecklistState] = useState<Record<MaintenanceChecklistItemId, boolean>>(() =>
    createMaintenanceChecklistState(false),
  )
  const status = createMaintenanceStatus(args)
  const progressPercent = status.isRuntimeBacked
    ? clampPercent(status.runtimeHours, status.intervalHours)
    : 0

  const handleChecklistItemChange = useCallback((itemId: string, checked: boolean): void => {
    setChecklistState((current) => ({
      ...current,
      [itemId]: checked,
    }))
  }, [])

  const handleChecklistComplete = useCallback((): void => {
    setChecklistState(createMaintenanceChecklistState(true))
  }, [])

  return {
    status,
    historyItems: MAINTENANCE_HISTORY_ITEMS,
    checklistItems: MAINTENANCE_CHECKLIST_ITEMS,
    progressTicks: MAINTENANCE_PROGRESS_TICKS,
    progressPercent,
    checklistState,
    handleChecklistItemChange,
    handleChecklistComplete,
  }
}
