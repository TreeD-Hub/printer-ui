import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createHostNetworkClient } from '#runtime'
import { AppScreenContent } from './app/AppScreenContent'
import {
  getTreeDCommandBlockReason,
  getTreeDCommandCatalogItem,
  usePrinterCommands,
  type ExecuteCommandArgs,
  type PrinterCommandId,
} from './core/commands'
import { usePrinterSnapshot } from './core/store/usePrinterSnapshot'
import type { DashboardContainerProps } from './dashboard/DashboardContainer'
import { DashboardStatusDock } from './dashboard/DashboardStatusDock'
import {
  BABYSTEP_STEP_OPTIONS,
  type ScreenId,
} from './dashboard/config'
import { useDashboardIdleController, type DashboardIdleControlGroupId } from './dashboard/useDashboardIdleController'
import { usePrinterDisplayStatus } from './dashboard/usePrinterDisplayStatus'
import {
  type ControlGroupId,
  type MoveStepKey,
  type MovementMode,
  type ParkingMode,
} from './control'
import {
  SettingsVirtualKeyboard,
  type VirtualKeyboardLanguage,
  type AxisId,
} from './ui'
import { PrintFileModal } from './files'
import {
  isSettingsKeyboardTarget,
  useSettingsController,
  type SettingsKeyboardTarget,
} from './settings'
import { TopStatusPopups, useTopStatusController } from './shell'
import {
  PrintTuneModal,
  usePrintTuneController,
  type PrintTuneGroupId,
} from './printTune'
import { usePrintSessionController } from './printSession'
import { useHeatingFanController } from './heating'
import { useMaintenanceController } from './maintenance'
import type { PrinterConnectionState } from './core/transport/types'
import treeDLogoAsset from './assets/logo_treeD-28.svg'
import './App.css'

const DEFAULT_SCREEN: ScreenId = 'dashboard'
const PRINT_CANCEL_MODAL_TITLE_ID = 'print-cancel-modal-title'
type KeyboardTarget = 'idleNotes' | SettingsKeyboardTarget
const CONNECTION_LABELS: Record<PrinterConnectionState, string> = {
  connecting: 'Подключение',
  online: 'Подключено',
  degraded: 'Ограничено',
  reconnecting: 'Переподключение',
  offline: 'Офлайн',
  shutdown: 'Klipper остановлен',
}

function App() {
  const { snapshot, refresh, deletePrintFile } = usePrinterSnapshot()
  const screenShellRef = useRef<HTMLElement | null>(null)
  const [babystepStep, setBabystepStep] = useState<number>(BABYSTEP_STEP_OPTIONS[1])
  const [activeScreen, setActiveScreen] = useState<ScreenId>(DEFAULT_SCREEN)
  const printSessionController = usePrintSessionController({ snapshot, deletePrintFile })
  const commandRuntimeContext = useMemo(
    () => ({
      source: snapshot.source,
      capabilities: snapshot.capabilities,
      connection: snapshot.connection,
      printJob: printSessionController.commandRuntimePrintJob,
      homedAxes: snapshot.homedAxes,
      toolhead: {
        rawX: snapshot.toolhead.rawX,
        rawY: snapshot.toolhead.rawY,
        rawZ: snapshot.toolhead.rawZ,
      },
      eddyStatus: snapshot.v2.eddy.status,
      extruderTemp: snapshot.extruderTemp,
      limits: snapshot.limits,
      thermalTargets: snapshot.thermalTargets,
      modelFanPercent: snapshot.modelFanPercent,
    }),
    [
      printSessionController.commandRuntimePrintJob,
      snapshot.source,
      snapshot.capabilities,
      snapshot.connection,
      snapshot.extruderTemp,
      snapshot.homedAxes,
      snapshot.limits,
      snapshot.modelFanPercent,
      snapshot.thermalTargets,
      snapshot.toolhead.rawX,
      snapshot.toolhead.rawY,
      snapshot.toolhead.rawZ,
      snapshot.v2.eddy.status,
    ],
  )
  const {
    pendingCommand,
    error: commandError,
    executeCommand,
    getLastCommandError,
  } = usePrinterCommands(commandRuntimeContext)
  const getCommandBlockReason = useCallback(
    (command: PrinterCommandId, args?: ExecuteCommandArgs) => getTreeDCommandBlockReason(
      command,
      commandRuntimeContext,
      args,
    ),
    [commandRuntimeContext],
  )
  const requiresCommandConfirmation = useCallback(
    (command: PrinterCommandId) => getTreeDCommandCatalogItem(command).requiresConfirmation,
    [],
  )
  const handlePrintSpeedFactorChange = useCallback((percent: number): void => {
    void executeCommand({ command: 'setPrintSpeedFactorPercent', percent })
  }, [executeCommand])
  const handlePrintFlowFactorChange = useCallback((percent: number): void => {
    void executeCommand({ command: 'setPrintFlowFactorPercent', percent })
  }, [executeCommand])
  const handlePrintAccelChange = useCallback((accelMmS2: number): void => {
    void executeCommand({ command: 'setPrintAccel', accelMmS2 })
  }, [executeCommand])
  const handlePressureAdvanceChange = useCallback((advance: number): void => {
    void executeCommand({ command: 'setPressureAdvance', advance })
  }, [executeCommand])
  const handleRetractionLengthChange = useCallback((retractLengthMm: number): void => {
    void executeCommand({ command: 'setRetractionLength', retractLengthMm })
  }, [executeCommand])
  const [activeKeyboardTarget, setActiveKeyboardTarget] = useState<KeyboardTarget | null>(null)
  const [keyboardLanguage, setKeyboardLanguage] = useState<VirtualKeyboardLanguage>('ru')
  const [isKeyboardCapsEnabled, setIsKeyboardCapsEnabled] = useState<boolean>(false)
  const [, setParkingMode] = useState<ParkingMode>('all')
  const [parkingAxis, setParkingAxis] = useState<AxisId>('X')
  const [movementMode, setMovementMode] = useState<MovementMode>('buttons')
  const [moveStepKey, setMoveStepKey] = useState<MoveStepKey>('1')
  const [activeControlGroup, setActiveControlGroup] = useState<ControlGroupId>('movement')
  const [isControlMenuCompact, setIsControlMenuCompact] = useState<boolean>(false)
  const [activeControlFlashKey, setActiveControlFlashKey] = useState<string | null>(null)
  const [isMainLightEnabled, setIsMainLightEnabled] = useState<boolean>(false)
  const [isToolheadLightEnabled, setIsToolheadLightEnabled] = useState<boolean>(false)
  const maintenanceController = useMaintenanceController()
  const controlFlashTimeoutRef = useRef<number | null>(null)

  const {
    files: effectiveFilesLibrary,
    selectedPrintFile,
    displayPrintFileName,
    hasActivePrint,
    isPrintPaused,
    printPauseCommand,
    printFill,
    displayLayerCurrent,
    displayLayerTotal,
    isPrintCancelConfirmOpen,
    selectFile: handlePrintFileSelect,
    closeFileModal,
    deleteSelectedFile: handleDeleteSelectedFile,
    closePrintCancelConfirm,
    getFileStartNotice,
    createCommandHandlers: createPrintSessionCommandHandlers,
  } = printSessionController
  const isBusy = pendingCommand !== null
  const {
    activeGroup: activePrintTuneGroup,
    openGroup: openPrintTuneGroup,
    closeGroup: closePrintTuneGroup,
    closeKeyboard: closePrintTuneKeyboard,
    keyboard: printTuneKeyboard,
    createQuickMetrics,
    processMetrics,
    adjustedEtaTime,
    createModalValues,
    createModalHandlers,
  } = usePrintTuneController({
    hasActivePrint,
    runtimeTune: snapshot.runtimeTune,
    onPrintSpeedFactorPercentChange: handlePrintSpeedFactorChange,
    onPrintFlowFactorPercentChange: handlePrintFlowFactorChange,
    onPrintAccelChange: handlePrintAccelChange,
    onPressureAdvanceChange: handlePressureAdvanceChange,
    onRetractionLengthChange: handleRetractionLengthChange,
  })
  const heatingController = useHeatingFanController({
    snapshot,
    isBusy,
    executeCommand,
    getCommandBlockReason,
    closePrintTuneKeyboard,
  })
  const {
    printFanPercent,
    dashboardTemperatureTargets,
    heatingProps,
    fanProps,
    printTuneTemperatureProps,
    setTemperatureChartMode,
    closeTemperatureKeyboard,
    handleFanPercentChange,
  } = heatingController
  const isFilesScreenActive = activeScreen === 'files'
  const formattedSnapshotTime = useMemo(() => {
    const parsed = new Date(snapshot.updatedAt)
    if (Number.isNaN(parsed.getTime())) {
      return '—'
    }
    return parsed.toLocaleTimeString('ru-RU')
  }, [snapshot.updatedAt])
  const isRuntimeCurrent = snapshot.connection === 'online' || snapshot.connection === 'degraded'
  const connectionLabel = CONNECTION_LABELS[snapshot.connection]
  const snapshotWifiSsidLabel = isRuntimeCurrent ? snapshot.wifiSsid : 'Не подключено'
  const snapshotWifiIpLabel = isRuntimeCurrent ? snapshot.ipAddress : '—'
  const isCloudCapabilityAvailable = snapshot.capabilities.cloud
  const hostNetworkClient = useMemo(() => createHostNetworkClient(), [])
  const settingsController = useSettingsController({
    snapshot,
    connectionLabel,
    networkClient: hostNetworkClient,
    executeCommand,
    getCommandBlockReason,
    activeKeyboardTarget: isSettingsKeyboardTarget(activeKeyboardTarget) ? activeKeyboardTarget : null,
    openKeyboard: (target) => setActiveKeyboardTarget(target),
    closeKeyboard: () => setActiveKeyboardTarget(null),
  })
  const settingsPageProps = settingsController.pageProps
  const wifiSsidLabel = settingsPageProps.network.currentSsid ?? snapshotWifiSsidLabel
  const wifiIpLabel = settingsPageProps.network.wifiIpLabel !== '—'
    ? settingsPageProps.network.wifiIpLabel
    : snapshotWifiIpLabel
  const settingsKeyboard = settingsController.keyboard
  const isSettingsKeyboardTargetAllowed = settingsController.isKeyboardTargetAllowed
  const setActiveSettingsGroup = settingsPageProps.onSettingsGroupChange
  const handleKeyboardClose = useCallback(() => {
    setActiveKeyboardTarget(null)
  }, [])
  const cloudStatusLabel = isCloudCapabilityAvailable && snapshot.connection === 'online' ? 'В сети' : 'Недоступно'
  const cloudCapabilityNotice = settingsPageProps.cloud.notice
  const isMaxPerformanceModeEnabled = settingsPageProps.interfaceSettings.isMaxPerformanceModeEnabled
  const printerDisplayStatus = usePrinterDisplayStatus()
  const currentPrinterNotification = printerDisplayStatus.notification
  const currentPrinterNotificationId = currentPrinterNotification?.id ?? null
  const topStatusController = useTopStatusController({
    screenShellRef,
    activeScreen,
    currentPrinterNotificationId,
    isBusy,
    executeCommand,
    getCommandBlockReason,
    requiresCommandConfirmation,
    refresh,
  })
  const hasUnreadPrinterNotification = topStatusController.hasUnreadPrinterNotification
  const closeTopPopup = topStatusController.closeTopPopup
  const openTopPopup = topStatusController.openTopPopup
  const setTopButtonRef = topStatusController.setTopButtonRef
  const handleDashboardIdleControlGroupOpen = useCallback((groupId: DashboardIdleControlGroupId): void => {
    setActiveControlGroup(groupId)
    setActiveScreen('control')
    closeTopPopup()
  }, [closeTopPopup])
  const dashboardIdleController = useDashboardIdleController({
    isKeyboardOpen: activeKeyboardTarget === 'idleNotes',
    onKeyboardOpen: () => setActiveKeyboardTarget('idleNotes'),
    onKeyboardClose: handleKeyboardClose,
    onControlGroupOpen: handleDashboardIdleControlGroupOpen,
  })
  const printCancelBlockReason = getCommandBlockReason('cancel')
  const printStartBlockReason = getCommandBlockReason('start')
  const fileStartNotice = getFileStartNotice(printStartBlockReason)
  const printSessionCommandHandlers = createPrintSessionCommandHandlers({
    executeCommand,
    getLastCommandError,
    commandError,
    printStartBlockReason,
    printCancelBlockReason,
    requiresCommandConfirmation,
    refresh,
    onOpenDashboard: () => setActiveScreen('dashboard'),
  })
  const idleHeroStatusLabel = printerDisplayStatus.label
  const isIdleNotesKeyboardTarget = activeKeyboardTarget === 'idleNotes'
  const settingsKeyboardMeta = settingsKeyboard.meta
  const keyboardLabel = isIdleNotesKeyboardTarget ? 'Ввод заметки' : (settingsKeyboardMeta?.valueLabel ?? '')
  const keyboardPlaceholder = isIdleNotesKeyboardTarget ? 'Введите заметку...' : (settingsKeyboardMeta?.placeholder ?? '')
  const keyboardTestId = isIdleNotesKeyboardTarget ? 'idle-notes-keyboard' : (settingsKeyboardMeta?.testId ?? '')
  const keyboardPreviewTestId = isIdleNotesKeyboardTarget
    ? 'idle-notes-keyboard-preview'
    : (settingsKeyboardMeta?.previewTestId ?? '')
  const keyboardDialogValue = isIdleNotesKeyboardTarget ? dashboardIdleController.idleNotesText : settingsKeyboard.value
  const keyboardDialogLabel = keyboardLabel
  const keyboardDialogPlaceholder = keyboardPlaceholder
  const keyboardDialogTestId = keyboardTestId
  const keyboardDialogPreviewTestId = keyboardPreviewTestId

  useEffect(() => {
    return () => {
      if (controlFlashTimeoutRef.current !== null) {
        window.clearTimeout(controlFlashTimeoutRef.current)
      }
    }
  }, [])

  const printTuneModalValues = createModalValues({
    fanPercent: printFanPercent,
  })
  const printTuneModalHandlers = createModalHandlers({
    onFanPercentChange: handleFanPercentChange,
  })
  const openWifiSettings = useCallback(() => {
    setActiveSettingsGroup('network')
    setActiveScreen('settings')
    closeTopPopup()
  }, [closeTopPopup, setActiveSettingsGroup])
  const handleBabystepAdjust = useCallback((deltaMm: number): void => {
    void executeCommand({ command: 'adjustZOffset', deltaMm })
  }, [executeCommand])

  function handleScreenSelect(nextScreen: ScreenId): void {
    if (nextScreen !== 'dashboard') {
      closeTopPopup()
    }

    setActiveScreen(nextScreen)
  }

  function handleControlMenuCompactToggle(): void {
    setIsControlMenuCompact((currentState) => !currentState)
  }

  function handleVirtualKeyboardKeyMouseDown(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault()
  }

  async function handleParkingTargetSelect(nextMode: ParkingMode, nextAxis?: AxisId): Promise<boolean> {
    const resolvedAxis = nextMode === 'axis' ? (nextAxis ?? parkingAxis) : parkingAxis

    setParkingMode(nextMode)
    if (nextMode === 'axis') {
      setParkingAxis(resolvedAxis)
    }

    const command = nextMode === 'all'
      ? 'homeAll'
      : resolvedAxis === 'X'
        ? 'homeX'
        : resolvedAxis === 'Y'
          ? 'homeY'
          : 'homeZ'
    const ok = await executeCommand({ command })
    if (!ok) {
      return false
    }

    await refresh()
    flashControlAction(nextMode === 'all' ? 'parking-all' : `parking-${resolvedAxis}`)
    return true
  }

  function handleServiceModeToggle(): void {
    flashControlAction('service-mode')
  }

  function handleAxisMove(axis: AxisId, distanceMm: number): Promise<boolean> {
    return executeCommand({ command: 'moveAxis', axis, distanceMm })
  }

  function handleFilamentMove(direction: -1 | 1, distanceMm: number): Promise<boolean> {
    return executeCommand({
      command: direction > 0 ? 'unloadFilament' : 'loadFilament',
      lengthMm: distanceMm,
    })
  }

  function flashControlAction(nextKey: string): void {
    setActiveControlFlashKey(nextKey)

    if (controlFlashTimeoutRef.current !== null) {
      window.clearTimeout(controlFlashTimeoutRef.current)
    }

    controlFlashTimeoutRef.current = window.setTimeout(() => {
      setActiveControlFlashKey((currentKey) => (currentKey === nextKey ? null : currentKey))
      controlFlashTimeoutRef.current = null
    }, 1000)
  }

  function handleMotorsDisable(): Promise<boolean> {
    return executeCommand({ command: 'disableMotors' })
  }

  const handleVirtualKeyboardLanguageToggle = useCallback(() => {
    setKeyboardLanguage((prevValue) => (prevValue === 'ru' ? 'en' : 'ru'))
  }, [])

  const handleVirtualKeyboardCapsToggle = useCallback(() => {
    setIsKeyboardCapsEnabled((prevValue) => !prevValue)
  }, [])

  const handleVirtualKeyboardPreviewChange = useCallback((
    nextValue: string,
    selection: { selectionStart: number; selectionEnd: number },
  ) => {
    if (activeKeyboardTarget === 'idleNotes') {
      dashboardIdleController.handleIdleNotesKeyboardPreviewChange(nextValue)
      return
    }

    if (activeKeyboardTarget === null || !isSettingsKeyboardTarget(activeKeyboardTarget)) {
      return
    }

    settingsKeyboard.onPreviewChange(nextValue, selection)
  }, [activeKeyboardTarget, dashboardIdleController, settingsKeyboard])

  const handleVirtualKeyboardKey = useCallback((
    key: string,
    selection?: { selectionStart: number; selectionEnd: number },
  ) => {
    if (activeKeyboardTarget === 'idleNotes') {
      dashboardIdleController.handleIdleNotesVirtualKey(key, selection)
      return
    }

    if (activeKeyboardTarget === null || !isSettingsKeyboardTarget(activeKeyboardTarget)) {
      return
    }

    settingsKeyboard.onKeyPress(key, selection)
  }, [activeKeyboardTarget, dashboardIdleController, settingsKeyboard])

  useEffect(() => {
    if (selectedPrintFile === null || typeof window === 'undefined') {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFileModal()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [closeFileModal, selectedPrintFile])

  useEffect(() => {
    if (!isPrintCancelConfirmOpen || typeof window === 'undefined') {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePrintCancelConfirm()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [closePrintCancelConfirm, isPrintCancelConfirmOpen])

  useEffect(() => {
    if (activeKeyboardTarget === null || typeof window === 'undefined') {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleKeyboardClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [activeKeyboardTarget, handleKeyboardClose])

  useEffect(() => {
    if (activeKeyboardTarget === null) {
      return
    }

    if (activeKeyboardTarget === 'idleNotes') {
      if (activeScreen !== 'dashboard' || hasActivePrint) {
        setActiveKeyboardTarget(null)
      }
      return
    }

    if (activeScreen !== 'settings') {
      setActiveKeyboardTarget(null)
      return
    }

    if (isSettingsKeyboardTarget(activeKeyboardTarget) && !isSettingsKeyboardTargetAllowed(activeKeyboardTarget)) {
      setActiveKeyboardTarget(null)
    }
  }, [activeKeyboardTarget, activeScreen, hasActivePrint, isSettingsKeyboardTargetAllowed])

  useEffect(() => {
    if (activeKeyboardTarget === null) {
      setIsKeyboardCapsEnabled(false)
      return
    }

    setIsKeyboardCapsEnabled(false)
    setKeyboardLanguage(activeKeyboardTarget === 'idleNotes' ? 'ru' : 'en')
  }, [activeKeyboardTarget])

  useEffect(() => {
    if (activeScreen !== 'files' && selectedPrintFile !== null) {
      closeFileModal()
    }
  }, [activeScreen, closeFileModal, selectedPrintFile])

  const handlePrintTuneGroupOpen = useCallback((groupId: PrintTuneGroupId): void => {
    if (groupId === 'nozzle') {
      setTemperatureChartMode('nozzle')
    } else if (groupId === 'bed') {
      setTemperatureChartMode('bed')
    } else {
      setTemperatureChartMode('both')
      closeTemperatureKeyboard()
    }

    openPrintTuneGroup(groupId)
  }, [closeTemperatureKeyboard, openPrintTuneGroup, setTemperatureChartMode])

  const handlePrintTuneGroupClose = useCallback((): void => {
    closePrintTuneGroup()
    setTemperatureChartMode('both')
    closeTemperatureKeyboard()
  }, [closePrintTuneGroup, closeTemperatureKeyboard, setTemperatureChartMode])

  const handlePrintTuneApply = handlePrintTuneGroupClose

  const dashboardStatusDock = (
    <DashboardStatusDock
      activeTopPopup={topStatusController.activeTopPopup}
      hasUnreadPrinterNotification={hasUnreadPrinterNotification}
      onOpenTopPopup={openTopPopup}
      onButtonRef={setTopButtonRef}
    />
  )
  const dashboardProps: DashboardContainerProps = {
    chrome: {
      statusDock: dashboardStatusDock,
      logoSrc: treeDLogoAsset,
    },
    print: {
      hasActivePrint,
      displayPrintFileName,
      printFill,
      adjustedEtaTime,
      displayLayerCurrent,
      displayLayerTotal,
      isPrintPaused,
      printPauseCommand,
      pendingCommand,
      isBusy,
      printCancelBlockReason,
    },
    tune: {
      temperatureTargets: dashboardTemperatureTargets,
      printFanPercent,
      createQuickMetrics,
      processMetrics,
      babystepStep,
      zOffsetMm: snapshot.runtimeTune.appliedBabystepMm,
    },
    idle: {
      idleHeroStatusLabel,
      idleWidgetOrder: dashboardIdleController.idleWidgetOrder,
      armedIdleWidgetId: dashboardIdleController.armedIdleWidgetId,
      draggingIdleWidgetId: dashboardIdleController.draggingIdleWidgetId,
      idleWidgetRefs: dashboardIdleController.idleWidgetRefs,
      maintenanceSummary: maintenanceController.status,
      idleNotesInputRef: dashboardIdleController.idleNotesInputRef,
      idleNotesText: dashboardIdleController.idleNotesText,
    },
    actions: {
      onPrintTuneGroupOpen: handlePrintTuneGroupOpen,
      onPause: () => void printSessionCommandHandlers.togglePause(),
      onStopRequest: () => void printSessionCommandHandlers.requestStop(),
      onBabystepStepChange: setBabystepStep,
      onBabystepAdjust: handleBabystepAdjust,
      onIdleWidgetTargetOpen: dashboardIdleController.openIdleWidgetTarget,
      onIdleWidgetDragPointerDown: dashboardIdleController.handleIdleWidgetDragPointerDown,
      onIdleWidgetDragPointerMove: dashboardIdleController.handleIdleWidgetDragPointerMove,
      onIdleWidgetDragPointerEnd: dashboardIdleController.handleIdleWidgetDragPointerEnd,
      onIdleWidgetDragHandleClick: dashboardIdleController.handleIdleWidgetDragHandleClick,
      onIdleNotesKeyboardOpen: dashboardIdleController.handleIdleNotesKeyboardOpen,
      onIdleNotesChange: dashboardIdleController.handleIdleNotesChange,
    },
    getCommandBlockReason,
  }

  return (
    <main className={`app-root ${isMaxPerformanceModeEnabled ? 'is-performance-mode' : ''}`}>
      <section className="screen-shell" data-testid="screen-shell" ref={screenShellRef}>
        <AppScreenContent
          activeScreen={activeScreen}
          isFilesScreenActive={isFilesScreenActive}
          onScreenSelect={handleScreenSelect}
          dashboard={dashboardProps}
          files={{
            files: effectiveFilesLibrary,
            fileListStatus: snapshot.fileList,
            onFileSelect: handlePrintFileSelect,
          }}
          control={{
            activeControlGroup,
            isControlMenuCompact,
            pendingCommand,
            isBusy,
            activeControlFlashKey,
            movementMode,
            moveStepKey,
            getCommandBlockReason,
            onControlGroupChange: setActiveControlGroup,
            onControlMenuCompactToggle: handleControlMenuCompactToggle,
            onParkingTargetSelect: handleParkingTargetSelect,
            onServiceModeToggle: handleServiceModeToggle,
            onMotorsDisable: handleMotorsDisable,
            onMovementModeChange: setMovementMode,
            onMoveStepChange: setMoveStepKey,
            onAxisMove: handleAxisMove,
            onFilamentMove: handleFilamentMove,
            getLastCommandError,
            heating: heatingProps,
            fan: fanProps,
            isMainLightEnabled,
            isToolheadLightEnabled,
            onMainLightEnabledChange: setIsMainLightEnabled,
            onToolheadLightEnabledChange: setIsToolheadLightEnabled,
            maintenanceStatus: maintenanceController.status,
            maintenanceHistoryItems: maintenanceController.historyItems,
            maintenanceChecklistItems: maintenanceController.checklistItems,
            maintenanceProgressTicks: maintenanceController.progressTicks,
            maintenanceChecklistState: maintenanceController.checklistState,
            onMaintenanceChecklistItemChange: maintenanceController.handleChecklistItemChange,
            onMaintenanceChecklistComplete: maintenanceController.handleChecklistComplete,
          }}
          settings={settingsPageProps}
        />

        {activeKeyboardTarget !== null ? (
          <div
            className="app-virtual-keyboard-layer"
            role="presentation"
            onClick={handleKeyboardClose}
            data-testid={isIdleNotesKeyboardTarget ? 'idle-notes-keyboard-layer' : 'settings-keyboard-layer'}
          >
            <div
              className="app-virtual-keyboard-popup"
              role="dialog"
              aria-modal="true"
              aria-label={keyboardLabel}
              onClick={(event) => event.stopPropagation()}
            >
              <SettingsVirtualKeyboard
                valueLabel={keyboardDialogLabel}
                value={keyboardDialogValue}
                placeholder={keyboardDialogPlaceholder}
                language={keyboardLanguage}
                isCapsEnabled={isKeyboardCapsEnabled}
                onToggleLanguage={handleVirtualKeyboardLanguageToggle}
                onToggleCaps={handleVirtualKeyboardCapsToggle}
                onKeyPress={handleVirtualKeyboardKey}
                onPreviewChange={handleVirtualKeyboardPreviewChange}
                onClose={handleKeyboardClose}
                onKeyMouseDown={handleVirtualKeyboardKeyMouseDown}
                showEnterKey={isIdleNotesKeyboardTarget || settingsKeyboard.isConsoleOpen}
                testId={keyboardDialogTestId}
                previewTestId={keyboardDialogPreviewTestId}
              />
            </div>
          </div>
        ) : null}

        <PrintTuneModal
          activeGroup={activePrintTuneGroup}
          onClose={handlePrintTuneGroupClose}
          onApply={handlePrintTuneApply}
          temperature={printTuneTemperatureProps}
          values={printTuneModalValues}
          handlers={printTuneModalHandlers}
          keyboard={printTuneKeyboard}
        />

        {selectedPrintFile !== null ? (
          <PrintFileModal
            file={selectedPrintFile}
            notice={fileStartNotice}
            isBusy={isBusy}
            pendingCommand={pendingCommand}
            isStartBlocked={printStartBlockReason !== null}
            onClose={closeFileModal}
            onStart={() => void printSessionCommandHandlers.startSelectedFile()}
            onDelete={handleDeleteSelectedFile}
          />
        ) : null}

        {isPrintCancelConfirmOpen ? (
          <div className="print-cancel-modal-layer" role="presentation" onClick={closePrintCancelConfirm}>
            <section
              className="print-cancel-modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={PRINT_CANCEL_MODAL_TITLE_ID}
              data-testid="print-cancel-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="print-cancel-modal-head">
                <h2 id={PRINT_CANCEL_MODAL_TITLE_ID}>Подтвердите отмену печати</h2>
                <button
                  type="button"
                  className="print-cancel-modal-close"
                  aria-label="Закрыть окно подтверждения отмены печати"
                  onClick={closePrintCancelConfirm}
                  disabled={isBusy}
                >
                  ×
                </button>
              </header>

              <p className="print-cancel-modal-body">
                Текущая задача будет остановлена. Вы уверены, что хотите отменить печать?
              </p>

              <div className="print-cancel-modal-actions">
                <button
                  type="button"
                  className="file-modal-action"
                  data-testid="print-cancel-close-button"
                  onClick={closePrintCancelConfirm}
                  disabled={isBusy}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="file-modal-action file-modal-action-danger"
                  data-testid="print-cancel-confirm-button"
                  onClick={() => void printSessionCommandHandlers.confirmStop()}
                  disabled={isBusy}
                >
                  {pendingCommand === 'cancel' ? 'Остановка...' : 'Остановить печать'}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        <TopStatusPopups
          activeTopPopup={topStatusController.activeTopPopup}
          topPopupPosition={topStatusController.topPopupPosition}
          connectionLabel={connectionLabel}
          wifiSsidLabel={wifiSsidLabel}
          wifiIpLabel={wifiIpLabel}
          formattedSnapshotTime={formattedSnapshotTime}
          cloudStatusLabel={cloudStatusLabel}
          isCloudCapabilityAvailable={isCloudCapabilityAvailable}
          cloudCapabilityNotice={cloudCapabilityNotice}
          commandError={commandError}
          currentPrinterNotification={currentPrinterNotification}
          powerMenuActions={topStatusController.powerMenuActions}
          powerPopupNotice={topStatusController.powerPopupNotice}
          armedPowerCommand={topStatusController.armedPowerCommand}
          isBusy={isBusy}
          onClose={closeTopPopup}
          onOpenWifiSettings={openWifiSettings}
          onPowerMenuAction={topStatusController.onPowerMenuAction}
        />
      </section>
    </main>
  )
}

export default App
