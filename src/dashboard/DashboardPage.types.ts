import type {
  ChangeEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
  RefObject,
} from 'react'
import type { PrinterFilePreview } from '@treed/printer-logic'
import type { PrinterCommandId } from '../core/commands'

export type DashboardTuneGroupId =
  | 'nozzle'
  | 'bed'
  | 'fan'
  | 'flow'
  | 'speed'
  | 'accel'
  | 'kFactor'
  | 'retract'

export type DashboardIdleWidgetId = 'temperature' | 'maintenance'

export type DashboardQuickMetric = {
  key: Extract<DashboardTuneGroupId, 'fan' | 'flow'>
  label: string
  unit: string
  value: number
  valueClassName: 'process-value' | 'percent'
}

export type DashboardProcessMetric = {
  key: Extract<DashboardTuneGroupId, 'speed' | 'accel' | 'kFactor' | 'retract'>
  label: string
  unit?: string
  value: number
}

export type MaintenanceSummary = {
  runtimeHours: number
  hoursLeft: number
  isRuntimeBacked: boolean
}

export type IdleWidgetRefs = {
  current: Record<DashboardIdleWidgetId, HTMLElement | null>
}

export type DashboardPageProps = {
  statusDock: ReactNode
  logoSrc: string
  hasActivePrint: boolean
  displayPrintFileName: string | null
  displayPrintFileNameScrollDistanceCh: number
  isDisplayPrintFileNameScrollable: boolean
  printFilePreview?: PrinterFilePreview
  printFill: number
  adjustedEtaTime: string
  displayLayerCurrent: number
  displayLayerTotal: number
  temperatureTargets: {
    nozzle: number
    bed: number
  }
  quickMetrics: DashboardQuickMetric[]
  processMetrics: DashboardProcessMetric[]
  isPrintPaused: boolean
  pendingCommand: PrinterCommandId | null
  isBusy: boolean
  printPauseBlockReason: string | null
  printCancelBlockReason: string | null
  babystepStep: number
  babystepActiveIndex: number
  zOffsetMm: number
  babystepBlockReason: string | null
  idleHeroStatusLabel: string
  idleWidgetOrder: DashboardIdleWidgetId[]
  armedIdleWidgetId: DashboardIdleWidgetId | null
  draggingIdleWidgetId: DashboardIdleWidgetId | null
  idleWidgetRefs: IdleWidgetRefs
  maintenanceSummary: MaintenanceSummary
  idleNotesInputRef: RefObject<HTMLTextAreaElement | null>
  idleNotesText: string
  onPrintTuneGroupOpen: (groupId: DashboardTuneGroupId) => void
  onPause: () => void
  onStopRequest: () => void
  onBabystepStepChange: (step: number) => void
  onBabystepAdjust: (deltaMm: number) => void
  onIdleWidgetTargetOpen: (widgetId: DashboardIdleWidgetId) => void
  onIdleWidgetDragPointerDown: (event: PointerEvent<HTMLButtonElement>, widgetId: DashboardIdleWidgetId) => void
  onIdleWidgetDragPointerMove: (event: PointerEvent<HTMLButtonElement>, widgetId: DashboardIdleWidgetId) => void
  onIdleWidgetDragPointerEnd: (event: PointerEvent<HTMLButtonElement>) => void
  onIdleWidgetDragHandleClick: (event: MouseEvent<HTMLButtonElement>) => void
  onIdleNotesKeyboardOpen: () => void
  onIdleNotesChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
}

export type DashboardPrintViewProps = Pick<
  DashboardPageProps,
  | 'adjustedEtaTime'
  | 'babystepActiveIndex'
  | 'babystepBlockReason'
  | 'babystepStep'
  | 'displayLayerCurrent'
  | 'displayLayerTotal'
  | 'displayPrintFileName'
  | 'displayPrintFileNameScrollDistanceCh'
  | 'isBusy'
  | 'isDisplayPrintFileNameScrollable'
  | 'isPrintPaused'
  | 'onBabystepAdjust'
  | 'onBabystepStepChange'
  | 'onPause'
  | 'onPrintTuneGroupOpen'
  | 'onStopRequest'
  | 'pendingCommand'
  | 'printCancelBlockReason'
  | 'printFilePreview'
  | 'printFill'
  | 'printPauseBlockReason'
  | 'processMetrics'
  | 'quickMetrics'
  | 'statusDock'
  | 'temperatureTargets'
  | 'zOffsetMm'
>

export type DashboardIdleViewProps = Pick<
  DashboardPageProps,
  | 'armedIdleWidgetId'
  | 'draggingIdleWidgetId'
  | 'idleHeroStatusLabel'
  | 'idleNotesInputRef'
  | 'idleNotesText'
  | 'idleWidgetOrder'
  | 'idleWidgetRefs'
  | 'logoSrc'
  | 'maintenanceSummary'
  | 'onIdleNotesChange'
  | 'onIdleNotesKeyboardOpen'
  | 'onIdleWidgetDragHandleClick'
  | 'onIdleWidgetDragPointerDown'
  | 'onIdleWidgetDragPointerEnd'
  | 'onIdleWidgetDragPointerMove'
  | 'onIdleWidgetTargetOpen'
  | 'statusDock'
>
