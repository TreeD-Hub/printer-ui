import { useCallback, useState } from 'react'
import { clampPercent } from '../dashboard/helpers'
import type { MaintenanceChecklistItem, MaintenanceHistoryItem, MaintenanceStatus } from '../control'

const MAINTENANCE_STATUS: MaintenanceStatus = {
  runtimeHours: 0,
  hoursLeft: 0,
  intervalHours: 1000,
  isRuntimeBacked: false,
  notice: 'Данные ТО пока не подключены к runtime.',
}

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

function createMaintenanceChecklistState(checked: boolean): Record<MaintenanceChecklistItemId, boolean> {
  return MAINTENANCE_CHECKLIST_ITEMS.reduce<Record<MaintenanceChecklistItemId, boolean>>((state, item) => {
    state[item.id] = checked
    return state
  }, {} as Record<MaintenanceChecklistItemId, boolean>)
}

export function useMaintenanceController() {
  const [checklistState, setChecklistState] = useState<Record<MaintenanceChecklistItemId, boolean>>(() =>
    createMaintenanceChecklistState(false),
  )
  const progressPercent = MAINTENANCE_STATUS.isRuntimeBacked
    ? clampPercent(MAINTENANCE_STATUS.runtimeHours, MAINTENANCE_STATUS.intervalHours)
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
    status: MAINTENANCE_STATUS,
    historyItems: MAINTENANCE_HISTORY_ITEMS,
    checklistItems: MAINTENANCE_CHECKLIST_ITEMS,
    progressTicks: MAINTENANCE_PROGRESS_TICKS,
    progressPercent,
    checklistState,
    handleChecklistItemChange,
    handleChecklistComplete,
  }
}
