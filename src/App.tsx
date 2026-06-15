import { type ChangeEvent, type CSSProperties, type MouseEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  DASHBOARD_VALUES,
  type ScreenId,
} from './dashboard/config'
import { usePrinterDisplayStatus } from './dashboard/usePrinterDisplayStatus'
import {
  clampPercent,
  statusLabel,
} from './dashboard/helpers'
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
  SegmentedToggle,
  SettingsSidebarMenu,
  SettingsVirtualKeyboard,
  type SettingsMenuOption,
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
import { useHeatingFanController } from './heating'
import { PRINT_FILE_LIBRARY, type PrintFileItem } from './printFiles'
import type { PrinterConnectionState } from './core/transport/types'
import treeDLogoAsset from './assets/logo_treeD-28.svg'
import './App.css'

const DEFAULT_SCREEN: ScreenId = 'dashboard'
const IDLE_WIDGET_DRAG_HOLD_MS = 3000
const PRINT_CANCEL_MODAL_TITLE_ID = 'print-cancel-modal-title'
type MacrosGroupId = 'bedMesh'
type IdleWidgetId = DashboardIdleWidgetId
type BedCalibrationStage = 'launch' | 'manual' | 'zOffset'
type ActivePrintUiState = 'printing' | 'paused'
type KeyboardTarget = 'idleNotes' | SettingsKeyboardTarget
type BedScrewPointId = 'front-left' | 'front-right' | 'rear-right' | 'rear-left' | 'center'
type BedScrewPoint = {
  id: BedScrewPointId
  label: string
  xMm: number
  yMm: number
  mapX: number
  mapY: number
}

const MACROS_PARKING_MODE_OPTIONS: Array<{ id: ParkingMode; label: string }> = [
  { id: 'all', label: 'Все оси' },
  { id: 'axis', label: 'По оси' },
]
const MACROS_PARKING_AXIS_OPTIONS: Array<{ id: AxisId; label: string }> = [
  { id: 'X', label: 'X' },
  { id: 'Y', label: 'Y' },
  { id: 'Z', label: 'Z' },
]
const MACROS_GROUP_OPTIONS: Array<SettingsMenuOption<MacrosGroupId>> = [
  { id: 'bedMesh', label: 'Карта стола', icon: 'menuDashboard' },
]
const CONNECTION_LABELS: Record<PrinterConnectionState, string> = {
  connecting: 'Подключение',
  online: 'Подключено',
  degraded: 'Ограничено',
  reconnecting: 'Переподключение',
  offline: 'Офлайн',
  shutdown: 'Klipper остановлен',
}
const HEAD_Z_BOUNDS_MM = { min: 0, max: 200 } as const
const Z_OFFSET_BOUNDS_MM = { min: -2, max: 2 } as const
const BED_SCREW_MOVE_DURATION_MS = 650
const BED_SCREW_GUIDE_POINTS: BedScrewPoint[] = [
  { id: 'front-left', label: 'Передний левый', xMm: 35, yMm: 35, mapX: 14, mapY: 18 },
  { id: 'front-right', label: 'Передний правый', xMm: 215, yMm: 35, mapX: 86, mapY: 18 },
  { id: 'rear-right', label: 'Задний правый', xMm: 215, yMm: 215, mapX: 86, mapY: 82 },
  { id: 'rear-left', label: 'Задний левый', xMm: 35, yMm: 215, mapX: 14, mapY: 82 },
  { id: 'center', label: 'Центр', xMm: 125, yMm: 125, mapX: 50, mapY: 50 },
]
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

function clampAxisValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function formatAxisCoordinate(value: number): string {
  return value.toFixed(1)
}

const SCREEN_PLACEHOLDERS: Record<Exclude<ScreenId, 'dashboard' | 'files' | 'settings'>, { title: string; description: string }> = {
  control: {
    title: 'Управление',
    description: 'Раздел управления принтером подключен в навигацию и готов к наполнению рабочими блоками.',
  },
  macros: {
    title: 'Макросы',
    description: 'Экран макросов подключен в каркас маршрутизации. Здесь будут быстрые сценарии и сервисные команды.',
  },
}

function App() {
  const { snapshot, refresh } = usePrinterSnapshot()
  const screenShellRef = useRef<HTMLElement | null>(null)
  const [babystepStep, setBabystepStep] = useState<number>(BABYSTEP_STEP_OPTIONS[1])
  const [activeScreen, setActiveScreen] = useState<ScreenId>(DEFAULT_SCREEN)
  const [filesLibrary, setFilesLibrary] = useState<PrintFileItem[]>(() => [...PRINT_FILE_LIBRARY])
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [fileModalNotice, setFileModalNotice] = useState<string>('')
  const [activePrintFileName, setActivePrintFileName] = useState<string | null>(null)
  const [activePrintUiState, setActivePrintUiState] = useState<ActivePrintUiState | null>(null)
  const commandRuntimeContext = useMemo(
    () => ({
      capabilities: snapshot.capabilities,
      connection: snapshot.connection,
      printJob: snapshot.source === 'live'
        ? {
            state: snapshot.printJob.state,
            isActive: snapshot.printJob.isActive,
            isPaused: snapshot.printJob.isPaused,
          }
        : {
            state: activePrintUiState ??
              (activePrintFileName === null ? snapshot.printJob.state : 'printing'),
            isActive: activePrintFileName !== null,
            isPaused: activePrintUiState === 'paused',
          },
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
      activePrintFileName,
      activePrintUiState,
      snapshot.capabilities,
      snapshot.connection,
      snapshot.extruderTemp,
      snapshot.homedAxes,
      snapshot.printJob.isActive,
      snapshot.printJob.isPaused,
      snapshot.printJob.state,
      snapshot.source,
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
  const [isPrintCancelConfirmOpen, setIsPrintCancelConfirmOpen] = useState<boolean>(false)
  const [idleNotesText, setIdleNotesText] = useState<string>(IDLE_NOTES_DEFAULT_TEXT)
  const [activeKeyboardTarget, setActiveKeyboardTarget] = useState<KeyboardTarget | null>(null)
  const [keyboardLanguage, setKeyboardLanguage] = useState<VirtualKeyboardLanguage>('ru')
  const [isKeyboardCapsEnabled, setIsKeyboardCapsEnabled] = useState<boolean>(false)
  const [activeMacrosGroup, setActiveMacrosGroup] = useState<MacrosGroupId>('bedMesh')
  const [bedCalibrationStage, setBedCalibrationStage] = useState<BedCalibrationStage>('launch')
  const [isBedScrewGuideIntroOpen, setIsBedScrewGuideIntroOpen] = useState<boolean>(false)
  const [isManualCalibrationFinalizeStep, setIsManualCalibrationFinalizeStep] = useState<boolean>(false)
  const [storedZOffsetMm, setStoredZOffsetMm] = useState<number>(DASHBOARD_VALUES.zOffsetMm)
  const [zOffsetNotice, setZOffsetNotice] = useState<string>('Измените значение и сохраните его в настройки принтера.')
  const [isBedScrewGuideStarted, setIsBedScrewGuideStarted] = useState<boolean>(false)
  const [isBedScrewPointMoving, setIsBedScrewPointMoving] = useState<boolean>(false)
  const [activeBedScrewPointId, setActiveBedScrewPointId] = useState<BedScrewPointId | null>(null)
  const [visitedBedScrewPointIds, setVisitedBedScrewPointIds] = useState<BedScrewPointId[]>([])
  const [manualBedParkingMode, setManualBedParkingMode] = useState<ParkingMode>('all')
  const [manualBedParkingAxis, setManualBedParkingAxis] = useState<AxisId>('X')
  const [bedScrewGuideNotice, setBedScrewGuideNotice] = useState<string>('Нажмите «Запустить по винтам», затем выбирайте точки на карте.')
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
  const bedScrewMoveTimeoutRef = useRef<number | null>(null)
  const controlFlashTimeoutRef = useRef<number | null>(null)
  const idleWidgetHoldTimeoutRef = useRef<number | null>(null)
  const idleWidgetRefs = useRef<Record<IdleWidgetId, HTMLElement | null>>({
    temperature: null,
    maintenance: null,
  })
  const draggingIdleWidgetIdRef = useRef<IdleWidgetId | null>(null)

  const displayPrintFileName = snapshot.source === 'live' && snapshot.printJob.isActive
    ? snapshot.printJob.filename
    : activePrintFileName
  const printFill = snapshot.source === 'live'
    ? Math.round(clampAxisValue(snapshot.printJob.progress * 100, 0, 100))
    : Math.max(0, Math.min(100, DASHBOARD_VALUES.progressPercent))
  const displayLayerCurrent = snapshot.source === 'live'
    ? (snapshot.printJob.currentLayer ?? DASHBOARD_VALUES.layerCurrent)
    : DASHBOARD_VALUES.layerCurrent
  const displayLayerTotal = snapshot.source === 'live'
    ? (snapshot.printJob.totalLayer ?? DASHBOARD_VALUES.layerTotal)
    : DASHBOARD_VALUES.layerTotal
  const isBusy = pendingCommand !== null
  const hasActivePrint = displayPrintFileName !== null
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
  } = usePrintTuneController({ hasActivePrint })
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
  const wifiSsidLabel = isRuntimeCurrent ? snapshot.wifiSsid : 'Не подключено'
  const wifiIpLabel = isRuntimeCurrent ? snapshot.ipAddress : '—'
  const isCloudCapabilityAvailable = snapshot.capabilities.cloud
  const settingsController = useSettingsController({
    snapshot,
    connectionLabel,
    executeCommand,
    getCommandBlockReason,
    activeKeyboardTarget: isSettingsKeyboardTarget(activeKeyboardTarget) ? activeKeyboardTarget : null,
    openKeyboard: (target) => setActiveKeyboardTarget(target),
    closeKeyboard: () => setActiveKeyboardTarget(null),
  })
  const settingsPageProps = settingsController.pageProps
  const settingsKeyboard = settingsController.keyboard
  const isSettingsKeyboardTargetAllowed = settingsController.isKeyboardTargetAllowed
  const setActiveSettingsGroup = settingsPageProps.onSettingsGroupChange
  const cloudStatusLabel = isCloudCapabilityAvailable && snapshot.connection === 'online' ? 'В сети' : 'Недоступно'
  const cloudCapabilityNotice = settingsPageProps.cloud.notice
  const isMaxPerformanceModeEnabled = settingsPageProps.interfaceSettings.isMaxPerformanceModeEnabled
  const eddyStatusLabel = snapshot.v2.eddy.status === 'ready'
    ? 'Eddy готов к Z-home/mesh'
    : snapshot.v2.eddy.status === 'uncalibrated'
      ? 'Eddy не калиброван'
    : snapshot.v2.eddy.status === 'requires_xy_home'
      ? 'Eddy требует homing XY'
      : 'Eddy статус неизвестен'
  const effectiveActivePrintState = snapshot.source === 'live'
    ? snapshot.printJob.state
    : hasActivePrint
      ? (activePrintUiState ?? snapshot.state)
      : snapshot.state
  const isPrintPaused = hasActivePrint && statusLabel(effectiveActivePrintState) === 'Пауза'
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
  const printPauseCommand = isPrintPaused ? 'resume' : 'pause'
  const printPauseBlockReason = getCommandBlockReason(printPauseCommand)
  const printCancelBlockReason = getCommandBlockReason('cancel')
  const printStartBlockReason = getCommandBlockReason('start')
  const fileStartNotice = fileModalNotice || printStartBlockReason
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
  const effectiveFilesLibrary = snapshot.source === 'live' ? snapshot.printFiles : filesLibrary
  const selectedPrintFile = useMemo(() => {
    if (selectedFileId === null) {
      return null
    }

    return effectiveFilesLibrary.find((item) => item.id === selectedFileId) ?? null
  }, [effectiveFilesLibrary, selectedFileId])
  const activeBedScrewPoint = BED_SCREW_GUIDE_POINTS.find((point) => point.id === activeBedScrewPointId) ?? null
  const activeBedScrewPointLabel = activeBedScrewPoint === null
    ? 'Текущая точка не выбрана.'
    : `Текущая: ${activeBedScrewPoint.label} | X ${formatAxisCoordinate(activeBedScrewPoint.xMm)} | Y ${formatAxisCoordinate(activeBedScrewPoint.yMm)}`
  const bedScrewGuideProgressLabel = `${visitedBedScrewPointIds.length} / ${BED_SCREW_GUIDE_POINTS.length}`
  const isBedScrewGuideDone = visitedBedScrewPointIds.length === BED_SCREW_GUIDE_POINTS.length
  const isManualBedControlsLocked = isBedScrewPointMoving || isBusy
  const manualBedParkingActionLabel = manualBedParkingMode === 'all'
    ? 'Парковка по всем осям'
    : `Парковка оси ${manualBedParkingAxis}`
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
    printFill,
    displayLayerCurrent,
    displayLayerTotal,
  })
  const printTuneModalHandlers = createModalHandlers({
    onFanPercentChange: handleFanPercentChange,
  })
  const openWifiSettings = useCallback(() => {
    setActiveSettingsGroup('network')
    setActiveScreen('settings')
    closeTopPopup()
  }, [closeTopPopup, setActiveSettingsGroup])

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

  function handleMacroZOffsetAdjust(direction: -1 | 1): void {
    setStoredZOffsetMm((currentValue) => {
      const nextValue = clampAxisValue(
        currentValue + (direction * babystepStep),
        Z_OFFSET_BOUNDS_MM.min,
        Z_OFFSET_BOUNDS_MM.max,
      )
      return Math.round(nextValue * 1000) / 1000
    })
    setZOffsetNotice('Значение изменено. Сохраните его в настройки принтера.')
  }

  function handleMacroZOffsetSave(): void {
    setZOffsetNotice(`Z-offset сохранён: ${storedZOffsetMm.toFixed(3)} мм.`)
  }

  function handleBedScrewGuideStart(): void {
    setIsBedScrewGuideStarted(true)
    setActiveBedScrewPointId(null)
    setVisitedBedScrewPointIds([])
    setBedScrewGuideNotice('Выберите точку на карте, чтобы переместить голову к нужному винту.')
  }

  function handleBedScrewGuideReset(): void {
    setIsBedScrewGuideStarted(false)
    setActiveBedScrewPointId(null)
    setVisitedBedScrewPointIds([])
    setBedScrewGuideNotice('Нажмите «Запустить по винтам», затем выбирайте точки на карте.')
  }

  function handleBedScrewPointSelect(pointId: BedScrewPointId): void {
    if (!isBedScrewGuideStarted) {
      return
    }

    const selectedPointIndex = BED_SCREW_GUIDE_POINTS.findIndex((point) => point.id === pointId)
    const selectedPoint = BED_SCREW_GUIDE_POINTS[selectedPointIndex]
    if (selectedPoint === undefined) {
      return
    }

    clearBedScrewMoveTimeout()
    setIsBedScrewPointMoving(true)
    setActiveBedScrewPointId(selectedPoint.id)
    setBedScrewGuideNotice(`Перемещение к точке ${selectedPointIndex + 1}...`)
    setVisitedBedScrewPointIds((currentPoints) => {
      const nextPoints = currentPoints.includes(selectedPoint.id)
        ? currentPoints
        : [...currentPoints, selectedPoint.id]
      if (nextPoints.length === BED_SCREW_GUIDE_POINTS.length) {
        setBedScrewGuideNotice('Все точки пройдены. При необходимости повторите проход для точной регулировки.')
      } else {
        setBedScrewGuideNotice(`Точка «${selectedPoint.label}»: выполните регулировку и перейдите к следующей.`)
      }
      return nextPoints
    })
  }

  function handleMacroZOffsetPrimaryAction(): void {
    if (isManualCalibrationFinalizeStep) {
      setIsManualCalibrationFinalizeStep(false)
      setZOffsetNotice(`Калибровка завершена. Z-offset ${storedZOffsetMm.toFixed(3)} мм сохранён.`)
      return
    }

    handleMacroZOffsetSave()
  }

  function clearBedScrewMoveTimeout(): void {
    if (bedScrewMoveTimeoutRef.current !== null) {
      window.clearTimeout(bedScrewMoveTimeoutRef.current)
      bedScrewMoveTimeoutRef.current = null
    }
  }

  function handleBedScrewGuideIntroOpen(): void {
    setIsBedScrewGuideIntroOpen(true)
  }

  function handleBedScrewGuideIntroClose(): void {
    setIsBedScrewGuideIntroOpen(false)
  }

  function handleBedScrewGuideIntroConfirm(): void {
    clearBedScrewMoveTimeout()
    setIsBedScrewGuideIntroOpen(false)
    setIsManualCalibrationFinalizeStep(false)
    setActiveMacrosGroup('bedMesh')
    setBedCalibrationStage('manual')
    setIsBedScrewGuideStarted(true)
    setIsBedScrewPointMoving(false)
    setActiveBedScrewPointId(null)
    setVisitedBedScrewPointIds([])
    setBedScrewGuideNotice('Нажимайте на точки 1-5, чтобы перемещать голову по винтам стола.')
  }

  function handleManualBedParkingAction(): void {
    if (isManualBedControlsLocked) {
      return
    }

    setBedScrewGuideNotice(`${manualBedParkingActionLabel}: команда будет подключена при пересборке макросов.`)
  }

  function handleManualBedPointPick(pointId: BedScrewPointId): void {
    if (!isBedScrewGuideStarted || isManualBedControlsLocked) {
      return
    }

    const selectedPointIndex = BED_SCREW_GUIDE_POINTS.findIndex((point) => point.id === pointId)
    const selectedPoint = BED_SCREW_GUIDE_POINTS[selectedPointIndex]
    if (selectedPoint === undefined) {
      return
    }

    clearBedScrewMoveTimeout()
    setIsBedScrewPointMoving(true)
    setActiveBedScrewPointId(selectedPoint.id)
    setBedScrewGuideNotice(`Перемещение к точке ${selectedPointIndex + 1}...`)

    bedScrewMoveTimeoutRef.current = window.setTimeout(() => {
      bedScrewMoveTimeoutRef.current = null
      setVisitedBedScrewPointIds((currentPoints) => {
        const nextPoints = currentPoints.includes(selectedPoint.id)
          ? currentPoints
          : [...currentPoints, selectedPoint.id]

        if (nextPoints.length === BED_SCREW_GUIDE_POINTS.length) {
          setBedScrewGuideNotice('Все точки пройдены. Нажмите «Завершить», чтобы перейти к Z-offset.')
        } else {
          setBedScrewGuideNotice(`Точка ${selectedPointIndex + 1} достигнута. Выберите следующую.`)
        }

        return nextPoints
      })
      setIsBedScrewPointMoving(false)
      setActiveBedScrewPointId(null)
    }, BED_SCREW_MOVE_DURATION_MS)
  }

  function handleBedScrewGuideFinishAndGoToZOffset(): void {
    clearBedScrewMoveTimeout()
    setIsBedScrewGuideStarted(false)
    setIsBedScrewPointMoving(false)
    setActiveBedScrewPointId(null)
    setVisitedBedScrewPointIds([])
    setActiveMacrosGroup('bedMesh')
    setBedCalibrationStage('zOffset')
    setIsManualCalibrationFinalizeStep(true)
    setZOffsetNotice('Калибровка по точкам завершена. Подстройте Z-offset и нажмите «Завершить калибровку».')
    setBedScrewGuideNotice('Нажмите «Запустить по винтам», затем выбирайте точки на карте.')
  }

  function handleOpenDirectZOffset(): void {
    clearBedScrewMoveTimeout()
    setIsBedScrewGuideIntroOpen(false)
    setIsBedScrewGuideStarted(false)
    setIsBedScrewPointMoving(false)
    setActiveBedScrewPointId(null)
    setVisitedBedScrewPointIds([])
    setActiveMacrosGroup('bedMesh')
    setIsManualCalibrationFinalizeStep(false)
    setBedCalibrationStage('zOffset')
    setZOffsetNotice('Измените значение и сохраните его в настройки принтера.')
    setBedScrewGuideNotice('Нажмите «Запуск калибровки вручную», затем выбирайте точки на карте.')
  }

  function handleBackToBedCalibrationLaunch(): void {
    clearBedScrewMoveTimeout()
    setIsBedScrewGuideIntroOpen(false)
    setIsBedScrewGuideStarted(false)
    setIsBedScrewPointMoving(false)
    setActiveBedScrewPointId(null)
    setVisitedBedScrewPointIds([])
    setActiveMacrosGroup('bedMesh')
    setIsManualCalibrationFinalizeStep(false)
    setBedCalibrationStage('launch')
    setBedScrewGuideNotice('Нажмите «Запуск калибровки вручную», затем выбирайте точки на карте.')
  }

  const closeFileModal = useCallback(() => {
    setSelectedFileId(null)
    setFileModalNotice('')
  }, [])

  const closePrintCancelConfirm = useCallback(() => {
    setIsPrintCancelConfirmOpen(false)
  }, [])

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

  function handlePrintFileSelect(fileId: string): void {
    setSelectedFileId(fileId)
    setFileModalNotice('')
  }

  function handleDeleteSelectedFile(): void {
    if (selectedPrintFile === null) {
      return
    }

    if (displayPrintFileName === selectedPrintFile.name || displayPrintFileName === selectedPrintFile.path) {
      setActivePrintFileName(null)
      setActivePrintUiState(null)
    }
    if (snapshot.source !== 'live') {
      setFilesLibrary((currentItems) => currentItems.filter((item) => item.id !== selectedPrintFile.id))
    }
    closeFileModal()
  }

  async function handleStartSelectedFile(): Promise<void> {
    if (selectedPrintFile === null) {
      return
    }

    const ok = await executeCommand({
      command: 'start',
      filename: selectedPrintFile.path,
    })
    if (!ok) {
      setFileModalNotice(getLastCommandError() || commandError || printStartBlockReason || 'Старт печати не выполнен.')
      return
    }

    if (snapshot.source === 'mock') {
      setActivePrintFileName(selectedPrintFile.name)
      setActivePrintUiState('printing')
    }

    await refresh()
    setActiveScreen('dashboard')
    closeFileModal()
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
    if (selectedFileId === null || typeof window === 'undefined') {
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
  }, [closeFileModal, selectedFileId])

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
    if (activeScreen !== 'files' && selectedFileId !== null) {
      closeFileModal()
    }
  }, [activeScreen, closeFileModal, selectedFileId])

  async function handlePause(): Promise<void> {
    const nextCommand = printPauseCommand
    const ok = await executeCommand({ command: nextCommand })
    if (ok) {
      setActivePrintUiState(isPrintPaused ? 'printing' : 'paused')
      await refresh()
    }
  }

  function handleStopRequest(): void {
    if (printCancelBlockReason !== null) {
      return
    }

    if (requiresCommandConfirmation('cancel')) {
      setIsPrintCancelConfirmOpen(true)
      return
    }

    void handleStopConfirm()
  }

  async function handleStopConfirm(): Promise<void> {
    const ok = await executeCommand({ command: 'cancel' })
    if (ok) {
      setActivePrintFileName(null)
      setActivePrintUiState(null)
      await refresh()
      setActiveScreen('dashboard')
      closePrintCancelConfirm()
    }
  }

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

  useEffect(() => {
    if (!hasActivePrint || activePrintUiState === null) {
      return
    }

    if (snapshot.state.toLowerCase() === activePrintUiState) {
      setActivePrintUiState(null)
    }
  }, [activePrintUiState, hasActivePrint, snapshot.state])

  useEffect(() => () => {
    if (bedScrewMoveTimeoutRef.current !== null) {
      window.clearTimeout(bedScrewMoveTimeoutRef.current)
      bedScrewMoveTimeoutRef.current = null
    }
  }, [])

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
              onPause={() => void handlePause()}
              onStopRequest={handleStopRequest}
              onBabystepStepChange={setBabystepStep}
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
          ) : activeScreen === 'macros' ? (
            // Temporary screen: macros will be rewritten after verifying treed-mainshellOS macro/runtime contracts.
            <section className="macros-screen" data-testid="screen-macros">
              <div className="settings-layout macros-layout">
                <aside className="settings-menu-shell macros-menu-shell">
                  <SettingsSidebarMenu
                    options={MACROS_GROUP_OPTIONS}
                    value={activeMacrosGroup}
                    onChange={setActiveMacrosGroup}
                    ariaLabel="Группы калибровки"
                    testIdPrefix="macros-group"
                  />
                </aside>

                <div className="settings-content-shell macros-content-shell">
                  {bedCalibrationStage === 'zOffset' ? (
                    <div className="settings-group-stack macros-group-stack">
                      <header className="settings-group-head">
                        <h3>Карта стола</h3>
                        <p>
                          {isManualCalibrationFinalizeStep
                            ? 'Финальный этап: подстройте Z-offset и завершите калибровку.'
                            : 'Настройка Z-offset с сохранением в параметры принтера.'}
                        </p>
                      </header>

                      <article className="settings-description-card macros-zoffset-card">
                        <div className="macros-zoffset-head">
                          <p className="label">Z-offset</p>
                          <p className="value macros-zoffset-value" data-testid="macros-zoffset-value">
                            {storedZOffsetMm.toFixed(3)}<span>мм</span>
                          </p>
                        </div>

                        <div
                          className="step-selector"
                          role="group"
                          aria-label="шаг калибровки Z-offset"
                          style={{ '--step-active-index': String(babystepActiveIndex) } as CSSProperties}
                        >
                          <span className="step-selector-indicator" aria-hidden="true" />
                          {BABYSTEP_STEP_OPTIONS.map((step) => (
                            <button
                              key={step}
                              type="button"
                              className={`step-btn ${babystepStep === step ? 'is-active' : ''}`}
                              onClick={() => setBabystepStep(step)}
                              aria-pressed={babystepStep === step}
                            >
                              {step}
                            </button>
                          ))}
                        </div>

                        <div className="babystep-controls" role="group" aria-label="корректировка Z-offset">
                          <button
                            type="button"
                            className="babystep-btn"
                            onClick={() => handleMacroZOffsetAdjust(-1)}
                            aria-label={`Уменьшить Z-offset на ${babystepStep}`}
                            data-testid="macros-zoffset-minus"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            className="babystep-btn"
                            onClick={() => handleMacroZOffsetAdjust(1)}
                            aria-label={`Увеличить Z-offset на ${babystepStep}`}
                            data-testid="macros-zoffset-plus"
                          >
                            +
                          </button>
                        </div>

                        <div className="macros-zoffset-actions">
                          <button
                            type="button"
                            className="settings-network-btn settings-network-btn-primary macros-zoffset-save"
                            onClick={handleMacroZOffsetPrimaryAction}
                            data-testid="macros-zoffset-save"
                          >
                            {isManualCalibrationFinalizeStep ? 'Завершить калибровку' : 'Сохранить в настройки'}
                          </button>
                          <button
                            type="button"
                            className="settings-network-btn macros-zoffset-back"
                            onClick={handleBackToBedCalibrationLaunch}
                            data-testid="macros-zoffset-back"
                          >
                            К сценариям
                          </button>
                          <p className="macros-zoffset-notice" data-testid="macros-zoffset-notice">{zOffsetNotice}</p>
                        </div>
                      </article>
                    </div>
                  ) : (
                    <div className="settings-group-stack macros-group-stack">
                      <header className="settings-group-head">
                        <h3>Карта стола</h3>
                        <p>Ручная и автоматическая калибровка плоскости стола.</p>
                        <p data-testid="eddy-runtime-status">{eddyStatusLabel}</p>
                      </header>

                      {bedCalibrationStage === 'manual' ? (
                        <article className="settings-description-card macros-bed-map-workspace" data-testid="macros-bed-map-workspace">
                          <div className="macros-bed-map-stack">
                            <p className="macros-bed-guide-progress" data-testid="macros-bed-progress">
                              <span>Пройдено точек</span>
                              <strong>{bedScrewGuideProgressLabel}</strong>
                            </p>

                            <div className="macros-bed-map is-active" data-testid="macros-bed-map">
                              {BED_SCREW_GUIDE_POINTS.map((point, index) => {
                                const isVisited = visitedBedScrewPointIds.includes(point.id)
                                const isCurrent = activeBedScrewPointId === point.id
                                return (
                                  <button
                                    key={point.id}
                                    type="button"
                                    className={`macros-bed-point ${isVisited ? 'is-visited' : ''} ${isCurrent ? 'is-current' : ''}`}
                                    style={
                                      {
                                        '--bed-point-left': `${point.mapX}%`,
                                        '--bed-point-top': `${point.mapY}%`,
                                      } as CSSProperties
                                    }
                                    onClick={() => handleManualBedPointPick(point.id)}
                                    disabled={isManualBedControlsLocked}
                                    aria-label={`Точка ${index + 1}`}
                                    data-testid={`macros-bed-point-${point.id}`}
                                  >
                                    {index + 1}
                                  </button>
                                )
                              })}
                            </div>

                            <p className="macros-bed-guide-notice" data-testid="macros-bed-notice">{bedScrewGuideNotice}</p>
                          </div>

                          <aside className="macros-bed-parking-panel" data-testid="macros-bed-parking-panel">
                            <h4>Парковка осей</h4>
                            <div className={`macros-toggle-lock ${isManualBedControlsLocked ? 'is-locked' : ''}`}>
                            <SegmentedToggle
                              options={MACROS_PARKING_MODE_OPTIONS}
                              value={manualBedParkingMode}
                              onChange={setManualBedParkingMode}
                              ariaLabel="Режим парковки в ручной калибровке"
                              testIdPrefix="macros-bed-parking-mode"
                            />
                            </div>
                            {manualBedParkingMode === 'axis' ? (
                              <div className={`macros-toggle-lock ${isManualBedControlsLocked ? 'is-locked' : ''}`}>
                              <SegmentedToggle
                                options={MACROS_PARKING_AXIS_OPTIONS}
                                value={manualBedParkingAxis}
                                onChange={setManualBedParkingAxis}
                                ariaLabel="Выбор оси парковки в ручной калибровке"
                                testIdPrefix="macros-bed-parking-axis"
                              />
                              </div>
                            ) : null}
                            <button
                              type="button"
                              className="settings-network-btn"
                              onClick={handleManualBedParkingAction}
                              disabled={isManualBedControlsLocked}
                              data-testid="macros-bed-parking-action"
                            >
                              {manualBedParkingActionLabel}
                            </button>
                            <button
                              type="button"
                              className="settings-network-btn settings-network-btn-primary macros-bed-finish-btn"
                              onClick={handleBedScrewGuideFinishAndGoToZOffset}
                              disabled={!isBedScrewGuideDone || isManualBedControlsLocked}
                              data-testid="macros-bed-finish-button"
                            >
                              Завершить
                            </button>
                            <button
                              type="button"
                              className="settings-network-btn"
                              onClick={handleBackToBedCalibrationLaunch}
                              disabled={isManualBedControlsLocked}
                              data-testid="macros-bed-back-button"
                            >
                              К сценариям
                            </button>
                          </aside>
                        </article>
                      ) : (
                        <div className="macros-bed-launch-grid">
                          <article className="settings-description-card macros-bed-launch-card" data-testid="macros-bed-manual-card">
                            <h4>Ручная калибровка</h4>
                            <p className="macros-bed-launch-copy">Пошаговый проход по 5 точкам стола с интерактивной парковкой осей.</p>
                            <button
                              type="button"
                              className="settings-network-btn settings-network-btn-primary macros-bed-launch-action"
                              onClick={handleBedScrewGuideIntroOpen}
                              data-testid="macros-bed-start-button"
                            >
                              Запуск калибровки вручную
                            </button>
                          </article>

                          <article className="settings-description-card macros-bed-launch-card" data-testid="macros-bed-auto-card">
                            <h4>Автокалибровка</h4>
                            <p className="macros-bed-launch-copy">Пустой виджет. Сценарий автоматической калибровки будет добавлен следующим этапом.</p>
                            <button
                              type="button"
                              className="settings-network-btn macros-bed-launch-action"
                              disabled
                              data-testid="macros-bed-auto-button"
                            >
                              Скоро доступно
                            </button>
                          </article>

                          <article className="settings-description-card macros-bed-launch-card" data-testid="macros-bed-zoffset-card">
                            <h4>Z-offset</h4>
                            <p className="macros-bed-launch-copy">Быстрая коррекция Z-offset без выравнивания стола.</p>
                            <button
                              type="button"
                              className="settings-network-btn macros-bed-launch-action"
                              onClick={handleOpenDirectZOffset}
                              data-testid="macros-bed-zoffset-open"
                            >
                              Открыть Z-offset
                            </button>
                          </article>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : false ? (
            <section className="macros-screen" data-testid="screen-macros">
              <div className="settings-layout macros-layout">
                <aside className="settings-menu-shell macros-menu-shell">
                  <SettingsSidebarMenu
                    options={MACROS_GROUP_OPTIONS}
                    value={activeMacrosGroup}
                    onChange={setActiveMacrosGroup}
                    ariaLabel="Группы калибровки"
                    testIdPrefix="macros-group"
                  />
                </aside>

                <div className="settings-content-shell macros-content-shell">
                  {bedCalibrationStage === 'zOffset' ? (
                    <div className="settings-group-stack macros-group-stack">
                      <header className="settings-group-head">
                        <h3>Калибровка стола</h3>
                        <p>Настройка Z-offset с сохранением в параметры принтера.</p>
                      </header>

                      <article className="settings-description-card macros-zoffset-card">
                        <div className="macros-zoffset-head">
                          <p className="label">Z-offset</p>
                          <p className="value macros-zoffset-value" data-testid="macros-zoffset-value">
                            {storedZOffsetMm.toFixed(3)}<span>мм</span>
                          </p>
                        </div>

                        <div
                          className="step-selector"
                          role="group"
                          aria-label="шаг калибровки Z-offset"
                          style={{ '--step-active-index': String(babystepActiveIndex) } as CSSProperties}
                        >
                          <span className="step-selector-indicator" aria-hidden="true" />
                          {BABYSTEP_STEP_OPTIONS.map((step) => (
                            <button
                              key={step}
                              type="button"
                              className={`step-btn ${babystepStep === step ? 'is-active' : ''}`}
                              onClick={() => setBabystepStep(step)}
                              aria-pressed={babystepStep === step}
                            >
                              {step}
                            </button>
                          ))}
                        </div>

                        <div className="babystep-controls" role="group" aria-label="корректировка Z-offset">
                          <button
                            type="button"
                            className="babystep-btn"
                            onClick={() => handleMacroZOffsetAdjust(-1)}
                            aria-label={`Уменьшить Z-offset на ${babystepStep}`}
                            data-testid="macros-zoffset-minus"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            className="babystep-btn"
                            onClick={() => handleMacroZOffsetAdjust(1)}
                            aria-label={`Увеличить Z-offset на ${babystepStep}`}
                            data-testid="macros-zoffset-plus"
                          >
                            +
                          </button>
                        </div>

                        <div className="macros-zoffset-actions">
                          <button
                            type="button"
                            className="settings-network-btn settings-network-btn-primary macros-zoffset-save"
                            onClick={handleMacroZOffsetPrimaryAction}
                            data-testid="macros-zoffset-save"
                          >
                            Сохранить в настройки
                          </button>
                          <p className="macros-zoffset-notice" data-testid="macros-zoffset-notice">{zOffsetNotice}</p>
                        </div>
                      </article>
                    </div>
                  ) : (
                    <div className="settings-group-stack macros-group-stack">
                      <header className="settings-group-head">
                        <h3>Карта стола</h3>
                        <p>Полуручная калибровка по винтам: выбирайте точку, выравнивайте и переходите дальше.</p>
                      </header>

                      <article className="settings-description-card macros-bed-guide-card">
                        <div className="macros-bed-guide-actions">
                          <button
                            type="button"
                            className="settings-network-btn settings-network-btn-primary"
                            onClick={handleBedScrewGuideStart}
                            data-testid="macros-bed-start-button"
                          >
                            Запустить по винтам
                          </button>
                          <button
                            type="button"
                            className="settings-network-btn"
                            onClick={handleBedScrewGuideReset}
                            data-testid="macros-bed-reset-button"
                          >
                            Сбросить проход
                          </button>
                        </div>
                        <p className="macros-bed-guide-progress" data-testid="macros-bed-progress">
                          <span>Пройдено точек</span>
                          <strong>{bedScrewGuideProgressLabel}</strong>
                        </p>
                        <p className="macros-bed-guide-notice" data-testid="macros-bed-notice">{bedScrewGuideNotice}</p>
                      </article>

                      <article className="settings-description-card macros-bed-map-card">
                        <div
                          className={`macros-bed-map ${isBedScrewGuideStarted ? 'is-active' : ''}`}
                          data-testid="macros-bed-map"
                        >
                          {BED_SCREW_GUIDE_POINTS.map((point, index) => {
                            const isVisited = visitedBedScrewPointIds.includes(point.id)
                            const isCurrent = activeBedScrewPointId === point.id
                            return (
                              <button
                                key={point.id}
                                type="button"
                                className={`macros-bed-point ${isVisited ? 'is-visited' : ''} ${isCurrent ? 'is-current' : ''}`}
                                style={
                                  {
                                    '--bed-point-left': `${point.mapX}%`,
                                    '--bed-point-top': `${point.mapY}%`,
                                  } as CSSProperties
                                }
                                onClick={() => handleBedScrewPointSelect(point.id)}
                                disabled={!isBedScrewGuideStarted}
                                aria-label={`Точка ${point.label}`}
                                data-testid={`macros-bed-point-${point.id}`}
                              >
                                {index + 1}
                              </button>
                            )
                          })}
                        </div>

                        <div className="macros-bed-points-list">
                          {BED_SCREW_GUIDE_POINTS.map((point, index) => (
                            <p
                              key={point.id}
                              className={`macros-bed-points-row ${visitedBedScrewPointIds.includes(point.id) ? 'is-visited' : ''}`}
                            >
                              <span>{index + 1}. {point.label}</span>
                              <strong>X {point.xMm} | Y {point.yMm}</strong>
                            </p>
                          ))}
                          <p className="macros-bed-current" data-testid="macros-bed-current-point">
                            {activeBedScrewPointLabel}
                          </p>
                          {isBedScrewGuideDone ? (
                            <p className="macros-bed-complete">Проход завершён. Можно повторить калибровку для контроля.</p>
                          ) : null}
                        </div>
                      </article>
                    </div>
                  )}
                </div>
              </div>
            </section>
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

        {isBedScrewGuideIntroOpen ? (
          <div
            className="macros-intro-layer"
            role="presentation"
            data-testid="macros-bed-intro-layer"
            onClick={handleBedScrewGuideIntroClose}
          >
            <section
              className="macros-intro-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="macros-bed-intro-title"
              data-testid="macros-bed-intro-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="print-cancel-modal-head">
                <h2 id="macros-bed-intro-title">Ручная калибровка стола</h2>
                <button
                  type="button"
                  className="print-cancel-modal-close"
                  aria-label="Закрыть окно ручной калибровки"
                  onClick={handleBedScrewGuideIntroClose}
                >
                  ×
                </button>
              </header>

              <p className="macros-intro-body">
                Принтер будет перемещаться между 5 точками стола. Нажимайте точки на карте в нужном порядке,
                выравнивайте стол и затем переходите к Z-offset.
              </p>

              <div className="macros-intro-actions">
                <button
                  type="button"
                  className="settings-network-btn"
                  data-testid="macros-bed-intro-cancel"
                  onClick={handleBedScrewGuideIntroClose}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="settings-network-btn settings-network-btn-primary"
                  data-testid="macros-bed-intro-next"
                  onClick={handleBedScrewGuideIntroConfirm}
                >
                  Далее
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {selectedPrintFile !== null ? (
          <PrintFileModal
            file={selectedPrintFile}
            notice={fileStartNotice}
            isBusy={isBusy}
            pendingCommand={pendingCommand}
            isStartBlocked={printStartBlockReason !== null}
            onClose={closeFileModal}
            onStart={() => void handleStartSelectedFile()}
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
                  onClick={() => void handleStopConfirm()}
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
