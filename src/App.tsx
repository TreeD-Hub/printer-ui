import { type ChangeEvent, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getTreeDCommandBlockReason,
  getTreeDCommandCatalogItem,
  usePrinterCommands,
  type ExecuteCommandArgs,
  type PrinterCommandId,
} from './core/commands'
import { usePrinterSnapshot } from './core/store/usePrinterSnapshot'
import { DashboardPage, type DashboardIdleWidgetId, type DashboardTuneGroupId } from './dashboard/DashboardPage'
import { DashboardStatusDock } from './dashboard/DashboardStatusDock'
import {
  BABYSTEP_STEP_OPTIONS,
  BOTTOM_NAV_ITEMS,
  DASHBOARD_VALUES,
  PROCESS_METRIC_DEFINITIONS,
  QUICK_METRIC_DEFINITIONS,
  type ScreenId,
  TEMPERATURE_METRIC_DEFINITIONS,
  TOP_STATUS_BUTTONS,
  type TopStatusButtonId,
} from './dashboard/config'
import { usePrinterDisplayStatus } from './dashboard/usePrinterDisplayStatus'
import {
  clampPercent,
  rounded,
  statusLabel,
} from './dashboard/helpers'
import {
  ControlPage,
  type ControlGroupId,
  type HeatingCommandBlockReasons,
  type MovementCommandBlockReasons,
  type MoveStepKey,
  type MovementMode,
  type ParkingMode,
  type TemperatureKeyboardTarget,
} from './control'
import {
  HorizontalSteppedSlider,
  NavItemButton,
  SegmentedToggle,
  SettingsSidebarMenu,
  SettingsVirtualKeyboard,
  type SettingsMenuOption,
  type VirtualKeyboardLanguage,
  TemperatureTrendChart,
  TuneCompactStepperInput,
  TuneModeToggle,
  TuneNumberControl,
  type AxisId,
} from './ui'
import { FilesPage, PrintFileModal } from './files'
import {
  DEFAULT_SELECTED_WIFI_NETWORK_ID,
  DEFAULT_TIMEZONE_OPTION,
  LANGUAGE_OPTIONS,
  SETTINGS_NOTIFICATION_HISTORY,
  SettingsPage,
  SLEEP_MODE_OPTIONS,
  TIMEZONE_OPTIONS,
  UPDATE_AVAILABLE_VERSION,
  WIFI_NETWORK_LIBRARY,
  type SettingsGroupId,
  type SettingsNotificationItem,
  type WifiNetworkItem,
} from './settings'
import { PRINT_FILE_LIBRARY, type PrintFileItem } from './printFiles'
import type { PrinterConnectionState } from './core/transport/types'
import treeDLogoAsset from './assets/logo_treeD-28.svg'
import './App.css'

const DEFAULT_SCREEN: ScreenId = 'dashboard'
const CLOUD_LINK_URL = 'https://treed.pro'
const CLOUD_QR_IMAGE_URL = 'https://api.qrserver.com/v1/create-qr-code/?size=144x144&data=https%3A%2F%2Ftreed.pro'
const TOP_POPUP_MAX_WIDTH = 360
const TOP_POPUP_GAP = 8
const TOP_POPUP_SIDE_PADDING = 8
const TOP_POPUP_ARROW_EDGE = 18
const FALLBACK_SCREEN_WIDTH = 960
const TOP_BAR_BUTTON_SIZE = 56
const TOP_BAR_BUTTON_GAP = 8
const TOP_BAR_RIGHT_PADDING = 24
const IDLE_WIDGET_DRAG_HOLD_MS = 3000
const PRINT_CANCEL_MODAL_TITLE_ID = 'print-cancel-modal-title'
const PRINT_TUNE_MODAL_TITLE_ID = 'print-tune-modal-title'
type MacrosGroupId = 'bedMesh'
type IdleWidgetId = DashboardIdleWidgetId
type BedCalibrationStage = 'launch' | 'manual' | 'zOffset'
type ActivePrintUiState = 'printing' | 'paused'
type PrintTuneNumericKeyboardTarget = 'volumetricFlow' | 'flow' | 'speed' | 'accel' | 'kFactor' | 'retract' | 'layers'
type PrintTuneGroupId = DashboardTuneGroupId
type TemperatureChartMode = 'nozzle' | 'bed' | 'both'
type KeyboardTarget = 'idleNotes' | 'wifiSearch' | 'wifiPassword' | 'consoleCommand'
type BedScrewPointId = 'front-left' | 'front-right' | 'rear-right' | 'rear-left' | 'center'
type BedScrewPoint = {
  id: BedScrewPointId
  label: string
  xMm: number
  yMm: number
  mapX: number
  mapY: number
}
const TOP_BAR_POPUP_TITLES: Record<TopStatusButtonId, string> = {
  wifi: 'Состояние Wi-Fi',
  cloud: 'Состояние облака',
  notifications: 'Уведомления',
  power: 'Питание и перезапуск',
}
const POWER_MENU_ACTIONS: Array<{
  command: Extract<PrinterCommandId, 'shutdownHost' | 'rebootHost' | 'restartKlipper' | 'firmwareRestart' | 'restartMoonraker'>
  label: string
  details: string
  tone?: 'default' | 'danger'
}> = [
  {
    command: 'restartKlipper',
    label: 'Restart Klipper',
    details: 'Перезапустить Klipper без перезагрузки host.',
  },
  {
    command: 'firmwareRestart',
    label: 'Firmware restart',
    details: 'Перезапустить прошивки MCU через Klipper.',
  },
  {
    command: 'restartMoonraker',
    label: 'Restart Moonraker',
    details: 'Перезапустить Moonraker API.',
  },
  {
    command: 'rebootHost',
    label: 'Перезагрузить host',
    details: 'Полная перезагрузка Linux-хоста принтера.',
    tone: 'danger',
  },
  {
    command: 'shutdownHost',
    label: 'Выключить host',
    details: 'Остановить host. Для включения может потребоваться физический доступ.',
    tone: 'danger',
  },
]
type TopPopupPosition = {
  top: number
  left: number
  arrowLeft: number
}

const PRINT_TUNE_GROUP_META: Record<PrintTuneGroupId, { label: string; note: string }> = {
  nozzle: {
    label: 'Температуры',
    note: '',
  },
  bed: {
    label: 'Температуры',
    note: '',
  },
  volumetricFlow: {
    label: 'Объемный расход',
    note: 'Настройте лимит объемного расхода.',
  },
  fan: {
    label: 'Обдув',
    note: 'Настройте обдув модели.',
  },
  flow: {
    label: 'Поток',
    note: 'Настройте поток экструдера.',
  },
  speed: {
    label: 'Скорость',
    note: 'Настройте скорость печати.',
  },
  accel: {
    label: 'Ускорение',
    note: 'Настройте ускорение печати.',
  },
  kFactor: {
    label: 'K-factor',
    note: 'Настройте pressure advance (K-factor).',
  },
  retract: {
    label: 'Откат',
    note: 'Настройте параметры отката.',
  },
  progress: {
    label: 'Прогресс печати',
    note: 'Проверьте прогресс и скорректируйте расчетное время завершения.',
  },
  layers: {
    label: 'Слой',
    note: 'Задайте слой, на котором нужно поставить печать на паузу.',
  },
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
const DEFAULT_NOZZLE_TARGET_TEMP = TEMPERATURE_METRIC_DEFINITIONS.find((item) => item.key === 'nozzle')?.target ?? 220
const DEFAULT_BED_TARGET_TEMP = TEMPERATURE_METRIC_DEFINITIONS.find((item) => item.key === 'bed')?.target ?? 60
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

function formatTuneKeyboardValue(value: number, fractionDigits: number): string {
  if (fractionDigits <= 0) {
    return String(Math.round(value))
  }

  return value
    .toFixed(fractionDigits)
    .replace(/\.?0+$/, '')
}

function formatAxisCoordinate(value: number): string {
  return value.toFixed(1)
}

function shiftTimeLabelByMinutes(timeLabel: string, offsetMinutes: number): string {
  const parts = timeLabel.split(':')
  if (parts.length !== 2) {
    return timeLabel
  }

  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return timeLabel
  }

  const sourceDate = new Date()
  sourceDate.setHours(hours, minutes, 0, 0)
  sourceDate.setMinutes(sourceDate.getMinutes() + Math.round(offsetMinutes))

  const nextHours = String(sourceDate.getHours()).padStart(2, '0')
  const nextMinutes = String(sourceDate.getMinutes()).padStart(2, '0')
  return `${nextHours}:${nextMinutes}`
}

function resolveFallbackAnchorCenterX(id: TopStatusButtonId, screenWidth: number): number {
  const buttonIndex = TOP_STATUS_BUTTONS.findIndex((item) => item.id === id)
  const buttonsFromRight = TOP_STATUS_BUTTONS.length - 1 - Math.max(0, buttonIndex)
  return (
    screenWidth -
    TOP_BAR_RIGHT_PADDING -
    (TOP_BAR_BUTTON_SIZE / 2) -
    (buttonsFromRight * (TOP_BAR_BUTTON_SIZE + TOP_BAR_BUTTON_GAP))
  )
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
  const topButtonRefs = useRef<Record<TopStatusButtonId, HTMLButtonElement | null>>({
    wifi: null,
    cloud: null,
    notifications: null,
    power: null,
  })
  const [babystepStep, setBabystepStep] = useState<number>(BABYSTEP_STEP_OPTIONS[1])
  const [activeTopPopup, setActiveTopPopup] = useState<TopStatusButtonId | null>(null)
  const [lastReadPrinterNotificationId, setLastReadPrinterNotificationId] = useState<string | null>(null)
  const [powerPopupNotice, setPowerPopupNotice] = useState<string>('')
  const [armedPowerCommand, setArmedPowerCommand] = useState<PrinterCommandId | null>(null)
  const [topPopupPosition, setTopPopupPosition] = useState<TopPopupPosition | null>(null)
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
  const [activePrintTuneGroup, setActivePrintTuneGroup] = useState<PrintTuneGroupId | null>(null)
  const [printNozzleTargetTemp, setPrintNozzleTargetTemp] = useState<number>(DEFAULT_NOZZLE_TARGET_TEMP)
  const [printBedTargetTemp, setPrintBedTargetTemp] = useState<number>(DEFAULT_BED_TARGET_TEMP)
  const [printVolumetricFlowMm3S, setPrintVolumetricFlowMm3S] = useState<number>(DASHBOARD_VALUES.volumetricFlowMm3S)
  const [printFanPercent, setPrintFanPercent] = useState<number>(Math.round(snapshot.modelFanPercent))
  const [printFlowPercent, setPrintFlowPercent] = useState<number>(DASHBOARD_VALUES.flowPercent)
  const [printSpeedMmS, setPrintSpeedMmS] = useState<number>(DASHBOARD_VALUES.speedMmS)
  const [printAccelMmS2, setPrintAccelMmS2] = useState<number>(DASHBOARD_VALUES.accelMmS2)
  const [printKFactor, setPrintKFactor] = useState<number>(DASHBOARD_VALUES.kFactorLaPa)
  const [printRetractMm, setPrintRetractMm] = useState<number>(DASHBOARD_VALUES.retractMm)
  const [printProgressOffsetMin, setPrintProgressOffsetMin] = useState<number>(0)
  const [pauseAtLayer, setPauseAtLayer] = useState<number>(Math.max(1, DASHBOARD_VALUES.layerCurrent + 5))
  const [temperatureChartMode, setTemperatureChartMode] = useState<TemperatureChartMode>('both')
  const [temperatureKeyboardTarget, setTemperatureKeyboardTarget] = useState<TemperatureKeyboardTarget | null>(null)
  const [temperatureKeyboardValue, setTemperatureKeyboardValue] = useState<string>('')
  const [printTuneKeyboardTarget, setPrintTuneKeyboardTarget] = useState<PrintTuneNumericKeyboardTarget | null>(null)
  const [printTuneKeyboardValue, setPrintTuneKeyboardValue] = useState<string>('')
  const [idleNotesText, setIdleNotesText] = useState<string>(IDLE_NOTES_DEFAULT_TEXT)
  const [activeKeyboardTarget, setActiveKeyboardTarget] = useState<KeyboardTarget | null>(null)
  const [keyboardLanguage, setKeyboardLanguage] = useState<VirtualKeyboardLanguage>('ru')
  const [isKeyboardCapsEnabled, setIsKeyboardCapsEnabled] = useState<boolean>(false)
  const [activeSettingsGroup, setActiveSettingsGroup] = useState<SettingsGroupId>('system')
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
  const [isDarkThemeEnabled, setIsDarkThemeEnabled] = useState<boolean>(true)
  const [isMaxPerformanceModeEnabled, setIsMaxPerformanceModeEnabled] = useState<boolean>(false)
  const [sleepModeValue, setSleepModeValue] = useState<string>(SLEEP_MODE_OPTIONS[2])
  const [timezoneValue, setTimezoneValue] = useState<string>(
    TIMEZONE_OPTIONS.find((option) => option === DEFAULT_TIMEZONE_OPTION) ?? TIMEZONE_OPTIONS[0],
  )
  const [languageValue, setLanguageValue] = useState<string>(LANGUAGE_OPTIONS[0])
  const [isExternalVoiceEnabled, setIsExternalVoiceEnabled] = useState<boolean>(false)
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState<boolean>(true)
  const [isNotificationSoundsEnabled, setIsNotificationSoundsEnabled] = useState<boolean>(true)
  const [notificationHistory] = useState<SettingsNotificationItem[]>(SETTINGS_NOTIFICATION_HISTORY)
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false)
  const [isCloudAiMonitoringEnabled, setIsCloudAiMonitoringEnabled] = useState<boolean>(false)
  const [cloudConnectionNotice, setCloudConnectionNotice] = useState<string>('Сервис облака не подключен.')
  const [isCheckingUpdates, setIsCheckingUpdates] = useState<boolean>(false)
  const [availableUpdateVersion, setAvailableUpdateVersion] = useState<string | null>(null)
  const [updateNotice, setUpdateNotice] = useState<string>('Проверьте наличие новых версий.')
  const [consoleCommandValue, setConsoleCommandValue] = useState<string>('')
  const [consoleHistory, setConsoleHistory] = useState<Array<{ id: string; command: string; createdAt: string }>>([])
  const [consoleNotice, setConsoleNotice] = useState<string>('Введите G-code или макрос и отправьте команду.')
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetworkItem[]>(() => [...WIFI_NETWORK_LIBRARY])
  const [wifiSearchQuery, setWifiSearchQuery] = useState<string>('')
  const [selectedWifiNetworkId, setSelectedWifiNetworkId] = useState<string | null>(DEFAULT_SELECTED_WIFI_NETWORK_ID)
  const [wifiPasswordValue, setWifiPasswordValue] = useState<string>('')
  const [isWifiPasswordVisible, setIsWifiPasswordVisible] = useState<boolean>(false)
  const [wifiConnectionNotice, setWifiConnectionNotice] = useState<string>('')
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
  const wifiSearchInputRef = useRef<HTMLInputElement | null>(null)
  const wifiPasswordInputRef = useRef<HTMLInputElement | null>(null)
  const consoleInputRef = useRef<HTMLTextAreaElement | null>(null)
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
  const activePrintTuneMeta = activePrintTuneGroup === null ? null : PRINT_TUNE_GROUP_META[activePrintTuneGroup]
  const isTemperatureTuneGroup = activePrintTuneGroup === 'nozzle' || activePrintTuneGroup === 'bed'
  const isCompactTuneKeyboardOpen = !isTemperatureTuneGroup && printTuneKeyboardTarget !== null
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
  const isNetworkCapabilityAvailable = snapshot.capabilities.network
  const isCloudCapabilityAvailable = snapshot.capabilities.cloud
  const isUpdatesCapabilityAvailable = snapshot.capabilities.updates
  const powerMenuActions = POWER_MENU_ACTIONS.map((action) => ({
    ...action,
    blockReason: getCommandBlockReason(action.command),
  }))
  const networkCapabilityNotice = isNetworkCapabilityAvailable
    ? 'Выберите сеть и выполните подключение.'
    : 'Недоступно: Moonraker/V2 Wi-Fi capability не подтвержден.'
  const cloudStatusLabel = isCloudCapabilityAvailable && snapshot.connection === 'online' ? 'В сети' : 'Недоступно'
  const cloudCapabilityNotice = isCloudCapabilityAvailable
    ? cloudConnectionNotice
    : 'Недоступно: Moonraker/V2 cloud capability не подтвержден.'
  const updateCapabilityNotice = isUpdatesCapabilityAvailable
    ? updateNotice
    : 'Недоступно: Moonraker/V2 update capability не подтвержден.'
  const dashboardTemperatureTargets = useMemo(
    () => ({
      nozzle: printNozzleTargetTemp,
      bed: printBedTargetTemp,
    }),
    [printBedTargetTemp, printNozzleTargetTemp],
  )
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
  const hasUnreadPrinterNotification =
    currentPrinterNotificationId !== null &&
    currentPrinterNotificationId !== lastReadPrinterNotificationId
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
  const heatingCommandBlockReasons = useMemo<HeatingCommandBlockReasons>(() => ({
    nozzleTarget: getCommandBlockReason('setNozzleTarget'),
    bedTarget: getCommandBlockReason('setBedTarget'),
    turnOffHeaters: getCommandBlockReason('turnOffHeaters'),
  }), [getCommandBlockReason])
  const fanCommandBlockReason = getCommandBlockReason('setFanPercent')
  const idleHeroStatusLabel = printerDisplayStatus.label
  const effectiveFilesLibrary = snapshot.source === 'live' ? snapshot.printFiles : filesLibrary
  const selectedPrintFile = useMemo(() => {
    if (selectedFileId === null) {
      return null
    }

    return effectiveFilesLibrary.find((item) => item.id === selectedFileId) ?? null
  }, [effectiveFilesLibrary, selectedFileId])
  const selectedWifiNetwork = useMemo(() => {
    if (selectedWifiNetworkId === null) {
      return null
    }

    return wifiNetworks.find((item) => item.id === selectedWifiNetworkId) ?? null
  }, [selectedWifiNetworkId, wifiNetworks])
  const filteredWifiNetworks = useMemo(() => {
    const normalizedQuery = wifiSearchQuery.trim().toLocaleLowerCase('ru-RU')
    const nextItems = wifiNetworks
      .filter((item) => item.ssid.toLocaleLowerCase('ru-RU').includes(normalizedQuery))
      .sort((left, right) => {
        if (left.connected !== right.connected) {
          return left.connected ? -1 : 1
        }
        return right.signalPercent - left.signalPercent
      })

    return nextItems
  }, [wifiNetworks, wifiSearchQuery])
  const connectedWifiNetwork = useMemo(
    () => wifiNetworks.find((item) => item.connected) ?? null,
    [wifiNetworks],
  )
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
  const activeSettingsKeyboardTarget = activeKeyboardTarget === 'idleNotes' ? 'consoleCommand' : activeKeyboardTarget
  const isConsoleSettingsKeyboardOpen = activeKeyboardTarget === 'idleNotes' || activeKeyboardTarget === 'consoleCommand'
  const settingsKeyboardValue = activeKeyboardTarget === 'idleNotes'
    ? idleNotesText
    : activeKeyboardTarget === 'wifiPassword'
      ? wifiPasswordValue
      : consoleCommandValue
  const settingsKeyboardLabel = activeSettingsKeyboardTarget === 'wifiPassword' ? 'Ввод пароля' : 'Ввод команды'
  const settingsKeyboardPlaceholder = activeSettingsKeyboardTarget === 'wifiPassword' ? 'Введите пароль...' : 'Введите команду...'
  const settingsKeyboardTestId = activeSettingsKeyboardTarget === 'wifiPassword' ? 'settings-wifi-keyboard' : 'settings-console-keyboard'
  const settingsKeyboardPreviewTestId = activeSettingsKeyboardTarget === 'wifiPassword'
    ? 'settings-wifi-keyboard-preview'
    : 'settings-console-keyboard-preview'
  const keyboardLabel = activeKeyboardTarget === 'idleNotes' ? 'Ввод заметок' : settingsKeyboardLabel
  const keyboardPlaceholder = activeKeyboardTarget === 'idleNotes' ? 'Введите заметку...' : settingsKeyboardPlaceholder
  const keyboardTestId = activeKeyboardTarget === 'idleNotes' ? 'idle-notes-keyboard' : settingsKeyboardTestId
  const keyboardPreviewTestId = activeKeyboardTarget === 'idleNotes'
    ? 'idle-notes-keyboard-preview'
    : settingsKeyboardPreviewTestId
  const keyboardDialogValue = activeKeyboardTarget === 'wifiSearch' ? wifiSearchQuery : settingsKeyboardValue
  const keyboardDialogLabel = activeKeyboardTarget === 'wifiSearch' ? 'Ввод имени сети' : keyboardLabel
  const keyboardDialogPlaceholder = activeKeyboardTarget === 'wifiSearch' ? 'Введите имя сети...' : keyboardPlaceholder
  const keyboardDialogTestId = activeKeyboardTarget === 'wifiSearch' ? 'settings-wifi-search-keyboard' : keyboardTestId
  const keyboardDialogPreviewTestId = activeKeyboardTarget === 'wifiSearch'
    ? 'settings-wifi-search-keyboard-preview'
    : keyboardPreviewTestId

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

  const quickMetricValueByKey = {
    volumetricFlow: printVolumetricFlowMm3S,
    fan: printFanPercent,
    flow: printFlowPercent,
  } as const

  const quickMetrics = QUICK_METRIC_DEFINITIONS.map((definition) => ({
    ...definition,
    value: quickMetricValueByKey[definition.key],
  }))

  const processMetricValueByKey = {
    speed: printSpeedMmS,
    accel: printAccelMmS2,
    kFactor: printKFactor,
    retract: printRetractMm,
  } as const

  const processMetrics = PROCESS_METRIC_DEFINITIONS.map((definition) => ({
    ...definition,
    value: processMetricValueByKey[definition.key],
  }))
  const adjustedEtaTime = useMemo(
    () => shiftTimeLabelByMinutes(DASHBOARD_VALUES.etaTime, printProgressOffsetMin),
    [printProgressOffsetMin],
  )
  const nozzleTrendValues = useMemo(
    () => Array.from({ length: 24 }, (_, index) => {
      const ratio = (index + 1) / 24
      const wave = Math.sin((index / 4.2) + 0.7) * 2.2
      const projected = snapshot.extruderTemp + ((printNozzleTargetTemp - snapshot.extruderTemp) * ratio)
      return clampAxisValue(projected + wave, 0, Math.max(printNozzleTargetTemp + 8, 230))
    }),
    [printNozzleTargetTemp, snapshot.extruderTemp],
  )
  const bedTrendValues = useMemo(
    () => Array.from({ length: 24 }, (_, index) => {
      const ratio = (index + 1) / 24
      const wave = Math.cos((index / 5.1) + 0.4) * 1.6
      const projected = snapshot.bedTemp + ((printBedTargetTemp - snapshot.bedTemp) * ratio)
      return clampAxisValue(projected + wave, 0, Math.max(printBedTargetTemp + 6, 90))
    }),
    [printBedTargetTemp, snapshot.bedTemp],
  )
  const temperatureChartSeries = useMemo(
    () => [
      {
        id: 'nozzle' as const,
        label: 'Сопло',
        tone: 'orange' as const,
        values: nozzleTrendValues,
        target: printNozzleTargetTemp,
      },
      {
        id: 'bed' as const,
        label: 'Стол',
        tone: 'green' as const,
        values: bedTrendValues,
        target: printBedTargetTemp,
      },
    ],
    [bedTrendValues, nozzleTrendValues, printBedTargetTemp, printNozzleTargetTemp],
  )
  const heatingControlRows = [
    {
      id: 'nozzle' as const,
      keyboardTarget: 'nozzle' as const,
      icon: 'metricNozzle' as const,
      uiLabel: 'Сопло',
      tone: 'orange' as const,
      current: snapshot.extruderTemp,
      target: printNozzleTargetTemp,
      onTargetChange: setPrintNozzleTargetTemp,
      testIdPrefix: 'control-heating-nozzle',
    },
    {
      id: 'bed' as const,
      keyboardTarget: 'bed' as const,
      icon: 'metricBed' as const,
      uiLabel: 'Стол',
      tone: 'green' as const,
      current: snapshot.bedTemp,
      target: printBedTargetTemp,
      onTargetChange: setPrintBedTargetTemp,
      testIdPrefix: 'control-heating-bed',
    },
  ]

  const closeTopPopup = useCallback(() => {
    setActiveTopPopup(null)
    setTopPopupPosition(null)
  }, [])

  const resolveTopPopupPosition = useCallback((id: TopStatusButtonId): TopPopupPosition => {
    const shellElement = screenShellRef.current
    const anchorButton = topButtonRefs.current[id]
    const shellRect = shellElement?.getBoundingClientRect()
    const anchorRect = anchorButton?.getBoundingClientRect()
    const shellWidth = shellRect && shellRect.width > 0 ? shellRect.width : FALLBACK_SCREEN_WIDTH
    const popupWidth = Math.min(TOP_POPUP_MAX_WIDTH, shellWidth - (TOP_POPUP_SIDE_PADDING * 2))

    const anchorCenterX =
      shellRect && anchorRect && shellRect.width > 0 && anchorRect.width > 0
        ? anchorRect.left - shellRect.left + (anchorRect.width / 2)
        : resolveFallbackAnchorCenterX(id, shellWidth)
    const anchorBottomY =
      shellRect && anchorRect && shellRect.height > 0 && anchorRect.height > 0
        ? anchorRect.bottom - shellRect.top
        : 0

    let left = anchorCenterX - (popupWidth / 2)
    left = Math.max(TOP_POPUP_SIDE_PADDING, Math.min(left, shellWidth - popupWidth - TOP_POPUP_SIDE_PADDING))

    const arrowLeft = Math.max(
      TOP_POPUP_ARROW_EDGE,
      Math.min(anchorCenterX - left, popupWidth - TOP_POPUP_ARROW_EDGE),
    )

    return {
      top: Math.max(TOP_POPUP_GAP, anchorBottomY + TOP_POPUP_GAP),
      left,
      arrowLeft,
    }
  }, [])

  const openTopPopup = useCallback(
    (id: TopStatusButtonId) => {
      if (activeTopPopup === id) {
        closeTopPopup()
        return
      }
      setPowerPopupNotice('')
      setArmedPowerCommand(null)
      setTopPopupPosition(resolveTopPopupPosition(id))
      setActiveTopPopup(id)
    },
    [activeTopPopup, closeTopPopup, resolveTopPopupPosition],
  )

  const setTopButtonRef = useCallback((id: TopStatusButtonId, node: HTMLButtonElement | null): void => {
    topButtonRefs.current[id] = node
  }, [])

  const openWifiSettings = useCallback(() => {
    setActiveSettingsGroup('network')
    setActiveScreen('settings')
    closeTopPopup()
  }, [closeTopPopup])

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

  const setKeyboardCaret = useCallback((target: KeyboardTarget, nextCaret: number) => {
    if (typeof window === 'undefined') {
      return
    }

    window.requestAnimationFrame(() => {
      const input = target === 'idleNotes'
        ? idleNotesInputRef.current
        : target === 'wifiSearch'
          ? wifiSearchInputRef.current
        : target === 'wifiPassword'
          ? wifiPasswordInputRef.current
          : consoleInputRef.current
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

  function handleWifiSearchQueryChange(event: ChangeEvent<HTMLInputElement>): void {
    setWifiSearchQuery(event.target.value)
  }

  function handleWifiSearchInputFocus(): void {
    setActiveKeyboardTarget('wifiSearch')
  }

  function handleWifiScan(): void {
    setWifiNetworks((current) => current.map((item, index) => ({
      ...item,
      signalPercent: clampAxisValue(item.signalPercent + (index % 2 === 0 ? 3 : -2), 18, 100),
    })))
    setWifiConnectionNotice('Список Wi-Fi сетей обновлен.')
  }

  function handleWifiNetworkSelect(networkId: string): void {
    setSelectedWifiNetworkId(networkId)
    setWifiConnectionNotice('')
    setWifiPasswordValue('')
    setIsWifiPasswordVisible(false)
  }

  function handleWifiPasswordChange(event: ChangeEvent<HTMLInputElement>): void {
    setWifiPasswordValue(event.target.value)
  }

  function handleWifiPasswordVisibilityToggle(): void {
    setIsWifiPasswordVisible((prevValue) => !prevValue)
  }

  function handleWifiConnect(): void {
    if (selectedWifiNetwork === null) {
      return
    }

    if (selectedWifiNetwork.security !== 'open' && wifiPasswordValue.trim().length < 8) {
      setWifiConnectionNotice('Введите пароль (минимум 8 символов).')
      return
    }

    setWifiNetworks((current) => current.map((item) => {
      if (item.id === selectedWifiNetwork.id) {
        return {
          ...item,
          connected: true,
          saved: true,
        }
      }

      return {
        ...item,
        connected: false,
      }
    }))

    setWifiConnectionNotice(`Подключено к ${selectedWifiNetwork.ssid}.`)
    setWifiPasswordValue('')
    setIsWifiPasswordVisible(false)
  }

  function handleWifiForgetSelected(): void {
    if (selectedWifiNetwork === null) {
      return
    }

    setWifiNetworks((current) => current.map((item) => {
      if (item.id !== selectedWifiNetwork.id) {
        return item
      }

      return {
        ...item,
        connected: false,
        saved: false,
      }
    }))
    setWifiConnectionNotice(`Сеть ${selectedWifiNetwork.ssid} удалена из сохраненных.`)
    setWifiPasswordValue('')
    setIsWifiPasswordVisible(false)
  }

  function handleCloudConnectionToggle(): void {
    setIsCloudConnected((prevValue) => {
      const nextValue = !prevValue
      setCloudConnectionNotice(
        nextValue
          ? 'Подключение к сервису AI-контроля ошибок активно.'
          : 'Сервис облака отключен.',
      )
      if (!nextValue) {
        setIsCloudAiMonitoringEnabled(false)
      }
      return nextValue
    })
  }

  function handleCloudAiMonitoringToggle(nextValue: boolean): void {
    if (!isCloudConnected) {
      setCloudConnectionNotice('Сначала подключите облачный сервис.')
      return
    }
    setIsCloudAiMonitoringEnabled(nextValue)
  }

  function handleCheckUpdates(): void {
    setIsCheckingUpdates(true)
    setAvailableUpdateVersion(UPDATE_AVAILABLE_VERSION)
    setUpdateNotice(`Доступна версия ${UPDATE_AVAILABLE_VERSION}.`)
    setIsCheckingUpdates(false)
  }

  function handleConsoleInputChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    setConsoleCommandValue(event.target.value)
  }

  const handleConsoleKeyboardOpen = useCallback(() => {
    setActiveKeyboardTarget('consoleCommand')
  }, [])

  function handleWifiPasswordInputFocus(): void {
    setActiveKeyboardTarget('wifiPassword')
  }

  function handleConsoleQuickCommandInsert(command: string): void {
    setConsoleCommandValue(command)
    setConsoleNotice(`Команда подготовлена: ${command}`)
    setActiveKeyboardTarget('consoleCommand')
    setKeyboardCaret('consoleCommand', command.length)
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

    if (key === 'close') {
      setActiveKeyboardTarget(null)
      return
    }

    const input = activeKeyboardTarget === 'idleNotes'
      ? idleNotesInputRef.current
      : activeKeyboardTarget === 'wifiSearch'
        ? wifiSearchInputRef.current
      : activeKeyboardTarget === 'wifiPassword'
        ? wifiPasswordInputRef.current
        : consoleInputRef.current
    const currentValue = activeKeyboardTarget === 'idleNotes'
      ? idleNotesText
      : activeKeyboardTarget === 'wifiSearch'
        ? wifiSearchQuery
      : activeKeyboardTarget === 'wifiPassword'
        ? wifiPasswordValue
        : consoleCommandValue
    const selectionStart = input?.selectionStart ?? currentValue.length
    const selectionEnd = input?.selectionEnd ?? currentValue.length
    let nextValue = currentValue
    let nextCaret = selectionStart
    const isMultilineTarget = activeKeyboardTarget === 'idleNotes' || activeKeyboardTarget === 'consoleCommand'

    if (key === 'enter' && !isMultilineTarget) {
      setActiveKeyboardTarget(null)
      return
    }

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
      setKeyboardCaret(activeKeyboardTarget, nextCaret)
      return
    }

    if (activeKeyboardTarget === 'idleNotes') {
      setIdleNotesText(nextValue)
    } else if (activeKeyboardTarget === 'wifiSearch') {
      setWifiSearchQuery(nextValue)
    } else if (activeKeyboardTarget === 'consoleCommand') {
      setConsoleCommandValue(nextValue)
    } else {
      setWifiPasswordValue(nextValue)
    }
    setKeyboardCaret(activeKeyboardTarget, nextCaret)
  }, [activeKeyboardTarget, consoleCommandValue, idleNotesText, setKeyboardCaret, wifiPasswordValue, wifiSearchQuery])
  const isIdleNotesKeyboardOpen = activeKeyboardTarget === 'idleNotes'
  const handleIdleNotesKeyboardClose = handleKeyboardClose
  const handleIdleNotesKeyMouseDown = handleVirtualKeyboardKeyMouseDown
  const handleIdleNotesVirtualKey = handleVirtualKeyboardKey

  function handleConsoleSubmit(): void {
    const consoleBlockReason = getCommandBlockReason('consoleGcode')
    if (consoleBlockReason !== null) {
      setConsoleNotice(consoleBlockReason)
      return
    }

    const trimmed = consoleCommandValue.trim()
    if (trimmed.length === 0) {
      setConsoleNotice('Введите команду перед отправкой.')
      return
    }

    const now = new Date().toLocaleTimeString('ru-RU')
    setConsoleHistory((current) => [
      {
        id: `${Date.now()}-${current.length}`,
        command: trimmed,
        createdAt: now,
      },
      ...current,
    ])
    setConsoleNotice(`Команда отправлена: ${trimmed}`)
    setConsoleCommandValue('')
    void executeCommand({ command: 'consoleGcode', gcode: trimmed }).then((ok) => {
      if (!ok) {
        setConsoleNotice(`Команда не выполнена: ${trimmed}`)
      }
    })
  }

  useEffect(() => {
    if (activeScreen !== 'dashboard' && activeTopPopup !== null) {
      closeTopPopup()
    }
  }, [activeScreen, activeTopPopup, closeTopPopup])

  useEffect(() => {
    if (activeTopPopup === 'notifications' && currentPrinterNotificationId !== null) {
      setLastReadPrinterNotificationId(currentPrinterNotificationId)
    }
  }, [activeTopPopup, currentPrinterNotificationId])

  useEffect(() => {
    if (currentPrinterNotificationId === null && lastReadPrinterNotificationId !== null) {
      setLastReadPrinterNotificationId(null)
    }
  }, [currentPrinterNotificationId, lastReadPrinterNotificationId])

  useEffect(() => {
    if (activeTopPopup === null || typeof window === 'undefined') {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTopPopup()
      }
    }

    const handleResize = () => {
      setTopPopupPosition(resolveTopPopupPosition(activeTopPopup))
    }

    window.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', handleResize)
    }
  }, [activeTopPopup, closeTopPopup, resolveTopPopupPosition])

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

    if ((activeKeyboardTarget === 'wifiSearch' || activeKeyboardTarget === 'wifiPassword') && activeSettingsGroup !== 'network') {
      setActiveKeyboardTarget(null)
    }

    if (activeKeyboardTarget === 'consoleCommand' && activeSettingsGroup !== 'console') {
      setActiveKeyboardTarget(null)
    }
  }, [activeKeyboardTarget, activeScreen, activeSettingsGroup, hasActivePrint])

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

  async function handlePowerMenuAction(command: (typeof POWER_MENU_ACTIONS)[number]['command']): Promise<void> {
    const action = POWER_MENU_ACTIONS.find((item) => item.command === command)
    const blockReason = getCommandBlockReason(command)

    if (blockReason !== null) {
      setPowerPopupNotice(blockReason)
      setArmedPowerCommand(null)
      return
    }

    if (requiresCommandConfirmation(command) && armedPowerCommand !== command) {
      setArmedPowerCommand(command)
      setPowerPopupNotice(`Подтвердите действие повторным нажатием: ${action?.label ?? command}.`)
      return
    }

    const ok = await executeCommand({ command })
    setArmedPowerCommand(null)
    if (ok) {
      setPowerPopupNotice(`Команда отправлена: ${action?.label ?? command}.`)
      void refresh()
    }
  }

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
    }

    setActivePrintTuneGroup(groupId)
  }, [])

  function handlePrintTuneGroupClose(): void {
    setActivePrintTuneGroup(null)
    setTemperatureChartMode('both')
    closeTemperatureKeyboard()
    closePrintTuneKeyboard()
  }

  function handlePrintTuneApply(): void {
    handlePrintTuneGroupClose()
  }

  function setTemperatureTargetValue(target: TemperatureKeyboardTarget, value: number): void {
    if (target === 'nozzle') {
      setPrintNozzleTargetTemp(value)
      return
    }

    setPrintBedTargetTemp(value)
  }

  function openTemperatureKeyboard(target: TemperatureKeyboardTarget): void {
    closePrintTuneKeyboard()
    setTemperatureKeyboardTarget(target)
    setTemperatureKeyboardValue('')
  }

  function closeTemperatureKeyboard(): void {
    setTemperatureKeyboardTarget(null)
    setTemperatureKeyboardValue('')
  }

  function handleTemperatureKeyboardDigit(digit: string): void {
    setTemperatureKeyboardValue((current) => {
      const next = `${current}${digit}`.replace(/^0+(?=\d)/, '')
      return next.slice(0, 3)
    })
  }

  function handleTemperatureKeyboardBackspace(): void {
    setTemperatureKeyboardValue((current) => current.slice(0, -1))
  }

  function handleTemperatureKeyboardSubmit(): void {
    if (temperatureKeyboardTarget === null) {
      return
    }

    if (temperatureKeyboardValue.trim().length === 0) {
      return
    }

    const parsed = Number(temperatureKeyboardValue)
    if (Number.isNaN(parsed)) {
      return
    }

    const normalized = Math.round(clampAxisValue(parsed, 0, 300))
    setTemperatureTargetValue(temperatureKeyboardTarget, normalized)
    void executeCommand({
      command: temperatureKeyboardTarget === 'nozzle' ? 'setNozzleTarget' : 'setBedTarget',
      targetCelsius: normalized,
    })
    closeTemperatureKeyboard()
  }

  function handleHeatingPresetApply(nozzle: number, bed: number): void {
    setPrintNozzleTargetTemp(nozzle)
    setPrintBedTargetTemp(bed)
    void executeCommand({ command: 'consoleGcode', gcode: `M104 S${nozzle}\nM140 S${bed}` })
    closeTemperatureKeyboard()
  }

  function handleHeatingDisable(): void {
    setPrintNozzleTargetTemp(0)
    setPrintBedTargetTemp(0)
    void executeCommand({ command: 'turnOffHeaters' })
    closeTemperatureKeyboard()
  }

  function handleFanPercentChange(nextValue: number): void {
    const normalized = Math.round(clampAxisValue(nextValue, 0, 100))
    setPrintFanPercent(normalized)
    void executeCommand({ command: 'setFanPercent', percent: normalized })
  }

  function renderTemperatureKeyboardPanel(className = ''): ReactNode {
    return (
      <aside className={`print-temp-keyboard-side ${className}`.trim()} aria-label="Цифровая клавиатура температуры">
        <div className="print-temp-keyboard-head">
          <p className="print-temp-keyboard-label">Температура</p>
          <button
            type="button"
            className="print-cancel-modal-close print-temp-keyboard-close"
            aria-label="Закрыть клавиатуру температуры"
            onClick={closeTemperatureKeyboard}
          >
            ×
          </button>
        </div>
        <p className="print-temp-keyboard-display">
          {temperatureKeyboardValue}
          {temperatureKeyboardValue.length > 0 ? <span> °C</span> : null}
        </p>
        <div className="print-temp-keyboard-grid">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              className="settings-network-btn print-temp-keyboard-key"
              onClick={() => handleTemperatureKeyboardDigit(digit)}
              aria-label={`Цифра ${digit}`}
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            className="settings-network-btn print-temp-keyboard-key"
            onClick={handleTemperatureKeyboardBackspace}
          >
            Стереть
          </button>
          <button
            type="button"
            className="settings-network-btn print-temp-keyboard-key"
            onClick={() => handleTemperatureKeyboardDigit('0')}
            aria-label="Цифра 0"
          >
            0
          </button>
          <span className="print-temp-keyboard-spacer" aria-hidden="true" />
        </div>
        <button
          type="button"
          className="settings-network-btn settings-network-btn-primary print-temp-keyboard-submit"
          onClick={handleTemperatureKeyboardSubmit}
        >
          Ввод
        </button>
      </aside>
    )
  }

  function resolvePrintTuneKeyboardMeta(target: PrintTuneNumericKeyboardTarget): {
    label: string
    unit: string
    min: number
    max: number
    fractionDigits: number
    allowDecimal: boolean
  } {
    if (target === 'volumetricFlow') {
      return { label: 'Объемный расход', unit: 'мм³/с', min: 1, max: 30, fractionDigits: 1, allowDecimal: true }
    }
    if (target === 'flow') {
      return { label: 'Поток', unit: '%', min: 50, max: 150, fractionDigits: 0, allowDecimal: false }
    }
    if (target === 'speed') {
      return { label: 'Скорость', unit: 'мм/с', min: 30, max: 300, fractionDigits: 0, allowDecimal: false }
    }
    if (target === 'accel') {
      return { label: 'Ускорение', unit: 'мм/с²', min: 500, max: 12000, fractionDigits: 0, allowDecimal: false }
    }
    if (target === 'kFactor') {
      return { label: 'K-factor', unit: '', min: 0, max: 0.2, fractionDigits: 3, allowDecimal: true }
    }
    if (target === 'retract') {
      return { label: 'Откат', unit: 'мм', min: 0, max: 8, fractionDigits: 1, allowDecimal: true }
    }

    return { label: 'Пауза на слое', unit: '', min: 1, max: DASHBOARD_VALUES.layerTotal, fractionDigits: 0, allowDecimal: false }
  }

  function setPrintTuneKeyboardTargetValue(target: PrintTuneNumericKeyboardTarget, value: number): void {
    if (target === 'volumetricFlow') {
      setPrintVolumetricFlowMm3S(value)
      return
    }
    if (target === 'flow') {
      setPrintFlowPercent(value)
      return
    }
    if (target === 'speed') {
      setPrintSpeedMmS(value)
      return
    }
    if (target === 'accel') {
      setPrintAccelMmS2(value)
      return
    }
    if (target === 'kFactor') {
      setPrintKFactor(value)
      return
    }
    if (target === 'retract') {
      setPrintRetractMm(value)
      return
    }

    setPauseAtLayer(Math.round(clampAxisValue(value, 1, DASHBOARD_VALUES.layerTotal)))
  }

  function openPrintTuneKeyboard(target: PrintTuneNumericKeyboardTarget): void {
    closeTemperatureKeyboard()
    setPrintTuneKeyboardTarget(target)
    setPrintTuneKeyboardValue('')
  }

  function closePrintTuneKeyboard(): void {
    setPrintTuneKeyboardTarget(null)
    setPrintTuneKeyboardValue('')
  }

  function handlePrintTuneKeyboardDigit(digit: string): void {
    setPrintTuneKeyboardValue((current) => {
      const nextValue = `${current}${digit}`.replace(/^0+(?=\d)/, '')
      return nextValue.slice(0, 7)
    })
  }

  function handlePrintTuneKeyboardDecimal(): void {
    if (printTuneKeyboardTarget === null) {
      return
    }

    const { allowDecimal } = resolvePrintTuneKeyboardMeta(printTuneKeyboardTarget)
    if (!allowDecimal) {
      return
    }

    setPrintTuneKeyboardValue((current) => {
      if (current.includes('.')) {
        return current
      }
      if (current.length === 0) {
        return '0.'
      }
      return `${current}.`
    })
  }

  function handlePrintTuneKeyboardBackspace(): void {
    setPrintTuneKeyboardValue((current) => current.slice(0, -1))
  }

  function handlePrintTuneKeyboardSubmit(): void {
    if (printTuneKeyboardTarget === null) {
      return
    }

    if (printTuneKeyboardValue.trim().length === 0) {
      return
    }

    const targetMeta = resolvePrintTuneKeyboardMeta(printTuneKeyboardTarget)
    const parsed = Number(printTuneKeyboardValue.replace(',', '.'))
    if (Number.isNaN(parsed)) {
      return
    }

    const normalized = Number(
      clampAxisValue(parsed, targetMeta.min, targetMeta.max)
        .toFixed(targetMeta.fractionDigits),
    )

    setPrintTuneKeyboardTargetValue(printTuneKeyboardTarget, normalized)
    closePrintTuneKeyboard()
  }

  function renderPrintTuneGroupContent(): ReactNode {
    if (activePrintTuneGroup === null || activePrintTuneMeta === null) {
      return null
    }

    if (activePrintTuneGroup === 'nozzle' || activePrintTuneGroup === 'bed') {
      const temperatureRows = [
        {
          id: 'nozzle' as const,
          keyboardTarget: 'nozzle' as const,
          sensorLabel: 'Extruder',
          uiLabel: 'Сопло',
          tone: 'orange' as const,
          current: snapshot.extruderTemp,
          target: printNozzleTargetTemp,
          onTargetChange: setPrintNozzleTargetTemp,
          testIdPrefix: 'print-tune-temp-nozzle',
        },
        {
          id: 'bed' as const,
          keyboardTarget: 'bed' as const,
          sensorLabel: 'Heater Bed',
          uiLabel: 'Стол',
          tone: 'green' as const,
          current: snapshot.bedTemp,
          target: printBedTargetTemp,
          onTargetChange: setPrintBedTargetTemp,
          testIdPrefix: 'print-tune-temp-bed',
        },
      ]
      const chartSeries = temperatureChartSeries.filter((seriesItem) => {
        if (temperatureChartMode === 'both') {
          return true
        }
        return seriesItem.id === temperatureChartMode
      })

      return (
        <div
          className={`print-tune-modal-stack print-tune-modal-stack-temperature ${temperatureKeyboardTarget !== null ? 'is-keyboard-open' : ''}`}
        >
          <div className="print-temp-workspace">
            <section className="print-temp-main-panel">
              <section className="print-temp-table" aria-label="Параметры температуры">
                <header className="print-temp-table-head">
                  <span>Датчик</span>
                  <span>Текущая</span>
                  <span>Заданная</span>
                </header>

                {temperatureRows.map((row) => {
                  const isActiveRow =
                    temperatureChartMode === 'both'
                      ? row.id === activePrintTuneGroup
                      : row.id === temperatureChartMode
                  const displayTargetValue =
                    temperatureKeyboardTarget === row.keyboardTarget
                      ? temperatureKeyboardValue
                      : String(Math.round(row.target))

                  return (
                    <div
                      key={row.id}
                      className={`print-temp-table-row ${isActiveRow ? 'is-active' : ''}`}
                    >
                      <div className="print-temp-table-sensor">
                        <span className={`print-temp-table-marker ${row.tone === 'orange' ? 'is-orange' : 'is-green'}`} />
                        <div className="print-temp-table-sensor-text">
                          <strong>{row.sensorLabel}</strong>
                          <span>{row.uiLabel}</span>
                        </div>
                      </div>
                      <div className="print-temp-table-value">
                        {rounded(row.current)} <span>°C</span>
                      </div>
                      <TuneCompactStepperInput
                        value={row.target}
                        min={0}
                        max={300}
                        step={5}
                        unit="°C"
                        onChange={row.onTargetChange}
                        readOnly={true}
                        displayValue={displayTargetValue}
                        onInputFocus={() => openTemperatureKeyboard(row.keyboardTarget)}
                        inputAriaLabel={`Целевая температура ${row.uiLabel.toLowerCase()}`}
                        testIdPrefix={row.testIdPrefix}
                      />
                    </div>
                  )
                })}
              </section>

              <div className="print-temp-chart-head">
                <p className="print-temp-chart-title">Температуры [°C]</p>
                <TuneModeToggle
                  options={[
                    { id: 'nozzle', label: 'Сопло' },
                    { id: 'bed', label: 'Стол' },
                    { id: 'both', label: 'Общий' },
                  ]}
                  value={temperatureChartMode}
                  onChange={(nextValue) => setTemperatureChartMode(nextValue as TemperatureChartMode)}
                  testIdPrefix="print-tune-temp-chart"
                  layout="compact"
                />
              </div>

              <TemperatureTrendChart
                series={chartSeries}
                testId={activePrintTuneGroup === 'nozzle' ? 'print-tune-chart-nozzle' : 'print-tune-chart-bed'}
              />
            </section>

            {temperatureKeyboardTarget !== null ? renderTemperatureKeyboardPanel() : null}
          </div>
        </div>
      )
    }

    function renderCompactTuneContent(content: ReactNode): ReactNode {
      const activeKeyboardMeta = printTuneKeyboardTarget === null
        ? null
        : resolvePrintTuneKeyboardMeta(printTuneKeyboardTarget)
      const activeTuneNote = activePrintTuneMeta?.note ?? ''

      return (
        <div
          className={`print-tune-modal-stack print-tune-modal-stack-compact ${printTuneKeyboardTarget !== null ? 'is-keyboard-open' : ''}`}
        >
          <div className="print-tune-compact-workspace">
            <section className="print-tune-compact-main-panel">
              {activeTuneNote.length > 0 ? <p className="print-tune-note">{activeTuneNote}</p> : null}
              <div className="print-tune-compact-content">
                {content}
              </div>
            </section>

            {printTuneKeyboardTarget !== null && activeKeyboardMeta !== null ? (
              <aside className="print-temp-keyboard-side is-compact" aria-label="Цифровая клавиатура параметра печати">
                <div className="print-temp-keyboard-head">
                  <p className="print-temp-keyboard-label">{activeKeyboardMeta.label}</p>
                  <button
                    type="button"
                    className="print-cancel-modal-close print-temp-keyboard-close"
                    aria-label="Закрыть клавиатуру параметра печати"
                    onClick={closePrintTuneKeyboard}
                  >
                    ×
                  </button>
                </div>
                <p className="print-temp-keyboard-display">
                  {printTuneKeyboardValue}
                  {printTuneKeyboardValue.length > 0 && activeKeyboardMeta.unit.length > 0 ? <span> {activeKeyboardMeta.unit}</span> : null}
                </p>
                <div className="print-temp-keyboard-grid">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      className="settings-network-btn print-temp-keyboard-key"
                      onClick={() => handlePrintTuneKeyboardDigit(digit)}
                      aria-label={`Цифра ${digit}`}
                      data-testid={`print-tune-keyboard-digit-${digit}`}
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="settings-network-btn print-temp-keyboard-key"
                    onClick={handlePrintTuneKeyboardBackspace}
                    data-testid="print-tune-keyboard-backspace"
                  >
                    Стереть
                  </button>
                  <button
                    type="button"
                    className="settings-network-btn print-temp-keyboard-key"
                    onClick={() => handlePrintTuneKeyboardDigit('0')}
                    aria-label="Цифра 0"
                    data-testid="print-tune-keyboard-digit-0"
                  >
                    0
                  </button>
                  {activeKeyboardMeta.allowDecimal ? (
                    <button
                      type="button"
                      className="settings-network-btn print-temp-keyboard-key"
                      onClick={handlePrintTuneKeyboardDecimal}
                      data-testid="print-tune-keyboard-decimal"
                    >
                      .
                    </button>
                  ) : (
                    <span className="print-temp-keyboard-spacer" aria-hidden="true" />
                  )}
                </div>
                <button
                  type="button"
                  className="settings-network-btn settings-network-btn-primary print-temp-keyboard-submit"
                  onClick={handlePrintTuneKeyboardSubmit}
                  data-testid="print-tune-keyboard-submit"
                >
                  Ввод
                </button>
              </aside>
            ) : null}
          </div>
        </div>
      )
    }

    function renderCompactCurrentRow(label: string, value: string): ReactNode {
      return (
        <p className="print-tune-current-row print-tune-current-row-compact">
          <span>{label}</span>
          <strong>{value}</strong>
        </p>
      )
    }

    function renderCompactTuneEditor({
      label,
      value,
      min,
      max,
      step,
      unit,
      fractionDigits = 0,
      onChange,
      testIdPrefix,
      displayValue,
      onInputFocus,
    }: {
      label: string
      value: number
      min: number
      max: number
      step: number
      unit?: string
      fractionDigits?: number
      onChange: (nextValue: number) => void
      testIdPrefix: string
      displayValue: string
      onInputFocus: () => void
    }): ReactNode {
      return (
        <section className="print-tune-compact-editor">
          <p className="label">{label}</p>
          <TuneCompactStepperInput
            value={value}
            min={min}
            max={max}
            step={step}
            unit={unit}
            fractionDigits={fractionDigits}
            onChange={onChange}
            inputAriaLabel={label}
            testIdPrefix={testIdPrefix}
            displayValue={displayValue}
            readOnly={true}
            onInputFocus={onInputFocus}
          />
        </section>
      )
    }

    if (activePrintTuneGroup === 'volumetricFlow') {
      return renderCompactTuneContent(
        <>
          {renderCompactCurrentRow('Текущее значение', `${formatTuneKeyboardValue(printVolumetricFlowMm3S, 1)} мм³/с`)}
          {renderCompactTuneEditor({
            label: 'Лимит расхода',
            value: printVolumetricFlowMm3S,
            min: 1,
            max: 30,
            step: 0.1,
            fractionDigits: 1,
            unit: 'мм³/с',
            onChange: setPrintVolumetricFlowMm3S,
            testIdPrefix: 'print-tune-volumetric',
            displayValue:
              printTuneKeyboardTarget === 'volumetricFlow'
                ? printTuneKeyboardValue
                : formatTuneKeyboardValue(printVolumetricFlowMm3S, 1),
            onInputFocus: () => openPrintTuneKeyboard('volumetricFlow'),
          })}
        </>
      )
    }

    if (activePrintTuneGroup === 'fan') {
      return (
        <div className="print-tune-modal-stack">
          <p className="print-tune-current-row print-tune-current-row-compact">
            <span>Текущее значение</span>
            <strong>{printFanPercent}%</strong>
          </p>
          <HorizontalSteppedSlider
            value={printFanPercent}
            min={0}
            max={100}
            step={5}
            onChange={handleFanPercentChange}
            testId="print-tune-fan-slider"
          />
        </div>
      )
    }

    if (activePrintTuneGroup === 'flow') {
      return renderCompactTuneContent(
        <>
          {renderCompactCurrentRow('Текущее значение', `${printFlowPercent}%`)}
          {renderCompactTuneEditor({
            label: 'Поток экструдера',
            value: printFlowPercent,
            min: 50,
            max: 150,
            step: 1,
            unit: '%',
            onChange: (nextValue) => setPrintFlowPercent(Math.round(nextValue)),
            testIdPrefix: 'print-tune-flow',
            displayValue:
              printTuneKeyboardTarget === 'flow'
                ? printTuneKeyboardValue
                : formatTuneKeyboardValue(printFlowPercent, 0),
            onInputFocus: () => openPrintTuneKeyboard('flow'),
          })}
        </>
      )
    }

    if (activePrintTuneGroup === 'speed') {
      return renderCompactTuneContent(
        <>
          {renderCompactCurrentRow('Текущее значение', `${formatTuneKeyboardValue(printSpeedMmS, 0)} мм/с`)}
          {renderCompactTuneEditor({
            label: 'Скорость печати',
            value: printSpeedMmS,
            min: 30,
            max: 300,
            step: 5,
            unit: 'мм/с',
            onChange: setPrintSpeedMmS,
            testIdPrefix: 'print-tune-speed',
            displayValue:
              printTuneKeyboardTarget === 'speed'
                ? printTuneKeyboardValue
                : formatTuneKeyboardValue(printSpeedMmS, 0),
            onInputFocus: () => openPrintTuneKeyboard('speed'),
          })}
        </>
      )
    }

    if (activePrintTuneGroup === 'accel') {
      return renderCompactTuneContent(
        <>
          {renderCompactCurrentRow('Текущее значение', `${formatTuneKeyboardValue(printAccelMmS2, 0)} мм/с²`)}
          {renderCompactTuneEditor({
            label: 'Ускорение',
            value: printAccelMmS2,
            min: 500,
            max: 12000,
            step: 100,
            unit: 'мм/с²',
            onChange: setPrintAccelMmS2,
            testIdPrefix: 'print-tune-accel',
            displayValue:
              printTuneKeyboardTarget === 'accel'
                ? printTuneKeyboardValue
                : formatTuneKeyboardValue(printAccelMmS2, 0),
            onInputFocus: () => openPrintTuneKeyboard('accel'),
          })}
        </>
      )
    }

    if (activePrintTuneGroup === 'kFactor') {
      return renderCompactTuneContent(
        <>
          {renderCompactCurrentRow('Текущее значение', formatTuneKeyboardValue(printKFactor, 3))}
          {renderCompactTuneEditor({
            label: 'K-factor',
            value: printKFactor,
            min: 0,
            max: 0.2,
            step: 0.005,
            fractionDigits: 3,
            onChange: setPrintKFactor,
            testIdPrefix: 'print-tune-kfactor',
            displayValue:
              printTuneKeyboardTarget === 'kFactor'
                ? printTuneKeyboardValue
                : formatTuneKeyboardValue(printKFactor, 3),
            onInputFocus: () => openPrintTuneKeyboard('kFactor'),
          })}
        </>
      )
    }

    if (activePrintTuneGroup === 'retract') {
      return renderCompactTuneContent(
        <>
          {renderCompactCurrentRow('Текущее значение', `${formatTuneKeyboardValue(printRetractMm, 1)} мм`)}
          {renderCompactTuneEditor({
            label: 'Откат',
            value: printRetractMm,
            min: 0,
            max: 8,
            step: 0.1,
            fractionDigits: 1,
            unit: 'мм',
            onChange: setPrintRetractMm,
            testIdPrefix: 'print-tune-retract',
            displayValue:
              printTuneKeyboardTarget === 'retract'
                ? printTuneKeyboardValue
                : formatTuneKeyboardValue(printRetractMm, 1),
            onInputFocus: () => openPrintTuneKeyboard('retract'),
          })}
        </>
      )
    }

    if (activePrintTuneGroup === 'progress') {
      return (
        <div className="print-tune-modal-stack">
          <p className="print-tune-current-row">
            <span>Прогресс</span>
            <strong>{printFill}%</strong>
          </p>
          <p className="print-tune-current-row">
            <span>Расчётное завершение</span>
            <strong>{adjustedEtaTime}</strong>
          </p>
          <TuneNumberControl
            label="Коррекция времени завершения"
            value={printProgressOffsetMin}
            min={-180}
            max={180}
            step={1}
            unit="мин"
            onChange={setPrintProgressOffsetMin}
            testIdPrefix="print-tune-progress-offset"
          />
        </div>
      )
    }

    return renderCompactTuneContent(
      <>
        {renderCompactCurrentRow('Текущий слой', `${displayLayerCurrent} / ${displayLayerTotal}`)}
        <label className="print-tune-input-wrap print-tune-input-wrap-layer print-tune-input-wrap-layer-compact">
          <span>Пауза на слое</span>
          <input
            type="number"
            className="print-tune-input"
            value={printTuneKeyboardTarget === 'layers' ? printTuneKeyboardValue : pauseAtLayer}
            min={1}
            max={DASHBOARD_VALUES.layerTotal}
            step={1}
            readOnly={true}
            onFocus={() => openPrintTuneKeyboard('layers')}
            onClick={() => openPrintTuneKeyboard('layers')}
            data-testid="print-tune-layer-pause-input"
          />
        </label>
      </>
    )
  }

  useEffect(() => {
    if (!hasActivePrint && activePrintTuneGroup !== null) {
      setActivePrintTuneGroup(null)
    }
  }, [activePrintTuneGroup, hasActivePrint])

  useEffect(() => {
    if (activePrintTuneGroup === 'nozzle' || activePrintTuneGroup === 'bed') {
      closePrintTuneKeyboard()
      return
    }

    closeTemperatureKeyboard()

    if (printTuneKeyboardTarget !== null && activePrintTuneGroup !== printTuneKeyboardTarget) {
      closePrintTuneKeyboard()
    }
  }, [activePrintTuneGroup, printTuneKeyboardTarget])

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
      activeTopPopup={activeTopPopup}
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
              heating={{
                rows: heatingControlRows,
                chartSeries: temperatureChartSeries,
                temperatureKeyboardTarget,
                temperatureKeyboardValue,
                printNozzleTargetTemp,
                printBedTargetTemp,
                commandBlockReasons: heatingCommandBlockReasons,
                renderTemperatureKeyboardPanel,
                onTemperatureKeyboardOpen: openTemperatureKeyboard,
                onHeatingPresetApply: handleHeatingPresetApply,
                onHeatingDisable: handleHeatingDisable,
              }}
              fan={{
                printFanPercent,
                isBusy,
                commandBlockReason: fanCommandBlockReason,
                onFanPercentChange: handleFanPercentChange,
              }}
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
            <SettingsPage
              activeSettingsGroup={activeSettingsGroup}
              onSettingsGroupChange={setActiveSettingsGroup}
              interfaceSettings={{
                isDarkThemeEnabled,
                isMaxPerformanceModeEnabled,
                sleepModeValue,
                timezoneValue,
                onDarkThemeChange: setIsDarkThemeEnabled,
                onMaxPerformanceModeChange: setIsMaxPerformanceModeEnabled,
                onSleepModeChange: setSleepModeValue,
                onTimezoneChange: setTimezoneValue,
              }}
              network={{
                isCapabilityAvailable: isNetworkCapabilityAvailable,
                searchInputRef: wifiSearchInputRef,
                passwordInputRef: wifiPasswordInputRef,
                searchQuery: wifiSearchQuery,
                selectedWifiNetworkId,
                selectedWifiNetwork,
                filteredWifiNetworks,
                passwordValue: wifiPasswordValue,
                isPasswordVisible: isWifiPasswordVisible,
                wifiIpLabel,
                connectedWifiNetwork,
                connectionLabel,
                notice: wifiConnectionNotice,
                capabilityNotice: networkCapabilityNotice,
                onSearchQueryChange: handleWifiSearchQueryChange,
                onSearchInputFocus: handleWifiSearchInputFocus,
                onScan: handleWifiScan,
                onNetworkSelect: handleWifiNetworkSelect,
                onPasswordChange: handleWifiPasswordChange,
                onPasswordInputFocus: handleWifiPasswordInputFocus,
                onPasswordVisibilityToggle: handleWifiPasswordVisibilityToggle,
                onConnect: handleWifiConnect,
                onForgetSelected: handleWifiForgetSelected,
              }}
              notifications={{
                isNotificationsEnabled,
                isNotificationSoundsEnabled,
                history: notificationHistory,
                onNotificationsEnabledChange: setIsNotificationsEnabled,
                onNotificationSoundsEnabledChange: setIsNotificationSoundsEnabled,
              }}
              cloud={{
                isCapabilityAvailable: isCloudCapabilityAvailable,
                isConnected: isCloudConnected,
                isAiMonitoringEnabled: isCloudAiMonitoringEnabled,
                notice: cloudCapabilityNotice,
                onConnectionToggle: handleCloudConnectionToggle,
                onAiMonitoringToggle: handleCloudAiMonitoringToggle,
              }}
              updates={{
                availableUpdateVersion,
                isCheckingUpdates,
                isCapabilityAvailable: isUpdatesCapabilityAvailable,
                notice: updateCapabilityNotice,
                onCheckUpdates: handleCheckUpdates,
              }}
              language={{
                languageValue,
                isExternalVoiceEnabled,
                onLanguageChange: setLanguageValue,
                onExternalVoiceChange: setIsExternalVoiceEnabled,
              }}
              console={{
                inputRef: consoleInputRef,
                commandValue: consoleCommandValue,
                notice: consoleNotice,
                history: consoleHistory,
                onInputChange: handleConsoleInputChange,
                onKeyboardOpen: handleConsoleKeyboardOpen,
                onSubmit: handleConsoleSubmit,
                onQuickCommandInsert: handleConsoleQuickCommandInsert,
              }}
            />
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
                showEnterKey={isConsoleSettingsKeyboardOpen}
                testId={keyboardDialogTestId}
                previewTestId={keyboardDialogPreviewTestId}
              />
            </div>
          </div>
        ) : null}

        {activePrintTuneMeta !== null ? (
          <div
            className="print-tune-modal-layer"
            role="presentation"
            onClick={handlePrintTuneGroupClose}
            data-testid="print-tune-modal-layer"
          >
            <section
              className={`print-tune-modal-dialog ${isTemperatureTuneGroup ? 'is-temperature' : 'is-compact'} ${isTemperatureTuneGroup && temperatureKeyboardTarget !== null ? 'is-temperature-keyboard-open' : ''} ${isCompactTuneKeyboardOpen ? 'is-compact-keyboard-open' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby={PRINT_TUNE_MODAL_TITLE_ID}
              data-testid="print-tune-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="print-cancel-modal-head">
                <h2 id={PRINT_TUNE_MODAL_TITLE_ID}>{activePrintTuneMeta.label}</h2>
                <div className="print-tune-modal-head-actions">
                  {isTemperatureTuneGroup ? (
                    <button
                      type="button"
                      className="settings-network-btn settings-network-btn-primary print-tune-modal-head-save"
                      onClick={handlePrintTuneApply}
                      data-testid="print-tune-modal-apply-button"
                    >
                      Сохранить
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="print-cancel-modal-close"
                    aria-label={`Закрыть окно параметра: ${activePrintTuneMeta.label}`}
                    onClick={handlePrintTuneGroupClose}
                  >
                    ×
                  </button>
                </div>
              </header>

              {renderPrintTuneGroupContent()}

              {isTemperatureTuneGroup ? null : (
                <div className="print-tune-modal-actions">
                  <button
                    type="button"
                    className="settings-network-btn"
                    onClick={handlePrintTuneGroupClose}
                    data-testid="print-tune-modal-close-button"
                  >
                    Закрыть
                  </button>
                  <button
                    type="button"
                    className="settings-network-btn settings-network-btn-primary"
                    onClick={handlePrintTuneApply}
                    data-testid="print-tune-modal-apply-button"
                  >
                    Сохранить
                  </button>
                </div>
              )}
            </section>
          </div>
        ) : null}

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

        {activeTopPopup !== null ? (
          <div className="top-popup-layer" role="presentation" onClick={closeTopPopup}>
            <section
              className="top-popup-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="top-popup-title"
              data-testid={`top-popup-${activeTopPopup}`}
              style={
                topPopupPosition
                  ? ({
                      top: `${topPopupPosition.top}px`,
                      left: `${topPopupPosition.left}px`,
                      '--top-popup-arrow-left': `${topPopupPosition.arrowLeft}px`,
                    } as CSSProperties)
                  : undefined
              }
              onClick={(event) => event.stopPropagation()}
            >
              <header className="top-popup-head">
                <h2 id="top-popup-title">{TOP_BAR_POPUP_TITLES[activeTopPopup]}</h2>
                <button type="button" className="top-popup-close" aria-label="Закрыть окно" onClick={closeTopPopup}>
                  ×
                </button>
              </header>

              {activeTopPopup === 'wifi' ? (
                <div className="top-popup-content">
                  <dl className="top-popup-kv">
                    <div>
                      <dt>Статус сети</dt>
                      <dd>{connectionLabel}</dd>
                    </div>
                    <div>
                      <dt>Wi-Fi сеть</dt>
                      <dd>{wifiSsidLabel}</dd>
                    </div>
                    <div>
                      <dt>IP адрес</dt>
                      <dd>{wifiIpLabel}</dd>
                    </div>
                    <div>
                      <dt>Время</dt>
                      <dd>{formattedSnapshotTime}</dd>
                    </div>
                  </dl>
                  <div className="top-popup-actions">
                    <button type="button" className="top-popup-action" onClick={openWifiSettings}>
                      Перейти в настройки Wi-Fi
                    </button>
                  </div>
                </div>
              ) : null}

              {activeTopPopup === 'cloud' ? (
                <div className="top-popup-content">
                  <dl className="top-popup-kv">
                    <div>
                      <dt>Состояние</dt>
                      <dd>{cloudStatusLabel}</dd>
                    </div>
                  </dl>
                  {isCloudCapabilityAvailable ? (
                    <a
                      className="top-popup-qr-link"
                      href={CLOUD_LINK_URL}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Открыть treed.pro для добавления устройства"
                    >
                      <img
                        className="top-popup-qr-image"
                        src={CLOUD_QR_IMAGE_URL}
                        alt="QR-код для перехода на treed.pro"
                      />
                      <span>Сканируйте QR или откройте treed.pro</span>
                    </a>
                  ) : (
                    <p className="top-popup-secondary">{cloudCapabilityNotice}</p>
                  )}
                </div>
              ) : null}

              {activeTopPopup === 'notifications' ? (
                <div className="top-popup-content">
                  <p className="top-popup-note">Уведомления принтера:</p>
                  <ul className="top-popup-list">
                    {commandError ? <li>{commandError}</li> : null}
                    {currentPrinterNotification !== null ? (
                      <li>
                        <strong>{currentPrinterNotification.title}</strong>
                        {currentPrinterNotification.details ? `: ${currentPrinterNotification.details}` : ''}
                      </li>
                    ) : null}
                    {commandError || currentPrinterNotification !== null ? null : <li>Новых уведомлений нет.</li>}
                  </ul>
                  <p className="top-popup-secondary">Новые системные уведомления будут добавляться в этот список.</p>
                </div>
              ) : null}

              {activeTopPopup === 'power' ? (
                <div className="top-popup-content">
                  <p className="top-popup-warning">
                    Перезапуск сервисов может прервать печать. Host-действия используйте только когда нужен полный restart устройства.
                  </p>
                  <div className="top-popup-actions top-popup-power-actions">
                    {powerMenuActions.map((action) => (
                      <button
                        key={action.command}
                        type="button"
                        className={`top-popup-action ${action.tone === 'danger' ? 'top-popup-action-danger' : ''}`}
                        onClick={() => void handlePowerMenuAction(action.command)}
                        disabled={isBusy}
                        aria-disabled={action.blockReason !== null || isBusy}
                        title={action.blockReason ?? action.details}
                      >
                        {armedPowerCommand === action.command ? `Подтвердить: ${action.label}` : action.label}
                      </button>
                    ))}
                    <button type="button" className="top-popup-action" onClick={closeTopPopup}>
                      Отмена
                    </button>
                  </div>
                  {powerPopupNotice ? <p className="top-popup-secondary">{powerPopupNotice}</p> : null}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default App
