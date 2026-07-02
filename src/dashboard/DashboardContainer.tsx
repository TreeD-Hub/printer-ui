import { createCommandClient } from '#runtime'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import type { PrinterFilePreview } from '@treed/printer-logic'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import { usePrinterStoreSelector } from '../core/store/printerStore'
import type { PrinterSnapshot } from '../core/transport/types'
import { useMoonrakerSystemStatus } from '../settings/useMoonrakerSystemStatus'
import { BABYSTEP_STEP_OPTIONS } from './config'
import { DashboardDiagnosticView } from './DashboardDiagnosticView'
import {
  resolveDashboardDiagnostic,
  type DashboardDiagnosticRuntime,
  type DashboardRecoveryCommand,
} from './dashboardDiagnosticState'
import { DashboardPage } from './DashboardPage'
import type {
  DashboardIdleWidgetId,
  DashboardProcessMetric,
  DashboardQuickMetric,
  DashboardTuneGroupId,
  IdleWidgetRefs,
  MaintenanceSummary,
} from './DashboardPage.types'

const DIAGNOSTIC_CONFIRMATION_TIMEOUT_MS = 5_000
const DIAGNOSTIC_REFRESH_AFTER_ACTION_MS = 1_500

type DashboardChromeProps = {
  logoSrc: string
  statusDock: ReactNode
}
type DashboardPrintProps = {
  adjustedEtaTime: string
  displayLayerCurrent: number
  displayLayerTotal: number
  displayPrintFileName: string | null
  displayPrintFileNameScrollDistanceCh: number
  hasActivePrint: boolean
  isDisplayPrintFileNameScrollable: boolean
  isBusy: boolean
  isPrintPaused: boolean
  pendingCommand: PrinterCommandId | null
  printCancelBlockReason: string | null
  excludeObjectOpenBlockReason: string | null
  printFilePreview?: PrinterFilePreview
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
  idleNotesText: string
  idleWidgetOrder: DashboardIdleWidgetId[]
  idleWidgetRefs: IdleWidgetRefs
  maintenanceSummary: MaintenanceSummary
}
type DashboardActionProps = {
  onBabystepAdjust: (deltaMm: number) => void
  onBabystepStepChange: (step: number) => void
  onIdleNotesChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onIdleNotesKeyboardOpen: () => void
  onIdleWidgetDragHandleClick: (event: MouseEvent<HTMLButtonElement>) => void
  onIdleWidgetDragPointerDown: (event: PointerEvent<HTMLButtonElement>, widgetId: DashboardIdleWidgetId) => void
  onIdleWidgetDragPointerEnd: (event: PointerEvent<HTMLButtonElement>) => void
  onIdleWidgetDragPointerMove: (event: PointerEvent<HTMLButtonElement>, widgetId: DashboardIdleWidgetId) => void
  onIdleWidgetTargetOpen: (widgetId: DashboardIdleWidgetId) => void
  onPause: () => void
  onPrintTuneGroupOpen: (groupId: DashboardTuneGroupId) => void
  onStopRequest: () => void
  onExcludeObjectOpen: () => void
}

export type DashboardContainerProps = {
  chrome: DashboardChromeProps
  print: DashboardPrintProps
  tune: DashboardTuneProps
  idle: DashboardIdleProps
  actions: DashboardActionProps
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
}

function selectDashboardDiagnosticRuntime(snapshot: PrinterSnapshot): DashboardDiagnosticRuntime {
  return {
    source: snapshot.source,
    connection: snapshot.connection,
    transportState: snapshot.transport.state,
    transportMessage: snapshot.transport.message,
    klippyState: snapshot.klippy.state,
    klippyMessage: snapshot.klippy.message,
    runtimeMessage: snapshot.message,
    uiContractStatus: snapshot.uiContract.status,
    uiContractMessage: snapshot.uiContract.message,
  }
}

function isDashboardDiagnosticRuntimeEqual(
  left: DashboardDiagnosticRuntime,
  right: DashboardDiagnosticRuntime,
): boolean {
  return (
    left.source === right.source &&
    left.connection === right.connection &&
    left.transportState === right.transportState &&
    left.transportMessage === right.transportMessage &&
    left.klippyState === right.klippyState &&
    left.klippyMessage === right.klippyMessage &&
    left.runtimeMessage === right.runtimeMessage &&
    left.uiContractStatus === right.uiContractStatus &&
    left.uiContractMessage === right.uiContractMessage
  )
}

export function DashboardContainer({
  chrome,
  print,
  tune,
  idle,
  actions,
  getCommandBlockReason,
}: DashboardContainerProps) {
  const diagnosticRuntime = usePrinterStoreSelector(
    selectDashboardDiagnosticRuntime,
    isDashboardDiagnosticRuntimeEqual,
  )
  const systemStatusController = useMoonrakerSystemStatus(diagnosticRuntime.source === 'live')
  const diagnostic = useMemo(
    () => resolveDashboardDiagnostic(diagnosticRuntime, systemStatusController.status),
    [diagnosticRuntime, systemStatusController.status],
  )
  const commandClient = useMemo(() => createCommandClient(), [])
  const confirmationTimerRef = useRef<number | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const [armedDiagnosticId, setArmedDiagnosticId] = useState<string | null>(null)
  const [pendingRecoveryCommand, setPendingRecoveryCommand] = useState<DashboardRecoveryCommand | null>(null)
  const [diagnosticActionError, setDiagnosticActionError] = useState<string | null>(null)

  const clearDiagnosticConfirmation = useCallback((): void => {
    if (confirmationTimerRef.current !== null) {
      window.clearTimeout(confirmationTimerRef.current)
      confirmationTimerRef.current = null
    }
    setArmedDiagnosticId(null)
  }, [])

  useEffect(() => {
    clearDiagnosticConfirmation()
    setDiagnosticActionError(null)
  }, [clearDiagnosticConfirmation, diagnostic?.id])

  useEffect(() => {
    return () => {
      if (confirmationTimerRef.current !== null) {
        window.clearTimeout(confirmationTimerRef.current)
      }
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
      }
    }
  }, [])

  const handleDiagnosticAction = useCallback(async (): Promise<void> => {
    if (diagnostic === null || pendingRecoveryCommand !== null) {
      return
    }

    setDiagnosticActionError(null)

    if (diagnostic.action.kind === 'refresh') {
      systemStatusController.refresh()
      return
    }

    if (armedDiagnosticId !== diagnostic.id) {
      clearDiagnosticConfirmation()
      setArmedDiagnosticId(diagnostic.id)
      confirmationTimerRef.current = window.setTimeout(() => {
        setArmedDiagnosticId((currentId) => currentId === diagnostic.id ? null : currentId)
        confirmationTimerRef.current = null
      }, DIAGNOSTIC_CONFIRMATION_TIMEOUT_MS)
      return
    }

    clearDiagnosticConfirmation()
    setPendingRecoveryCommand(diagnostic.action.command)

    try {
      const result = await commandClient.execute({ command: diagnostic.action.command })
      if (!result.ok) {
        setDiagnosticActionError(result.message)
        return
      }

      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
      }
      refreshTimerRef.current = window.setTimeout(() => {
        systemStatusController.refresh()
        refreshTimerRef.current = null
      }, DIAGNOSTIC_REFRESH_AFTER_ACTION_MS)
    } catch (error) {
      setDiagnosticActionError(error instanceof Error ? error.message : 'Не удалось выполнить действие.')
    } finally {
      setPendingRecoveryCommand(null)
    }
  }, [
    armedDiagnosticId,
    clearDiagnosticConfirmation,
    commandClient,
    diagnostic,
    pendingRecoveryCommand,
    systemStatusController,
  ])

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

  if (diagnostic !== null) {
    return (
      <DashboardDiagnosticView
        diagnostic={diagnostic}
        statusDock={chrome.statusDock}
        isActionPending={
          pendingRecoveryCommand !== null ||
          (diagnostic.action.kind === 'refresh' && systemStatusController.isRefreshing)
        }
        isActionArmed={armedDiagnosticId === diagnostic.id}
        actionError={diagnosticActionError}
        onAction={() => void handleDiagnosticAction()}
      />
    )
  }

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
