import type { ComponentProps } from 'react'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import { BABYSTEP_STEP_OPTIONS } from './config'
import { DashboardPage } from './DashboardPage'

type DashboardPageProps = ComponentProps<typeof DashboardPage>

type DashboardChromeProps = Pick<DashboardPageProps, 'logoSrc' | 'statusDock'>
type DashboardPrintProps = Pick<
  DashboardPageProps,
  | 'adjustedEtaTime'
  | 'displayLayerCurrent'
  | 'displayLayerTotal'
  | 'displayPrintFileName'
  | 'hasActivePrint'
  | 'isBusy'
  | 'isPrintPaused'
  | 'pendingCommand'
  | 'printCancelBlockReason'
  | 'printFill'
> & {
  printPauseCommand: Extract<PrinterCommandId, 'pause' | 'resume'>
}
type DashboardTuneProps = Pick<
  DashboardPageProps,
  | 'babystepStep'
  | 'processMetrics'
  | 'temperatureTargets'
  | 'zOffsetMm'
> & {
  printFanPercent: number
  createQuickMetrics: (fanPercent: number) => DashboardPageProps['quickMetrics']
}
type DashboardIdleProps = Pick<
  DashboardPageProps,
  | 'armedIdleWidgetId'
  | 'draggingIdleWidgetId'
  | 'idleHeroStatusLabel'
  | 'idleNotesInputRef'
  | 'idleNotesKeyboardRows'
  | 'idleNotesText'
  | 'idleWidgetOrder'
  | 'idleWidgetRefs'
  | 'isIdleNotesKeyboardOpen'
  | 'maintenanceSummary'
>
type DashboardActionProps = Pick<
  DashboardPageProps,
  | 'onBabystepAdjust'
  | 'onBabystepStepChange'
  | 'onIdleNotesChange'
  | 'onIdleNotesKeyboardClose'
  | 'onIdleNotesKeyboardOpen'
  | 'onIdleNotesKeyMouseDown'
  | 'onIdleNotesVirtualKey'
  | 'onIdleWidgetDragHandleClick'
  | 'onIdleWidgetDragPointerDown'
  | 'onIdleWidgetDragPointerEnd'
  | 'onIdleWidgetDragPointerMove'
  | 'onIdleWidgetTargetOpen'
  | 'onPause'
  | 'onPrintTuneGroupOpen'
  | 'onStopRequest'
>

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
