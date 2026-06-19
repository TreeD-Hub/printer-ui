import type { ChangeEvent, MouseEvent, PointerEvent, ReactNode, RefObject } from 'react'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import { BABYSTEP_STEP_OPTIONS } from './config'
import { DashboardPage } from './DashboardPage'
import type {
  DashboardIdleWidgetId,
  DashboardProcessMetric,
  DashboardQuickMetric,
  DashboardTuneGroupId,
  IdleWidgetRefs,
  MaintenanceSummary,
} from './DashboardPage.types'

type DashboardChromeProps = {
  logoSrc: string
  statusDock: ReactNode
}
type DashboardPrintProps = {
  adjustedEtaTime: string
  displayLayerCurrent: number
  displayLayerTotal: number
  displayPrintFileName: string | null
  hasActivePrint: boolean
  isBusy: boolean
  isPrintPaused: boolean
  pendingCommand: PrinterCommandId | null
  printCancelBlockReason: string | null
  printFill: number
  printPauseCommand: Extract<PrinterCommandId, 'pause' | 'resume'>
}
type DashboardTuneProps = {
  babystepStep: number
  processMetrics: DashboardProcessMetric[]
  temperatureTargets: {
    nozzle: number
    bed: number
  }
  zOffsetMm: number
  printFanPercent: number
  createQuickMetrics: (fanPercent: number) => DashboardQuickMetric[]
}
type DashboardIdleProps = {
  armedIdleWidgetId: DashboardIdleWidgetId | null
  draggingIdleWidgetId: DashboardIdleWidgetId | null
  idleHeroStatusLabel: string
  idleNotesInputRef: RefObject<HTMLTextAreaElement | null>
  idleNotesKeyboardRows: string[][]
  idleNotesText: string
  idleWidgetOrder: DashboardIdleWidgetId[]
  idleWidgetRefs: IdleWidgetRefs
  isIdleNotesKeyboardOpen: boolean
  maintenanceSummary: MaintenanceSummary
}
type DashboardActionProps = {
  onBabystepAdjust: (deltaMm: number) => void
  onBabystepStepChange: (step: number) => void
  onIdleNotesChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onIdleNotesKeyboardClose: () => void
  onIdleNotesKeyboardOpen: () => void
  onIdleNotesKeyMouseDown: (event: MouseEvent<HTMLButtonElement>) => void
  onIdleNotesVirtualKey: (key: string) => void
  onIdleWidgetDragHandleClick: (event: MouseEvent<HTMLButtonElement>) => void
  onIdleWidgetDragPointerDown: (event: PointerEvent<HTMLButtonElement>, widgetId: DashboardIdleWidgetId) => void
  onIdleWidgetDragPointerEnd: (event: PointerEvent<HTMLButtonElement>) => void
  onIdleWidgetDragPointerMove: (event: PointerEvent<HTMLButtonElement>, widgetId: DashboardIdleWidgetId) => void
  onIdleWidgetTargetOpen: (widgetId: DashboardIdleWidgetId) => void
  onPause: () => void
  onPrintTuneGroupOpen: (groupId: DashboardTuneGroupId) => void
  onStopRequest: () => void
}

export type DashboardContainerProps = {
  chrome: DashboardChromeProps
  print: DashboardPrintProps
  tune: DashboardTuneProps
  idle: DashboardIdleProps
  actions: DashboardActionProps
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
}

export function DashboardContainer({
  chrome,
  print,
  tune,
  idle,
  actions,
  getCommandBlockReason,
}: DashboardContainerProps) {
  const quickMetrics = tune.createQuickMetrics(tune.printFanPercent)
  const babystepActiveIndex = Math.max(
    0,
    BABYSTEP_STEP_OPTIONS.findIndex((step) => step === tune.babystepStep),
  )
  const printPauseBlockReason = getCommandBlockReason(print.printPauseCommand)
  const babystepBlockReason = getCommandBlockReason('adjustZOffset', {
    command: 'adjustZOffset',
    deltaMm: tune.babystepStep,
  })

  return (
    <DashboardPage
      {...chrome}
      {...print}
      printPauseBlockReason={printPauseBlockReason}
      temperatureTargets={tune.temperatureTargets}
      quickMetrics={quickMetrics}
      processMetrics={tune.processMetrics}
      babystepStep={tune.babystepStep}
      babystepActiveIndex={babystepActiveIndex}
      zOffsetMm={tune.zOffsetMm}
      babystepBlockReason={babystepBlockReason}
      {...idle}
      {...actions}
    />
  )
}
