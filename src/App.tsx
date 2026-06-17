import { type ChangeEvent, type CSSProperties, type MouseEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createHostNetworkClient } from '#runtime'
import {
  getTreeDCommandBlockReason,
  getTreeDCommandCatalogItem,
  usePrinterCommands,
  type ExecuteCommandArgs,
  type PrinterCommandId,
} from './core/commands'
import { usePrinterSnapshot } from './core/store/usePrinterSnapshot'
import { DashboardPage, type DashboardIdleWidgetId } from './dashboard/DashboardPage'
import { DashboardStatusDock } from './dashboard/DashboardStatusDock'
import {
  BABYSTEP_STEP_OPTIONS,
  BOTTOM_NAV_ITEMS,
  type ScreenId,
} from './dashboard/config'
import { usePrinterDisplayStatus } from './dashboard/usePrinterDisplayStatus'
import { clampPercent } from './dashboard/helpers'
import {
  ControlPage,
  type ControlGroupId,
  type MovementCommandBlockReasons,
  type MoveStepKey,
  type MovementMode,
  type ParkingMode,
} from './control'
import {
  NavItemButton,
  SettingsVirtualKeyboard,
  type VirtualKeyboardLanguage,
  type AxisId,
} from './ui'
import { FilesPage, PrintFileModal } from './files'
import {
  isSettingsKeyboardTarget,
  SettingsPage,
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
import type { PrinterConnectionState } from './core/transport/types'
import treeDLogoAsset from './assets/logo_treeD-28.svg'
import './App.css'

const DEFAULT_SCREEN: ScreenId = 'dashboard'
const IDLE_WIDGET_DRAG_HOLD_MS = 3000
const PRINT_CANCEL_MODAL_TITLE_ID = 'print-cancel-modal-title'
type IdleWidgetId = DashboardIdleWidgetId
type KeyboardTarget = 'idleNotes' | SettingsKeyboardTarget
const CONNECTION_LABELS: Record<PrinterConnectionState, string> = {
  connecting: 'Подключение',
  online: 'Подключено',
  degraded: 'Ограничено',
  reconnecting: 'Переподключение',
  offline: 'Офлайн',
  shutdown: 'Klipper остановлен',
}
const HEAD_Z_BOUNDS_MM = { min: 0, max: 200 } as const
const MAINTENANCE_STATUS = {
  runtimeHours: 874,
  hoursLeft: 126,
  intervalHours: 1000,
} as const
const MAINTENANCE_HISTORY_ITEMS = [
  { id: '3', date: '03.05.2024', runtimeHours: 748, label: 'Плановое ТО' },
] as const
const MAINTENANCE_CHECKLIST_ITEMS = [
  { id: 'belts', label: 'Проверка натяжения ремней' },
  { id: 'guides', label: 'Очистка направляющих и винтов' },
  { id: 'axes', label: 'Смазка осей и подшипников' },
  { id: 'fans', label: 'Проверка вентиляторов и обдува' },
  { id: 'hotend', label: 'Осмотр сопла и хотэнда' },
  { id: 'calibration', label: 'Калибровка стола (при необходимости)' },
] as const
const MAINTENANCE_PROGRESS_TICKS = Array.from({ length: 31 }, (_, index) => index)
type MaintenanceChecklistItemId = (typeof MAINTENANCE_CHECKLIST_ITEMS)[number]['id']
const IDLE_NOTES_DEFAULT_TEXT = [
  'Экосистема TreeD V2.',
  'Перед запуском проверьте очистку стола и состояние поверхности.',
  'Если модель новая, сделайте короткий тест первого слоя.',
].join('\n')
const IDLE_NOTES_KEYBOARD_ROWS: string[][] = [
  ['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х'],
  ['Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Э'],
  ['Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю'],
]

function createMaintenanceChecklistState(checked: boolean): Record<MaintenanceChecklistItemId, boolean> {
  return MAINTENANCE_CHECKLIST_ITEMS.reduce<Record<MaintenanceChecklistItemId, boolean>>((state, item) => {
    state[item.id] = checked
    return state
  }, {} as Record<MaintenanceChecklistItemId, boolean>)
}

const SCREEN_PLACEHOLDERS: Record<Exclude<ScreenId, 'dashboard' | 'control' | 'files' | 'settings'>, { description: string }> = {
  macros: {
    description: '',
  },
}

function App() {
  const { snapshot, refresh } = usePrinterSnapshot()
  const screenShellRef = useRef<HTMLElement | null>(null)
  const [babystepStep, setBabystepStep] = useState<number>(BABYSTEP_STEP_OPTIONS[1])
  const [activeScreen, setActiveScreen] = useState<ScreenId>(DEFAULT_SCREEN)
  const printSessionController = usePrintSessionController({ snapshot })
  const commandRuntimeContext = useMemo(
    () => ({
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
    }),
    [
      printSessionController.commandRuntimePrintJob,
      snapshot.capabilities,
      snapshot.connection,
      snapshot.extruderTemp,
      snapshot.homedAxes,
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
  const [idleNotesText, setIdleNotesText] = useState<string>(IDLE_NOTES_DEFAULT_TEXT)
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
  const [idleWidgetOrder, setIdleWidgetOrder] = useState<IdleWidgetId[]>(['temperature', 'maintenance'])
  const [armedIdleWidgetId, setArmedIdleWidgetId] = useState<IdleWidgetId | null>(null)
  const [draggingIdleWidgetId, setDraggingIdleWidgetId] = useState<IdleWidgetId | null>(null)
  const [isMainLightEnabled, setIsMainLightEnabled] = useState<boolean>(false)
  const [isToolheadLightEnabled, setIsToolheadLightEnabled] = useState<boolean>(false)
  const [maintenanceChecklistState, setMaintenanceChecklistState] = useState<Record<MaintenanceChecklistItemId, boolean>>(() =>
    createMaintenanceChecklistState(false),
  )
  const idleNotesInputRef = useRef<HTMLTextAreaElement | null>(null)
  const controlFlashTimeoutRef = useRef<number | null>(null)
  const idleWidgetHoldTimeoutRef = useRef<number | null>(null)
  const idleWidgetRefs = useRef<Record<IdleWidgetId, HTMLElement | null>>({
    temperature: null,
    maintenance: null,
  })
  const draggingIdleWidgetIdRef = useRef<IdleWidgetId | null>(null)

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
  const activeNavIndex = Math.max(
    0,
    BOTTOM_NAV_ITEMS.findIndex((item) => item.id === activeScreen),
  )
  const babystepActiveIndex = Math.max(
    0,
    BABYSTEP_STEP_OPTIONS.findIndex((step) => step === babystepStep),
  )
  const maintenanceProgressPercent = clampPercent(MAINTENANCE_STATUS.runtimeHours, MAINTENANCE_STATUS.intervalHours)
  const isMaintenanceChecklistComplete = MAINTENANCE_CHECKLIST_ITEMS.every((item) => maintenanceChecklistState[item.id])
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
  const printPauseBlockReason = getCommandBlockReason(printPauseCommand)
  const printCancelBlockReason = getCommandBlockReason('cancel')
  const printStartBlockReason = getCommandBlockReason('start')
  const babystepBlockReason = getCommandBlockReason('adjustZOffset', {
    command: 'adjustZOffset',
    deltaMm: babystepStep,
  })
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
  const movementCommandBlockReasons = useMemo<MovementCommandBlockReasons>(() => ({
    parking: {
      all: getCommandBlockReason('homeAll'),
      axis: {
        X: getCommandBlockReason('homeXY'),
        Y: getCommandBlockReason('homeXY'),
        Z: getCommandBlockReason('homeZ'),
      },
    },
    moveAxis: {
      X: getCommandBlockReason('moveAxis', { command: 'moveAxis', axis: 'X', distanceMm: 1 }),
      Y: getCommandBlockReason('moveAxis', { command: 'moveAxis', axis: 'Y', distanceMm: 1 }),
      Z: getCommandBlockReason('moveAxis', { command: 'moveAxis', axis: 'Z', distanceMm: 1 }),
    },
    loadFilament: getCommandBlockReason('loadFilament'),
    unloadFilament: getCommandBlockReason('unloadFilament'),
  }), [getCommandBlockReason])
  const idleHeroStatusLabel = printerDisplayStatus.label
  const settingsKeyboardMeta = settingsKeyboard.meta
  const keyboardLabel = activeKeyboardTarget === 'idleNotes' ? 'Ввод заметок' : (settingsKeyboardMeta?.valueLabel ?? '')
  const keyboardPlaceholder = activeKeyboardTarget === 'idleNotes' ? 'Введите заметку...' : (settingsKeyboardMeta?.placeholder ?? '')
  const keyboardTestId = activeKeyboardTarget === 'idleNotes' ? 'idle-notes-keyboard' : (settingsKeyboardMeta?.testId ?? '')
  const keyboardPreviewTestId = activeKeyboardTarget === 'idleNotes'
    ? 'idle-notes-keyboard-preview'
    : (settingsKeyboardMeta?.previewTestId ?? '')
  const keyboardDialogValue = activeKeyboardTarget === 'idleNotes' ? idleNotesText : settingsKeyboard.value
  const keyboardDialogLabel = keyboardLabel
  const keyboardDialogPlaceholder = keyboardPlaceholder
  const keyboardDialogTestId = keyboardTestId
  const keyboardDialogPreviewTestId = keyboardPreviewTestId

  useEffect(() => {
    return () => {
      if (controlFlashTimeoutRef.current !== null) {
        window.clearTimeout(controlFlashTimeoutRef.current)
      }

      if (idleWidgetHoldTimeoutRef.current !== null) {
        window.clearTimeout(idleWidgetHoldTimeoutRef.current)
      }
    }
  }, [])

  const quickMetrics = createQuickMetrics(printFanPercent)
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

  function clearIdleWidgetHoldTimeout(): void {
    if (idleWidgetHoldTimeoutRef.current === null) {
      return
    }

    window.clearTimeout(idleWidgetHoldTimeoutRef.current)
    idleWidgetHoldTimeoutRef.current = null
  }

  function openIdleWidgetTarget(widgetId: IdleWidgetId): void {
    setActiveControlGroup(widgetId === 'temperature' ? 'heating' : 'maintenance')
    setActiveScreen('control')
    closeTopPopup()
  }

  function moveIdleWidgetByPointer(widgetId: IdleWidgetId, pointerX: number): void {
    const temperatureRect = idleWidgetRefs.current.temperature?.getBoundingClientRect()
    const maintenanceRect = idleWidgetRefs.current.maintenance?.getBoundingClientRect()

    if (temperatureRect === undefined || maintenanceRect === undefined) {
      return
    }

    const leftEdge = Math.min(temperatureRect.left, maintenanceRect.left)
    const rightEdge = Math.max(temperatureRect.right, maintenanceRect.right)
    const targetIndex = pointerX < leftEdge + ((rightEdge - leftEdge) / 2) ? 0 : 1

    setIdleWidgetOrder((currentOrder) => {
      const currentIndex = currentOrder.indexOf(widgetId)

      if (currentIndex === targetIndex) {
        return currentOrder
      }

      const otherWidgetId = currentOrder.find((currentWidgetId) => currentWidgetId !== widgetId)
      if (otherWidgetId === undefined) {
        return currentOrder
      }

      return targetIndex === 0 ? [widgetId, otherWidgetId] : [otherWidgetId, widgetId]
    })
  }

  function handleIdleWidgetDragPointerDown(event: PointerEvent<HTMLButtonElement>, widgetId: IdleWidgetId): void {
    event.preventDefault()
    event.stopPropagation()

    clearIdleWidgetHoldTimeout()
    setArmedIdleWidgetId(widgetId)
    event.currentTarget.setPointerCapture(event.pointerId)

    idleWidgetHoldTimeoutRef.current = window.setTimeout(() => {
      draggingIdleWidgetIdRef.current = widgetId
      setArmedIdleWidgetId(null)
      setDraggingIdleWidgetId(widgetId)
      idleWidgetHoldTimeoutRef.current = null
    }, IDLE_WIDGET_DRAG_HOLD_MS)
  }

  function handleIdleWidgetDragPointerMove(event: PointerEvent<HTMLButtonElement>, widgetId: IdleWidgetId): void {
    event.preventDefault()
    event.stopPropagation()

    if (draggingIdleWidgetIdRef.current !== widgetId) {
      return
    }

    moveIdleWidgetByPointer(widgetId, event.clientX)
  }

  function handleIdleWidgetDragPointerEnd(event: PointerEvent<HTMLButtonElement>): void {
    event.preventDefault()
    event.stopPropagation()

    clearIdleWidgetHoldTimeout()
    setArmedIdleWidgetId(null)
    setDraggingIdleWidgetId(null)
    draggingIdleWidgetIdRef.current = null

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleIdleWidgetDragHandleClick(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault()
    event.stopPropagation()
  }

  function handleScreenSelect(nextScreen: ScreenId): void {
    if (nextScreen !== 'dashboard') {
      closeTopPopup()
    }

    setActiveScreen(nextScreen)
  }

  function handleMoveStepChange(nextStep: MoveStepKey): void {
    setMoveStepKey(nextStep)
  }

  function handleMovementModeChange(nextMode: MovementMode): void {
    setMovementMode(nextMode)
  }

  function handleControlMenuCompactToggle(): void {
    setIsControlMenuCompact((currentState) => !currentState)
  }

  const setIdleNotesKeyboardCaret = useCallback((nextCaret: number) => {
    if (typeof window === 'undefined') {
      return
    }

    window.requestAnimationFrame(() => {
      const input = idleNotesInputRef.current
      if (input === null) {
        return
      }
      input.focus()
      input.setSelectionRange(nextCaret, nextCaret)
    })
  }, [])

  const handleIdleNotesChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setIdleNotesText(event.target.value)
  }, [])

  const handleIdleNotesKeyboardOpen = useCallback(() => {
    setActiveKeyboardTarget('idleNotes')
  }, [])

  const handleKeyboardClose = useCallback(() => {
    setActiveKeyboardTarget(null)
  }, [])

  function handleVirtualKeyboardKeyMouseDown(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault()
  }

  async function handleParkingTargetSelect(nextMode: ParkingMode, nextAxis?: AxisId): Promise<boolean> {
    const resolvedAxis = nextMode === 'axis' ? (nextAxis ?? parkingAxis) : parkingAxis

    setParkingMode(nextMode)
    if (nextMode === 'axis') {
      setParkingAxis(resolvedAxis)
    }
    flashControlAction(nextMode === 'all' ? 'parking-all' : `parking-${resolvedAxis}`)

    const command = nextMode === 'all' ? 'homeAll' : resolvedAxis === 'Z' ? 'homeZ' : 'homeXY'
    const ok = await executeCommand({ command })
    if (!ok) {
      return false
    }

    await refresh()
    return true
  }

  function handleServiceModeToggle(): void {
    flashControlAction('service-mode')
  }

  function handleAxisMove(axis: AxisId, distanceMm: number): Promise<boolean> {
    return executeCommand({ command: 'moveAxis', axis, distanceMm })
  }

  function handleFilamentMove(direction: -1 | 1): Promise<boolean> {
    return executeCommand({ command: direction > 0 ? 'unloadFilament' : 'loadFilament' })
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

  function handleMotorsDisable(): void {
    void executeCommand({ command: 'consoleGcode', gcode: 'M84' })
  }

  const handleVirtualKeyboardLanguageToggle = useCallback(() => {
    setKeyboardLanguage((prevValue) => (prevValue === 'ru' ? 'en' : 'ru'))
  }, [])

  const handleVirtualKeyboardCapsToggle = useCallback(() => {
    setIsKeyboardCapsEnabled((prevValue) => !prevValue)
  }, [])

  const handleVirtualKeyboardKey = useCallback((key: string) => {
    if (activeKeyboardTarget === null) {
      return
    }

    if (isSettingsKeyboardTarget(activeKeyboardTarget)) {
      settingsKeyboard.onKeyPress(key)
      return
    }

    if (key === 'close') {
      setActiveKeyboardTarget(null)
      return
    }

    const input = idleNotesInputRef.current
    const currentValue = idleNotesText
    const selectionStart = input?.selectionStart ?? currentValue.length
    const selectionEnd = input?.selectionEnd ?? currentValue.length
    let nextValue = currentValue
    let nextCaret = selectionStart

    if (key === 'backspace') {
      if (selectionStart !== selectionEnd) {
        nextValue = `${currentValue.slice(0, selectionStart)}${currentValue.slice(selectionEnd)}`
        nextCaret = selectionStart
      } else if (selectionStart > 0) {
        nextValue = `${currentValue.slice(0, selectionStart - 1)}${currentValue.slice(selectionStart)}`
        nextCaret = selectionStart - 1
      }
    } else {
      const insertValue = key === 'space'
        ? ' '
        : key === 'enter'
          ? '\n'
          : key
      nextValue = `${currentValue.slice(0, selectionStart)}${insertValue}${currentValue.slice(selectionEnd)}`
      nextCaret = selectionStart + insertValue.length
    }

    if (nextValue === currentValue) {
      setIdleNotesKeyboardCaret(nextCaret)
      return
    }

    setIdleNotesText(nextValue)
    setIdleNotesKeyboardCaret(nextCaret)
  }, [activeKeyboardTarget, idleNotesText, setIdleNotesKeyboardCaret, settingsKeyboard])
  const isIdleNotesKeyboardOpen = activeKeyboardTarget === 'idleNotes'
  const handleIdleNotesKeyboardClose = handleKeyboardClose
  const handleIdleNotesKeyMouseDown = handleVirtualKeyboardKeyMouseDown
  const handleIdleNotesVirtualKey = handleVirtualKeyboardKey

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

  return (
    <main className={`app-root ${isMaxPerformanceModeEnabled ? 'is-performance-mode' : ''}`}>
      <section className="screen-shell" data-testid="screen-shell" ref={screenShellRef}>
        <div className={`content-grid ${isFilesScreenActive ? 'is-files-active' : ''} ${activeScreen === 'control' ? 'is-control-active' : ''}`}>
          {activeScreen === 'dashboard' ? (
            <DashboardPage
              statusDock={dashboardStatusDock}
              logoSrc={treeDLogoAsset}
              hasActivePrint={hasActivePrint}
              displayPrintFileName={displayPrintFileName}
              printFill={printFill}
              adjustedEtaTime={adjustedEtaTime}
              displayLayerCurrent={displayLayerCurrent}
              displayLayerTotal={displayLayerTotal}
              temperatureTargets={dashboardTemperatureTargets}
              quickMetrics={quickMetrics}
              processMetrics={processMetrics}
              isPrintPaused={isPrintPaused}
              pendingCommand={pendingCommand}
              isBusy={isBusy}
              printPauseBlockReason={printPauseBlockReason}
              printCancelBlockReason={printCancelBlockReason}
              babystepStep={babystepStep}
              babystepActiveIndex={babystepActiveIndex}
              zOffsetMm={snapshot.runtimeTune.appliedBabystepMm}
              babystepBlockReason={babystepBlockReason}
              idleHeroStatusLabel={idleHeroStatusLabel}
              idleWidgetOrder={idleWidgetOrder}
              armedIdleWidgetId={armedIdleWidgetId}
              draggingIdleWidgetId={draggingIdleWidgetId}
              idleWidgetRefs={idleWidgetRefs}
              maintenanceSummary={MAINTENANCE_STATUS}
              idleNotesInputRef={idleNotesInputRef}
              idleNotesText={idleNotesText}
              isIdleNotesKeyboardOpen={isIdleNotesKeyboardOpen}
              idleNotesKeyboardRows={IDLE_NOTES_KEYBOARD_ROWS}
              onPrintTuneGroupOpen={handlePrintTuneGroupOpen}
              onPause={() => void printSessionCommandHandlers.togglePause()}
              onStopRequest={() => void printSessionCommandHandlers.requestStop()}
              onBabystepStepChange={setBabystepStep}
              onBabystepAdjust={handleBabystepAdjust}
              onIdleWidgetTargetOpen={openIdleWidgetTarget}
              onIdleWidgetDragPointerDown={handleIdleWidgetDragPointerDown}
              onIdleWidgetDragPointerMove={handleIdleWidgetDragPointerMove}
              onIdleWidgetDragPointerEnd={handleIdleWidgetDragPointerEnd}
              onIdleWidgetDragHandleClick={handleIdleWidgetDragHandleClick}
              onIdleNotesKeyboardOpen={handleIdleNotesKeyboardOpen}
              onIdleNotesChange={handleIdleNotesChange}
              onIdleNotesKeyMouseDown={handleIdleNotesKeyMouseDown}
              onIdleNotesVirtualKey={handleIdleNotesVirtualKey}
              onIdleNotesKeyboardClose={handleIdleNotesKeyboardClose}
            />
          ) : isFilesScreenActive ? (
            <FilesPage files={effectiveFilesLibrary} onFileSelect={handlePrintFileSelect} />
          ) : activeScreen === 'control' ? (
            <ControlPage
              activeControlGroup={activeControlGroup}
              isControlMenuCompact={isControlMenuCompact}
              onControlGroupChange={setActiveControlGroup}
              onControlMenuCompactToggle={handleControlMenuCompactToggle}
              movement={{
                pendingCommand,
                isBusy,
                activeControlFlashKey,
                movementMode,
                moveStepKey,
                commandBlockReasons: movementCommandBlockReasons,
                zBounds: HEAD_Z_BOUNDS_MM,
                onParkingTargetSelect: handleParkingTargetSelect,
                onServiceModeToggle: handleServiceModeToggle,
                onMotorsDisable: handleMotorsDisable,
                onMovementModeChange: handleMovementModeChange,
                onMoveStepChange: handleMoveStepChange,
                onAxisMove: handleAxisMove,
                onFilamentMove: handleFilamentMove,
              }}
              heating={heatingProps}
              fan={fanProps}
              lighting={{
                isMainLightEnabled,
                isToolheadLightEnabled,
                onMainLightToggle: () => setIsMainLightEnabled((current) => !current),
                onToolheadLightToggle: () => setIsToolheadLightEnabled((current) => !current),
              }}
              maintenance={{
                status: MAINTENANCE_STATUS,
                historyItems: MAINTENANCE_HISTORY_ITEMS,
                checklistItems: MAINTENANCE_CHECKLIST_ITEMS,
                progressTicks: MAINTENANCE_PROGRESS_TICKS,
                progressPercent: maintenanceProgressPercent,
                checklistState: maintenanceChecklistState,
                isChecklistComplete: isMaintenanceChecklistComplete,
                onChecklistItemChange: (itemId, checked) => {
                  setMaintenanceChecklistState((current) => ({
                    ...current,
                    [itemId]: checked,
                  }))
                },
                onChecklistComplete: () => setMaintenanceChecklistState(createMaintenanceChecklistState(true)),
              }}
            />
          ) : activeScreen === 'settings' ? (
            <SettingsPage {...settingsPageProps} />
          ) : (
            <section className="screen-placeholder" data-testid={`screen-${activeScreen}`}>
              <p className="screen-placeholder-body">
                {SCREEN_PLACEHOLDERS[activeScreen as keyof typeof SCREEN_PLACEHOLDERS]?.description ?? ''}
              </p>
            </section>
          )}
        </div>

        <nav
          className="bottom-nav"
          aria-label="Основная навигация"
          style={{ '--nav-active-index': String(activeNavIndex) } as CSSProperties}
        >
          <span className="bottom-nav-indicator" aria-hidden="true" />
          {BOTTOM_NAV_ITEMS.map((item) => (
            <NavItemButton
              key={item.id}
              label={item.label}
              icon={item.icon}
              active={item.id === activeScreen}
              aria-current={item.id === activeScreen ? 'page' : undefined}
              onClick={() => handleScreenSelect(item.id)}
            />
          ))}
        </nav>

        {activeKeyboardTarget !== null && activeKeyboardTarget !== 'idleNotes' ? (
          <div
            className="app-virtual-keyboard-layer"
            role="presentation"
            onClick={handleKeyboardClose}
            data-testid="settings-keyboard-layer"
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
                onClose={handleKeyboardClose}
                onKeyMouseDown={handleVirtualKeyboardKeyMouseDown}
                showEnterKey={settingsKeyboard.isConsoleOpen}
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
