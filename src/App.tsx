import { type ChangeEvent, type CSSProperties, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePrinterCommands } from './core/commands'
import { usePrinterSnapshot } from './core/store/usePrinterSnapshot'
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
import {
  clampPercent,
  rounded,
  statusLabel,
} from './dashboard/helpers'
import {
  ActionSquareButton,
  AxisCrossControls,
  HorizontalSteppedSlider,
  NavItemButton,
  PlainMetric,
  PrintFileCard,
  PrintPreviewIcon,
  SegmentedToggle,
  SettingsInfoCard,
  SettingsSelectField,
  SettingsSidebarMenu,
  SettingsToggleRow,
  SettingsVirtualKeyboard,
  type SettingsMenuOption,
  type VirtualKeyboardLanguage,
  StatusIconButton,
  TemperatureMetric,
  type AxisId,
  type JoystickVector,
  VerticalAxisSlider,
  VirtualJoystick,
} from './ui'
import { PRINT_FILE_LIBRARY, type PrintFileItem } from './printFiles'
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
const FILE_MODAL_TITLE_ID = 'print-file-modal-title'
const PRINT_CANCEL_MODAL_TITLE_ID = 'print-cancel-modal-title'
type FilesSortKey = 'name' | 'addedAt'
type ParkingMode = 'all' | 'axis'
type MovementMode = 'buttons' | 'joystick'
type MoveStepKey = '1' | '10' | '25' | '100'
type KeyboardTarget = 'idleNotes' | 'wifiSearch' | 'wifiPassword' | 'consoleCommand'
type SettingsGroupId =
  | 'system'
  | 'interface'
  | 'network'
  | 'notifications'
  | 'cloud'
  | 'device'
  | 'updates'
  | 'language'
  | 'console'
type WifiNetworkSecurity = 'open' | 'wpa2' | 'wpa3'
type WifiNetworkItem = {
  id: string
  ssid: string
  signalPercent: number
  security: WifiNetworkSecurity
  saved: boolean
  connected: boolean
}
type SettingsNotificationItem = {
  id: string
  title: string
  details: string
  createdAt: string
}
type PrintHeadPosition = {
  x: number
  y: number
  z: number
}
const TOP_BAR_POPUP_TITLES: Record<TopStatusButtonId, string> = {
  wifi: 'Состояние Wi-Fi',
  cloud: 'Состояние облака',
  notifications: 'Уведомления',
  power: 'Выключение принтера',
}
type TopPopupPosition = {
  top: number
  left: number
  arrowLeft: number
}

const FILES_SORT_OPTIONS: Array<{ id: FilesSortKey; label: string }> = [
  { id: 'name', label: 'По имени' },
  { id: 'addedAt', label: 'По добавлению' },
]
const PARKING_MODE_OPTIONS: Array<{ id: ParkingMode; label: string }> = [
  { id: 'all', label: 'Все оси' },
  { id: 'axis', label: 'По оси' },
]
const PARKING_AXIS_OPTIONS: Array<{ id: AxisId; label: string }> = [
  { id: 'X', label: 'X' },
  { id: 'Y', label: 'Y' },
  { id: 'Z', label: 'Z' },
]
const MOVEMENT_MODE_OPTIONS: Array<{ id: MovementMode; label: string }> = [
  { id: 'buttons', label: 'Крестовина' },
  { id: 'joystick', label: 'Джойстик' },
]
const MOVE_STEP_OPTIONS: Array<{ id: MoveStepKey; label: string; valueMm: number }> = [
  { id: '1', label: '1 мм', valueMm: 1 },
  { id: '10', label: '10 мм', valueMm: 10 },
  { id: '25', label: '25 мм', valueMm: 25 },
  { id: '100', label: '100 мм', valueMm: 100 },
]
const SETTINGS_GROUP_OPTIONS: Array<SettingsMenuOption<SettingsGroupId>> = [
  { id: 'network', label: 'Сеть', icon: 'statusWifi' },
  { id: 'system', label: 'Система', icon: 'menuSettings' },
  { id: 'interface', label: 'Интерфейс', icon: 'menuDashboard' },
  { id: 'notifications', label: 'Уведомления', icon: 'statusNotification' },
  { id: 'cloud', label: 'Облако', icon: 'statusCloud' },
  { id: 'device', label: 'Об устройстве', icon: 'menuSettings' },
  { id: 'updates', label: 'Обновления', icon: 'menuMacros' },
  { id: 'language', label: 'Язык', icon: 'menuFiles' },
  { id: 'console', label: 'Консоль', icon: 'menuControl' },
]
const SLEEP_MODE_OPTIONS = ['30 сек', '1 мин', '5 мин', '10 мин'] as const
const TIMEZONE_OPTIONS = [
  '(UTC-12:00) Международная линия перемены дат (запад)',
  '(UTC-11:00) Самоа',
  '(UTC-10:00) Гавайи',
  '(UTC-09:00) Аляска',
  '(UTC-08:00) Тихоокеанское время (США и Канада)',
  '(UTC-07:00) Горное время (США и Канада)',
  '(UTC-06:00) Центральное время (США и Канада)',
  '(UTC-05:00) Восточное время (США и Канада)',
  '(UTC-04:00) Атлантическое время (Канада)',
  '(UTC-03:00) Бразилиа, Буэнос-Айрес',
  '(UTC-02:00) Среднеатлантическое время',
  '(UTC-01:00) Азорские острова',
  '(UTC+00:00) Лондон, Лиссабон',
  '(UTC+01:00) Берлин, Париж, Рим',
  '(UTC+02:00) Афины, Киев, Калининград',
  '(UTC+03:00) Москва, Санкт-Петербург',
  '(UTC+04:00) Дубай, Баку',
  '(UTC+05:00) Ташкент, Карачи',
  '(UTC+05:30) Нью-Дели, Мумбаи',
  '(UTC+06:00) Дакка, Алма-Ата',
  '(UTC+07:00) Бангкок, Ханой',
  '(UTC+08:00) Пекин, Сингапур',
  '(UTC+09:00) Токио, Сеул',
  '(UTC+10:00) Сидней, Владивосток',
  '(UTC+11:00) Магадан, Соломоновы острова',
  '(UTC+12:00) Окленд, Фиджи',
  '(UTC+13:00) Нукуалофа',
  '(UTC+14:00) Киритимати',
] as const
const DEFAULT_TIMEZONE_OPTION = '(UTC+03:00) Москва, Санкт-Петербург'
const LANGUAGE_OPTIONS = ['Русский', 'English'] as const
const UPDATE_CURRENT_VERSION = '0.1.0'
const UPDATE_AVAILABLE_VERSION = '0.1.1'
const SETTINGS_NOTIFICATION_HISTORY: SettingsNotificationItem[] = [
  {
    id: 'notif-001',
    title: 'Печать завершена',
    details: 'fan_shroud_prototype.gcode завершён успешно.',
    createdAt: '11:42',
  },
  {
    id: 'notif-002',
    title: 'Температура сопла',
    details: 'Достигнут целевой нагрев 215°C.',
    createdAt: '11:31',
  },
  {
    id: 'notif-003',
    title: 'Сервисное напоминание',
    details: 'До планового ТО осталось 126 часов.',
    createdAt: '10:08',
  },
]
const DEVICE_INFO_LINES = [
  ['Модель', 'TreeD Shell Controller'],
  ['Серийный номер', 'TRD-PI-240315-01'],
  ['CPU', 'Raspberry Pi 4B (armv7l)'],
  ['Память', '4 GB'],
  ['MCU', 'STM32F446XX'],
  ['Uptime', '2 д 7 ч 14 м'],
] as const
const CONSOLE_QUICK_COMMANDS = [
  'G28',
  'BED_MESH_CALIBRATE',
  'M104 S200',
  'M140 S60',
  'START_PRINT',
] as const
const SETTINGS_VIRTUAL_KEYBOARD_ROWS: string[][] = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U'],
  ['I', 'O', 'P', 'A', 'S', 'D', 'F'],
  ['G', 'H', 'J', 'K', 'L', 'Z', 'X'],
  ['C', 'V', 'B', 'N', 'M', '.', '@'],
  ['_', '-', '1', '2', '3', '4', '5'],
  ['6', '7', '8', '9', '0', '/', '+'],
]
const WIFI_NETWORK_LIBRARY: WifiNetworkItem[] = [
  {
    id: 'home-2f-5g',
    ssid: 'Home_2F_5G',
    signalPercent: 86,
    security: 'wpa2',
    saved: true,
    connected: true,
  },
  {
    id: 'office-main-5g',
    ssid: 'Office_Main_5G',
    signalPercent: 73,
    security: 'wpa2',
    saved: true,
    connected: false,
  },
  {
    id: 'treed-workshop',
    ssid: 'TreeD_Workshop',
    signalPercent: 64,
    security: 'wpa3',
    saved: false,
    connected: false,
  },
  {
    id: 'guest-open',
    ssid: 'Guest_Open',
    signalPercent: 52,
    security: 'open',
    saved: false,
    connected: false,
  },
  {
    id: 'phone-hotspot',
    ssid: 'Phone_Hotspot',
    signalPercent: 38,
    security: 'wpa2',
    saved: false,
    connected: false,
  },
]
const DEFAULT_SELECTED_WIFI_NETWORK_ID = WIFI_NETWORK_LIBRARY.find((item) => item.connected)?.id ?? WIFI_NETWORK_LIBRARY[0]?.id ?? null
const HEAD_X_BOUNDS_MM = { min: 0, max: 250 } as const
const HEAD_Y_BOUNDS_MM = { min: 0, max: 250 } as const
const HEAD_Z_BOUNDS_MM = { min: 0, max: 200 } as const
const MODEL_FAN_BOUNDS_PERCENT = { min: 0, max: 100 } as const
const MODEL_FAN_STEP_PERCENT = 5
const MAX_JOYSTICK_SPEED_MM_S = 50
const MAINTENANCE_STATUS = {
  runtimeHours: 874,
  hoursLeft: 126,
} as const
const IDLE_NOTES_DEFAULT_TEXT = [
  'Перед запуском проверьте очистку стола и состояние поверхности.',
  'Если модель новая, сделайте короткий тест первого слоя.',
].join('\n')
const IDLE_NOTES_KEYBOARD_ROWS: string[][] = [
  ['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х'],
  ['Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Э'],
  ['Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю'],
]

function clampAxisValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function snapValueByStep(value: number, min: number, max: number, step: number): number {
  const safeStep = Math.max(1, step)
  const clamped = clampAxisValue(value, min, max)
  const steps = Math.round((clamped - min) / safeStep)
  return clampAxisValue(min + (steps * safeStep), min, max)
}

function normalizeHeadPosition(position: PrintHeadPosition): PrintHeadPosition {
  return {
    x: clampAxisValue(position.x, HEAD_X_BOUNDS_MM.min, HEAD_X_BOUNDS_MM.max),
    y: clampAxisValue(position.y, HEAD_Y_BOUNDS_MM.min, HEAD_Y_BOUNDS_MM.max),
    z: clampAxisValue(position.z, HEAD_Z_BOUNDS_MM.min, HEAD_Z_BOUNDS_MM.max),
  }
}

function formatAxisCoordinate(value: number): string {
  return value.toFixed(1)
}

function wifiSecurityLabel(security: WifiNetworkSecurity): string {
  if (security === 'open') {
    return 'Открытая'
  }

  return security.toUpperCase()
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
  const { pendingCommand, executeCommand } = usePrinterCommands()
  const screenShellRef = useRef<HTMLElement | null>(null)
  const topButtonRefs = useRef<Record<TopStatusButtonId, HTMLButtonElement | null>>({
    wifi: null,
    cloud: null,
    notifications: null,
    power: null,
  })
  const [babystepStep, setBabystepStep] = useState<number>(BABYSTEP_STEP_OPTIONS[1])
  const [activeTopPopup, setActiveTopPopup] = useState<TopStatusButtonId | null>(null)
  const [powerPopupNotice, setPowerPopupNotice] = useState<string>('')
  const [topPopupPosition, setTopPopupPosition] = useState<TopPopupPosition | null>(null)
  const [activeScreen, setActiveScreen] = useState<ScreenId>(DEFAULT_SCREEN)
  const [filesSortKey, setFilesSortKey] = useState<FilesSortKey>('name')
  const [filesLibrary, setFilesLibrary] = useState<PrintFileItem[]>(() => [...PRINT_FILE_LIBRARY])
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [activePrintFileName, setActivePrintFileName] = useState<string | null>(null)
  const [isPrintCancelConfirmOpen, setIsPrintCancelConfirmOpen] = useState<boolean>(false)
  const [idleNotesText, setIdleNotesText] = useState<string>(IDLE_NOTES_DEFAULT_TEXT)
  const [activeKeyboardTarget, setActiveKeyboardTarget] = useState<KeyboardTarget | null>(null)
  const [keyboardLanguage, setKeyboardLanguage] = useState<VirtualKeyboardLanguage>('ru')
  const [isKeyboardCapsEnabled, setIsKeyboardCapsEnabled] = useState<boolean>(false)
  const [activeSettingsGroup, setActiveSettingsGroup] = useState<SettingsGroupId>('system')
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
  const [parkingMode, setParkingMode] = useState<ParkingMode>('all')
  const [parkingAxis, setParkingAxis] = useState<AxisId>('X')
  const [movementMode, setMovementMode] = useState<MovementMode>('buttons')
  const [moveStepKey, setMoveStepKey] = useState<MoveStepKey>('1')
  const [isServiceModeEnabled, setIsServiceModeEnabled] = useState<boolean>(false)
  const [modelFanPercent, setModelFanPercent] = useState<number>(() => (
    snapValueByStep(snapshot.modelFanPercent, MODEL_FAN_BOUNDS_PERCENT.min, MODEL_FAN_BOUNDS_PERCENT.max, MODEL_FAN_STEP_PERCENT)
  ))
  const [joystickVector, setJoystickVector] = useState<JoystickVector>({ x: 0, y: 0 })
  const [printHeadPosition, setPrintHeadPosition] = useState<PrintHeadPosition>(() =>
    normalizeHeadPosition({
      x: snapshot.toolheadX,
      y: snapshot.toolheadY,
      z: snapshot.toolheadZ,
    }),
  )
  const idleNotesInputRef = useRef<HTMLTextAreaElement | null>(null)
  const wifiSearchInputRef = useRef<HTMLInputElement | null>(null)
  const wifiPasswordInputRef = useRef<HTMLInputElement | null>(null)
  const consoleInputRef = useRef<HTMLTextAreaElement | null>(null)

  const printFill = Math.max(0, Math.min(100, DASHBOARD_VALUES.progressPercent))
  const isBusy = pendingCommand !== null
  const hasActivePrint = activePrintFileName !== null
  const isFilesScreenActive = activeScreen === 'files'
  const activeNavIndex = Math.max(
    0,
    BOTTOM_NAV_ITEMS.findIndex((item) => item.id === activeScreen),
  )
  const babystepActiveIndex = Math.max(
    0,
    BABYSTEP_STEP_OPTIONS.findIndex((step) => step === babystepStep),
  )
  const formattedSnapshotTime = useMemo(() => {
    const parsed = new Date(snapshot.updatedAt)
    if (Number.isNaN(parsed.getTime())) {
      return '—'
    }
    return parsed.toLocaleTimeString('ru-RU')
  }, [snapshot.updatedAt])
  const connectionLabel = snapshot.connection === 'online' ? 'Подключено' : 'Офлайн'
  const wifiSsidLabel = snapshot.connection === 'online' ? snapshot.wifiSsid : 'Не подключено'
  const wifiIpLabel = snapshot.connection === 'online' ? snapshot.ipAddress : '—'
  const cloudStatusLabel = snapshot.connection === 'online' ? 'В сети' : 'Не в сети'
  const idleNozzleTempLabel = `${rounded(snapshot.extruderTemp)} °C`
  const idleBedTempLabel = `${rounded(snapshot.bedTemp)} °C`
  const topBarScreenLabel = useMemo(() => {
    if (activeScreen === 'dashboard') {
      return hasActivePrint ? statusLabel(snapshot.state) : 'Ожидание печати'
    }

    return BOTTOM_NAV_ITEMS.find((item) => item.id === activeScreen)?.label ?? statusLabel(snapshot.state)
  }, [activeScreen, hasActivePrint, snapshot.state])
  const sortedPrintFiles = useMemo(() => {
    const nextItems = [...filesLibrary]

    if (filesSortKey === 'addedAt') {
      nextItems.sort((left, right) => Date.parse(right.addedAt) - Date.parse(left.addedAt))
      return nextItems
    }

    nextItems.sort((left, right) => left.name.localeCompare(right.name, 'en'))
    return nextItems
  }, [filesLibrary, filesSortKey])
  const selectedPrintFile = useMemo(() => {
    if (selectedFileId === null) {
      return null
    }

    return filesLibrary.find((item) => item.id === selectedFileId) ?? null
  }, [filesLibrary, selectedFileId])
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
  const moveStepMm = useMemo(() => {
    const selectedStep = MOVE_STEP_OPTIONS.find((item) => item.id === moveStepKey)
    return selectedStep?.valueMm ?? 1
  }, [moveStepKey])
  const joystickSpeedMmS = useMemo(
    () => Math.hypot(joystickVector.x, joystickVector.y) * MAX_JOYSTICK_SPEED_MM_S,
    [joystickVector.x, joystickVector.y],
  )
  const axisCoordinatesLabel = `X ${formatAxisCoordinate(printHeadPosition.x)}  Y ${formatAxisCoordinate(printHeadPosition.y)}  Z ${formatAxisCoordinate(printHeadPosition.z)}`
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

  const temperatureValueByKey = {
    nozzle: snapshot.extruderTemp,
    bed: snapshot.bedTemp,
  } as const

  const temperatureMetrics = TEMPERATURE_METRIC_DEFINITIONS.map((definition) => {
    const currentValue = temperatureValueByKey[definition.key]

    return {
      ...definition,
      current: rounded(currentValue),
      fillPercent: clampPercent(currentValue, definition.target),
    }
  })

  const quickMetricValueByKey = {
    volumetricFlow: DASHBOARD_VALUES.volumetricFlowMm3S,
    fan: rounded(snapshot.modelFanPercent),
    flow: DASHBOARD_VALUES.flowPercent,
  } as const

  const quickMetrics = QUICK_METRIC_DEFINITIONS.map((definition) => ({
    ...definition,
    value: quickMetricValueByKey[definition.key],
  }))

  const processMetricValueByKey = {
    speed: DASHBOARD_VALUES.speedMmS,
    accel: DASHBOARD_VALUES.accelMmS2,
    kFactor: DASHBOARD_VALUES.kFactorLaPa,
    retract: DASHBOARD_VALUES.retractMm,
  } as const

  const processMetrics = PROCESS_METRIC_DEFINITIONS.map((definition) => ({
    ...definition,
    value: processMetricValueByKey[definition.key],
  }))

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

    let left = anchorCenterX - (popupWidth / 2)
    left = Math.max(TOP_POPUP_SIDE_PADDING, Math.min(left, shellWidth - popupWidth - TOP_POPUP_SIDE_PADDING))

    const arrowLeft = Math.max(
      TOP_POPUP_ARROW_EDGE,
      Math.min(anchorCenterX - left, popupWidth - TOP_POPUP_ARROW_EDGE),
    )

    return {
      top: TOP_POPUP_GAP,
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
      setTopPopupPosition(resolveTopPopupPosition(id))
      setActiveTopPopup(id)
    },
    [activeTopPopup, closeTopPopup, resolveTopPopupPosition],
  )

  const openWifiSettings = useCallback(() => {
    setActiveSettingsGroup('network')
    setActiveScreen('settings')
    closeTopPopup()
  }, [closeTopPopup])

  function handleFilesSortChange(nextSortKey: FilesSortKey): void {
    if (nextSortKey === filesSortKey) {
      return
    }

    setFilesSortKey(nextSortKey)
  }

  function handleParkingModeChange(nextMode: ParkingMode): void {
    setParkingMode(nextMode)
  }

  function handleParkingAxisChange(nextAxis: AxisId): void {
    setParkingAxis(nextAxis)
  }

  function handleMoveStepChange(nextStep: MoveStepKey): void {
    setMoveStepKey(nextStep)
  }

  function handleMovementModeChange(nextMode: MovementMode): void {
    setMovementMode(nextMode)
  }

  function handleModelFanPercentChange(nextValue: number): void {
    setModelFanPercent(
      snapValueByStep(nextValue, MODEL_FAN_BOUNDS_PERCENT.min, MODEL_FAN_BOUNDS_PERCENT.max, MODEL_FAN_STEP_PERCENT),
    )
  }

  const closeFileModal = useCallback(() => {
    setSelectedFileId(null)
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
  }

  function handleDeleteSelectedFile(): void {
    if (selectedPrintFile === null) {
      return
    }

    if (activePrintFileName === selectedPrintFile.name) {
      setActivePrintFileName(null)
    }
    setFilesLibrary((currentItems) => currentItems.filter((item) => item.id !== selectedPrintFile.id))
    closeFileModal()
  }

  async function handleStartSelectedFile(): Promise<void> {
    if (selectedPrintFile === null) {
      return
    }

    const ok = await executeCommand({
      command: 'start',
      filename: selectedPrintFile.name,
    })
    if (ok) {
      setActivePrintFileName(selectedPrintFile.name)
      await refresh()
      setActiveScreen('dashboard')
      closeFileModal()
    }
  }

  async function handleParkingCommand(): Promise<void> {
    const ok = await executeCommand({ command: 'home' })
    if (!ok) {
      return
    }

    await refresh()
    setPrintHeadPosition((prevPosition) => {
      if (parkingMode === 'all') {
        return { ...prevPosition, x: 0, y: 0, z: 0 }
      }

      if (parkingAxis === 'X') {
        return { ...prevPosition, x: 0 }
      }

      if (parkingAxis === 'Y') {
        return { ...prevPosition, y: 0 }
      }

      return { ...prevPosition, z: 0 }
    })
  }

  function handleServiceModeToggle(): void {
    setIsServiceModeEnabled((prevValue) => !prevValue)
  }

  function handleAxisMove(axis: AxisId, direction: -1 | 1): void {
    setPrintHeadPosition((prevPosition) => {
      const delta = direction * moveStepMm
      return {
        ...prevPosition,
        x: axis === 'X'
          ? clampAxisValue(prevPosition.x + delta, HEAD_X_BOUNDS_MM.min, HEAD_X_BOUNDS_MM.max)
          : prevPosition.x,
        y: axis === 'Y'
          ? clampAxisValue(prevPosition.y + delta, HEAD_Y_BOUNDS_MM.min, HEAD_Y_BOUNDS_MM.max)
          : prevPosition.y,
        z: axis === 'Z'
          ? clampAxisValue(prevPosition.z + delta, HEAD_Z_BOUNDS_MM.min, HEAD_Z_BOUNDS_MM.max)
          : prevPosition.z,
      }
    })
  }

  function handleJoystickVectorChange(nextVector: JoystickVector): void {
    setJoystickVector(nextVector)
  }

  function handleJoystickZChange(nextValue: number): void {
    setPrintHeadPosition((prevPosition) => ({
      ...prevPosition,
      z: clampAxisValue(nextValue, HEAD_Z_BOUNDS_MM.min, HEAD_Z_BOUNDS_MM.max),
    }))
  }

  function handleMotorsDisable(): void {
    // Команда отключения моторов будет подключена после интеграции backend.
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
  const isIdleNotesKeyboardOpen = false
  const handleIdleNotesKeyboardClose = handleKeyboardClose
  const handleIdleNotesKeyMouseDown = handleVirtualKeyboardKeyMouseDown
  const handleIdleNotesVirtualKey = handleVirtualKeyboardKey
  const handleSettingsKeyboardClose = handleKeyboardClose
  const handleSettingsKeyboardKeyMouseDown = handleVirtualKeyboardKeyMouseDown
  const handleSettingsVirtualKey = handleVirtualKeyboardKey

  function handleConsoleSubmit(): void {
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
  }

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

  useEffect(() => {
    if (movementMode !== 'joystick' && (joystickVector.x !== 0 || joystickVector.y !== 0)) {
      setJoystickVector({ x: 0, y: 0 })
    }
  }, [joystickVector.x, joystickVector.y, movementMode])

  useEffect(() => {
    setModelFanPercent((currentValue) => {
      const nextValue = snapValueByStep(
        snapshot.modelFanPercent,
        MODEL_FAN_BOUNDS_PERCENT.min,
        MODEL_FAN_BOUNDS_PERCENT.max,
        MODEL_FAN_STEP_PERCENT,
      )

      return currentValue === nextValue ? currentValue : nextValue
    })
  }, [snapshot.modelFanPercent])

  useEffect(() => {
    if (movementMode === 'joystick') {
      return
    }

    setPrintHeadPosition(
      normalizeHeadPosition({
        x: snapshot.toolheadX,
        y: snapshot.toolheadY,
        z: snapshot.toolheadZ,
      }),
    )
  }, [movementMode, snapshot.toolheadX, snapshot.toolheadY, snapshot.toolheadZ])

  useEffect(() => {
    if (movementMode !== 'joystick' || (joystickVector.x === 0 && joystickVector.y === 0)) {
      return
    }

    let frameHandle: number | null = null
    let previousTimestamp: number | null = null

    const tick = (timestamp: number) => {
      if (previousTimestamp === null) {
        previousTimestamp = timestamp
      }
      const deltaSeconds = clampAxisValue((timestamp - previousTimestamp) / 1000, 0, 0.1)
      previousTimestamp = timestamp

      setPrintHeadPosition((prevPosition) => normalizeHeadPosition({
        x: prevPosition.x + (joystickVector.x * MAX_JOYSTICK_SPEED_MM_S * deltaSeconds),
        y: prevPosition.y + (joystickVector.y * MAX_JOYSTICK_SPEED_MM_S * deltaSeconds),
        z: prevPosition.z,
      }))

      frameHandle = window.requestAnimationFrame(tick)
    }

    frameHandle = window.requestAnimationFrame(tick)
    return () => {
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle)
      }
    }
  }, [joystickVector.x, joystickVector.y, movementMode])

  function setTopButtonRef(id: TopStatusButtonId, node: HTMLButtonElement | null): void {
    topButtonRefs.current[id] = node
  }

  function handlePowerShutdownPlaceholder(): void {
    setPowerPopupNotice('Команда выключения пока не подключена к backend.')
  }

  async function handlePause(): Promise<void> {
    const ok = await executeCommand({ command: 'pause' })
    if (ok) {
      await refresh()
    }
  }

  function handleStopRequest(): void {
    setIsPrintCancelConfirmOpen(true)
  }

  async function handleStopConfirm(): Promise<void> {
    const ok = await executeCommand({ command: 'cancel' })
    if (ok) {
      setActivePrintFileName(null)
      await refresh()
      setActiveScreen('dashboard')
      closePrintCancelConfirm()
    }
  }

  return (
    <main className={`app-root ${isMaxPerformanceModeEnabled ? 'is-performance-mode' : ''}`}>
      <section className="screen-shell" data-testid="screen-shell" ref={screenShellRef}>
        <header className="top-bar">
          <div className="brand-wrap">
            <h1>TreeD Принтер</h1>
            <span className="print-state" data-testid="top-bar-screen-label">{topBarScreenLabel}</span>
          </div>
          <div className="top-icons" aria-label="иконки статуса">
            {TOP_STATUS_BUTTONS.map((item) => (
              <StatusIconButton
                key={item.id}
                icon={item.icon}
                label={item.label}
                tone={item.tone}
                showNotificationDot={item.showNotificationDot}
                className={activeTopPopup === item.id ? 'is-active' : undefined}
                aria-haspopup="dialog"
                aria-expanded={activeTopPopup === item.id}
                onClick={() => openTopPopup(item.id)}
                ref={(node) => setTopButtonRef(item.id, node)}
              />
            ))}
          </div>
        </header>

        <div className={`content-grid ${isFilesScreenActive ? 'is-files-active' : ''}`}>
          {activeScreen === 'dashboard' ? (
            hasActivePrint ? (
              <>
              <section className="job-card">
                <div className="preview-panel">
                  <div className="preview-inner">
                    <PrintPreviewIcon />
                  </div>
                </div>

                <div className="job-info">
                  <p className="job-name">{activePrintFileName ?? DASHBOARD_VALUES.fileName}</p>

                  <div className="job-metrics">
                    <div>
                      <p className="label">Прогресс</p>
                      <p className="job-main-value">{DASHBOARD_VALUES.progressPercent}%</p>
                    </div>
                    <div className="job-metrics-right">
                      <p className="label">Конец</p>
                      <p className="job-main-value">{DASHBOARD_VALUES.etaTime}</p>
                    </div>
                  </div>

                  <div className="job-meter">
                    <div className="job-meter-fill" style={{ width: `${printFill}%` }} />
                  </div>

                  <div className="job-layer-row">
                    <span className="label">Слой</span>
                    <strong>
                      {DASHBOARD_VALUES.layerCurrent} / {DASHBOARD_VALUES.layerTotal}
                    </strong>
                  </div>
                </div>
              </section>

              <section className="right-column">
                <div className="stats-actions-row">
                  <article className="stats-card">
                    <div className="temp-grid">
                      {temperatureMetrics.map((metric) => (
                        <TemperatureMetric
                          key={metric.label}
                          label={metric.label}
                          current={metric.current}
                          target={metric.target}
                          meterTone={metric.meterTone}
                          fillPercent={metric.fillPercent}
                        />
                      ))}
                    </div>

                    <div className="three-up-grid">
                      {quickMetrics.map((metric) => (
                        <PlainMetric
                          key={metric.label}
                          label={metric.label}
                          value={metric.value}
                          unit={metric.unit}
                          valueClassName={metric.valueClassName}
                        />
                      ))}
                    </div>
                  </article>

                  <div className="action-stack" role="group" aria-label="действия печати">
                    <ActionSquareButton
                      icon="actionPause"
                      label={pendingCommand === 'pause' ? 'Пауза...' : 'Пауза'}
                      onClick={() => void handlePause()}
                      disabled={isBusy}
                    />
                    <ActionSquareButton
                      icon="actionStopCritical"
                      tone="danger"
                      label={pendingCommand === 'cancel' ? 'Стоп...' : 'Стоп'}
                      onClick={handleStopRequest}
                      disabled={isBusy}
                    />
                  </div>
                </div>

                <div className="process-row">
                  <article className="process-card">
                    <div className="process-grid">
                      {processMetrics.map((metric) => (
                        <PlainMetric
                          key={metric.label}
                          label={metric.label}
                          value={metric.value}
                          unit={metric.unit}
                          valueClassName="process-value"
                        />
                      ))}
                    </div>
                  </article>

                  <aside className="zoffset-card">
                    <div className="zoffset-head">
                      <p className="label">Z-offset</p>
                      <p className="value zoffset-value">
                        {DASHBOARD_VALUES.zOffsetMm.toFixed(2)}<span>мм</span>
                      </p>
                    </div>
                    <div
                      className="step-selector"
                      role="group"
                      aria-label="шаг babystep"
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
                    <div className="babystep-controls" role="group" aria-label="управление babystep">
                      <button
                        type="button"
                        className="babystep-btn"
                        aria-label={`Babystep минус ${babystepStep}`}
                      >
                        -
                      </button>
                      <button
                        type="button"
                        className="babystep-btn"
                        aria-label={`Babystep плюс ${babystepStep}`}
                      >
                        +
                      </button>
                    </div>
                  </aside>
                </div>
              </section>
              </>
            ) : (
              <section className="dashboard-idle-screen" data-testid="screen-dashboard-idle">
                <div className="dashboard-idle-hero">
                  <div className="dashboard-idle-logo" aria-hidden="true">
                    <img className="dashboard-idle-logo-image" src={treeDLogoAsset} alt="" />
                  </div>
                </div>

                <aside className="dashboard-idle-sidebar">
                  <article className="idle-mini-widget idle-mini-widget-temps">
                    <p className="idle-mini-label">Температура</p>
                    <div className="idle-temp-grid">
                      <p><span>Сопло</span><strong>{idleNozzleTempLabel}</strong></p>
                      <p><span>Стол</span><strong>{idleBedTempLabel}</strong></p>
                    </div>
                  </article>

                  <article className="idle-mini-widget idle-mini-widget-service">
                    <p className="idle-mini-label">ТО</p>
                    <div className="idle-service-metrics">
                      <p><span>Пробег</span><strong>{MAINTENANCE_STATUS.runtimeHours} ч</strong></p>
                      <p><span>До ТО</span><strong>{MAINTENANCE_STATUS.hoursLeft} ч</strong></p>
                    </div>
                    <div className="idle-service-time">
                      <span>Время</span>
                      <strong>{formattedSnapshotTime}</strong>
                    </div>
                  </article>

                  <article className="dashboard-idle-notes" aria-label="Заметки">
                    <h3>Заметки</h3>
                    <textarea
                      ref={idleNotesInputRef}
                      className="dashboard-idle-notes-input"
                      value={idleNotesText}
                      onFocus={handleIdleNotesKeyboardOpen}
                      onChange={handleIdleNotesChange}
                      spellCheck={false}
                      data-testid="idle-notes-input"
                    />
                  </article>
                </aside>

                {isIdleNotesKeyboardOpen ? (
                  <div className="idle-notes-keyboard" data-testid="idle-notes-keyboard">
                    {IDLE_NOTES_KEYBOARD_ROWS.map((row, rowIndex) => (
                      <div className="idle-notes-keyboard-row" key={`idle-notes-keyboard-row-${rowIndex}`}>
                        {row.map((label) => (
                          <button
                            key={label}
                            type="button"
                            className="idle-notes-keyboard-key"
                            aria-label={`Символ ${label}`}
                            onMouseDown={handleIdleNotesKeyMouseDown}
                            onClick={() => handleIdleNotesVirtualKey(label.toLocaleLowerCase('ru-RU'))}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    ))}

                    <div className="idle-notes-keyboard-row idle-notes-keyboard-row-actions">
                      <button
                        type="button"
                        className="idle-notes-keyboard-key idle-notes-keyboard-key-action"
                        aria-label="Удалить символ"
                        onMouseDown={handleIdleNotesKeyMouseDown}
                        onClick={() => handleIdleNotesVirtualKey('backspace')}
                      >
                        ⌫
                      </button>
                      <button
                        type="button"
                        className="idle-notes-keyboard-key idle-notes-keyboard-key-space"
                        aria-label="Пробел"
                        onMouseDown={handleIdleNotesKeyMouseDown}
                        onClick={() => handleIdleNotesVirtualKey('space')}
                      >
                        Пробел
                      </button>
                      <button
                        type="button"
                        className="idle-notes-keyboard-key idle-notes-keyboard-key-action"
                        aria-label="Новая строка"
                        onMouseDown={handleIdleNotesKeyMouseDown}
                        onClick={() => handleIdleNotesVirtualKey('enter')}
                      >
                        ↵
                      </button>
                      <button
                        type="button"
                        className="idle-notes-keyboard-key idle-notes-keyboard-key-close"
                        aria-label="Скрыть клавиатуру"
                        onMouseDown={handleIdleNotesKeyMouseDown}
                        onClick={handleIdleNotesKeyboardClose}
                      >
                        Скрыть
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            )
          ) : isFilesScreenActive ? (
            <section className="files-screen" data-testid="screen-files">
              <div className="files-scroll-area" data-testid="files-scroll-area">
                <header className="files-screen-head">
                  <div className="files-screen-copy">
                    <p className="files-screen-note">Прокрутите вниз, чтобы найти нужную модель.</p>
                  </div>
                  <div className="files-sort-group" role="group" aria-label="Сортировка файлов">
                    <span className="files-sort-indicator" aria-hidden="true" />
                    {FILES_SORT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`files-sort-btn ${filesSortKey === option.id ? 'is-active' : ''}`}
                        aria-pressed={filesSortKey === option.id}
                        data-testid={`files-sort-${option.id}`}
                        onClick={() => handleFilesSortChange(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </header>

                <div className="files-grid" data-testid="file-card-grid">
                  {sortedPrintFiles.length > 0 ? (
                    sortedPrintFiles.map((item) => (
                      <PrintFileCard
                        key={item.id}
                        name={item.name}
                        printTime={item.printTime}
                        weight={item.weight}
                        onClick={() => handlePrintFileSelect(item.id)}
                      />
                    ))
                  ) : (
                    <p className="files-empty">Список файлов пуст.</p>
                  )}
                </div>
              </div>
            </section>
          ) : activeScreen === 'control' ? (
            <section className="control-screen" data-testid="screen-control">
              <div className="control-scroll-area">
                <header className="control-screen-head">
                  <p className="control-screen-note">Парковка, сервисный режим и ручное перемещение осей.</p>
                </header>

                <div className="control-grid">
                  <div className="control-side-stack">
                    <div className="control-side-top">
                      <article className="control-card control-card-parking">
                        <h3 className="control-card-title">Парковка</h3>
                        <SegmentedToggle
                          options={PARKING_MODE_OPTIONS}
                          value={parkingMode}
                          onChange={handleParkingModeChange}
                          ariaLabel="Режим парковки"
                          testIdPrefix="parking-mode"
                        />
                        {parkingMode === 'axis' ? (
                          <SegmentedToggle
                            options={PARKING_AXIS_OPTIONS}
                            value={parkingAxis}
                            onChange={handleParkingAxisChange}
                            ariaLabel="Выбор оси парковки"
                            testIdPrefix="parking-axis"
                          />
                        ) : null}
                        <button
                          type="button"
                          className="control-action-btn"
                          data-testid="parking-action-button"
                          onClick={() => void handleParkingCommand()}
                          disabled={isBusy}
                        >
                          {pendingCommand === 'home'
                            ? 'Парковка...'
                            : parkingMode === 'all'
                              ? 'Парковка по всем осям'
                              : `Парковка оси ${parkingAxis}`}
                        </button>

                        <button
                          type="button"
                          className="control-action-btn control-action-btn-danger"
                          data-testid="motors-disable-button"
                          onClick={handleMotorsDisable}
                          disabled={isBusy}
                        >
                          Отключить моторы
                        </button>
                      </article>

                      <article className="control-card control-card-service">
                        <h3 className="control-card-title">Сервисный режим</h3>
                        <p className="control-status-row">
                          <span>Статус</span>
                          <strong>{isServiceModeEnabled ? 'Включен' : 'Выключен'}</strong>
                        </p>
                        <button
                          type="button"
                          className="control-service-btn"
                          data-testid="service-mode-button"
                          aria-pressed={isServiceModeEnabled}
                          onClick={handleServiceModeToggle}
                        >
                          {isServiceModeEnabled ? 'Выключить сервисный режим' : 'Включить сервисный режим'}
                        </button>
                        <p className="control-card-hint">Используйте только во время обслуживания принтера.</p>
                      </article>
                    </div>

                    <article className="control-card control-card-fan">
                      <h3 className="control-card-title">Управление обдувом</h3>
                      <p className="control-status-row">
                        <span>Обдув модели</span>
                        <strong>{modelFanPercent}%</strong>
                      </p>
                      <HorizontalSteppedSlider
                        value={modelFanPercent}
                        min={MODEL_FAN_BOUNDS_PERCENT.min}
                        max={MODEL_FAN_BOUNDS_PERCENT.max}
                        step={MODEL_FAN_STEP_PERCENT}
                        onChange={handleModelFanPercentChange}
                        disabled={isBusy}
                        testId="model-fan-slider"
                      />
                    </article>
                  </div>

                  <article className="control-card control-card-motion">
                    <h3 className="control-card-title">Перемещение по осям</h3>
                    <SegmentedToggle
                      options={MOVEMENT_MODE_OPTIONS}
                      value={movementMode}
                      onChange={handleMovementModeChange}
                      ariaLabel="Режим перемещения"
                      testIdPrefix="move-mode"
                    />
                    {movementMode === 'buttons' ? (
                      <div className="control-motion-buttons">
                        <SegmentedToggle
                          options={MOVE_STEP_OPTIONS}
                          value={moveStepKey}
                          onChange={handleMoveStepChange}
                          ariaLabel="Шаг перемещения"
                          testIdPrefix="move-step"
                        />
                        <div className="control-coordinates-panel">
                          <p className="joystick-readout" data-testid="axis-coordinates">{axisCoordinatesLabel}</p>
                        </div>
                        <div className="control-cross-wrap">
                          <AxisCrossControls
                            onMove={handleAxisMove}
                            disabled={isBusy}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="joystick-panel">
                        <div className="joystick-xy-control">
                          <p className="joystick-axis-title">XY</p>
                          <VirtualJoystick
                            testId="axis-joystick"
                            disabled={isBusy}
                            onVectorChange={handleJoystickVectorChange}
                          />
                        </div>
                        <div className="joystick-z-control">
                          <p className="joystick-axis-title">Z</p>
                          <VerticalAxisSlider
                            value={printHeadPosition.z}
                            min={HEAD_Z_BOUNDS_MM.min}
                            max={HEAD_Z_BOUNDS_MM.max}
                            step={1}
                            onChange={handleJoystickZChange}
                            minAtTop
                            disabled={isBusy}
                            testId="axis-z-slider"
                          />
                        </div>
                        <div className="joystick-meta">
                          <div className="joystick-meta-block">
                            <p className="joystick-meta-label">Координаты</p>
                            <p className="joystick-readout" data-testid="axis-coordinates">{axisCoordinatesLabel}</p>
                          </div>
                          <div className="joystick-meta-block">
                            <p className="joystick-meta-label">Скорость XY</p>
                            <p className="joystick-readout">{joystickSpeedMmS.toFixed(1)} / 50 мм/с</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                </div>

              </div>
            </section>
          ) : activeScreen === 'settings' ? (
            <section className="settings-screen" data-testid="screen-settings">
              <div className="settings-layout">
                <aside className="settings-menu-shell">
                  <SettingsSidebarMenu
                    options={SETTINGS_GROUP_OPTIONS}
                    value={activeSettingsGroup}
                    onChange={setActiveSettingsGroup}
                    ariaLabel="Группы настроек"
                    testIdPrefix="settings-group"
                  />
                </aside>

                <div className="settings-content-shell">
                  {activeSettingsGroup === 'system' ? (
                    <div className="settings-group-stack">
                      <header className="settings-group-head">
                        <h3>Система</h3>
                        <p>Состояние контроллера и хост-системы.</p>
                      </header>

                      <div className="settings-system-list">
                        <SettingsInfoCard
                          title="mcu"
                          subtitle="stm32f446xx"
                          details={[
                            'Версия: 1.7.7-1-gd825857',
                            'Загрузка: 0.00, Время активности: 0.00',
                            'Частота: 180 MHz',
                          ]}
                          loadPercent={0}
                        />
                        <SettingsInfoCard
                          title="Host"
                          subtitle="armv7l"
                          details={[
                            'Версия: ?',
                            'ОС: Raspbian GNU/Linux 10 (buster)',
                            'Загрузка: 1.52, Память: 414.4 / 636.6 MB',
                            'Температура: 52°C',
                          ]}
                          loadPercent={38}
                        />
                      </div>
                    </div>
                  ) : activeSettingsGroup === 'interface' ? (
                    <div className="settings-group-stack">
                      <header className="settings-group-head">
                        <h3>Интерфейс</h3>
                        <p>Базовые параметры отображения и поведения экрана.</p>
                      </header>

                      <SettingsToggleRow
                        label="Включить темную тему"
                        checked={isDarkThemeEnabled}
                        onChange={setIsDarkThemeEnabled}
                        testId="settings-dark-theme-toggle"
                      />
                      <SettingsToggleRow
                        label="Режим максимальной производительности"
                        checked={isMaxPerformanceModeEnabled}
                        onChange={setIsMaxPerformanceModeEnabled}
                        testId="settings-max-performance-toggle"
                      />
                      <SettingsSelectField
                        label="Спящий режим"
                        value={sleepModeValue}
                        options={SLEEP_MODE_OPTIONS}
                        onChange={setSleepModeValue}
                      />
                      <SettingsSelectField
                        label="Временная зона UTC"
                        value={timezoneValue}
                        options={TIMEZONE_OPTIONS}
                        onChange={setTimezoneValue}
                      />
                    </div>
                  ) : activeSettingsGroup === 'network' ? (
                    <div className="settings-group-stack settings-group-stack-network">
                      <header className="settings-group-head">
                        <h3>Сеть</h3>
                        <p>Поиск и подключение к Wi-Fi сети.</p>
                      </header>

                      <div className="settings-network-layout">
                        <section className="settings-network-panel settings-network-panel-list">
                          <div className="settings-network-toolbar">
                            <label className="settings-network-search">
                              <span>Поиск сети</span>
                              <input
                                ref={wifiSearchInputRef}
                                type="search"
                                value={wifiSearchQuery}
                                onChange={handleWifiSearchQueryChange}
                                onFocus={handleWifiSearchInputFocus}
                                onClick={handleWifiSearchInputFocus}
                                placeholder="Введите имя сети"
                                data-testid="settings-network-search"
                              />
                            </label>
                            <button
                              type="button"
                              className="settings-network-btn settings-network-btn-primary"
                              onClick={handleWifiScan}
                              data-testid="settings-network-scan"
                            >
                              Поиск
                            </button>
                          </div>

                          <div className="settings-network-list" role="listbox" aria-label="Список Wi-Fi сетей">
                            {filteredWifiNetworks.length > 0 ? (
                              filteredWifiNetworks.map((network) => (
                                <button
                                  key={network.id}
                                  type="button"
                                  className={`settings-network-item ${selectedWifiNetworkId === network.id ? 'is-active' : ''}`}
                                  aria-pressed={selectedWifiNetworkId === network.id}
                                  onClick={() => handleWifiNetworkSelect(network.id)}
                                  data-testid={`settings-network-item-${network.id}`}
                                >
                                  <div className="settings-network-item-copy">
                                    <strong>{network.ssid}</strong>
                                    <span>{wifiSecurityLabel(network.security)}</span>
                                  </div>
                                  <div className="settings-network-item-meta">
                                    <span>{network.signalPercent}%</span>
                                    {network.connected ? <em>Подключена</em> : network.saved ? <em>Сохранена</em> : null}
                                  </div>
                                </button>
                              ))
                            ) : (
                              <p className="settings-network-empty">Сети не найдены.</p>
                            )}
                          </div>
                        </section>

                        <section className="settings-network-panel settings-network-panel-connect">
                          {selectedWifiNetwork !== null ? (
                            <>
                              <div className="settings-network-selected">
                                <p className="settings-network-selected-title">{selectedWifiNetwork.ssid}</p>
                                <p className="settings-network-selected-meta">
                                  Защита: {wifiSecurityLabel(selectedWifiNetwork.security)} • Сигнал: {selectedWifiNetwork.signalPercent}%
                                </p>
                              </div>

                              {selectedWifiNetwork.security !== 'open' ? (
                                <label className="settings-network-password-field">
                                  <span>Пароль</span>
                                  <div className="settings-network-password-control">
                                    <input
                                      ref={wifiPasswordInputRef}
                                      type={isWifiPasswordVisible ? 'text' : 'password'}
                                      value={wifiPasswordValue}
                                      onChange={handleWifiPasswordChange}
                                      onFocus={handleWifiPasswordInputFocus}
                                      onClick={handleWifiPasswordInputFocus}
                                      placeholder="Введите пароль"
                                      data-testid="settings-network-password-input"
                                    />
                                    <button
                                      type="button"
                                      className="settings-network-btn"
                                      onClick={handleWifiPasswordVisibilityToggle}
                                      data-testid="settings-network-password-visibility"
                                    >
                                      {isWifiPasswordVisible ? 'Скрыть' : 'Показать'}
                                    </button>
                                  </div>
                                </label>
                              ) : (
                                <p className="settings-network-open-note">Сеть открытая, пароль не требуется.</p>
                              )}

                              <div className="settings-network-actions">
                                <button
                                  type="button"
                                  className="settings-network-btn settings-network-btn-primary"
                                  onClick={handleWifiConnect}
                                  data-testid="settings-network-connect-button"
                                >
                                  Подключить
                                </button>
                                <button
                                  type="button"
                                  className="settings-network-btn"
                                  onClick={handleWifiForgetSelected}
                                  data-testid="settings-network-forget-button"
                                >
                                  Забыть сеть
                                </button>
                              </div>

                              <article className="settings-description-card settings-network-status-card">
                                <p><span>IP адрес</span><strong>{wifiIpLabel}</strong></p>
                                <p><span>Статус</span><strong>{connectedWifiNetwork ? 'Подключено' : connectionLabel}</strong></p>
                              </article>

                              <p className="settings-network-notice" data-testid="settings-network-notice">
                                {wifiConnectionNotice.length > 0 ? wifiConnectionNotice : 'Выберите сеть и выполните подключение.'}
                              </p>
                            </>
                          ) : (
                            <p className="settings-network-empty">Выберите сеть слева.</p>
                          )}
                        </section>
                      </div>
                    </div>
                  ) : activeSettingsGroup === 'notifications' ? (
                    <div className="settings-group-stack settings-group-stack-notifications">
                      <header className="settings-group-head">
                        <h3>Уведомления</h3>
                        <p>Включение/отключение уведомлений и журнал последних событий.</p>
                      </header>
                      <SettingsToggleRow
                        label="Уведомления"
                        checked={isNotificationsEnabled}
                        onChange={setIsNotificationsEnabled}
                        testId="settings-notifications-enabled-toggle"
                      />
                      <SettingsToggleRow
                        label="Звуки уведомлений"
                        checked={isNotificationSoundsEnabled}
                        onChange={setIsNotificationSoundsEnabled}
                        testId="settings-notification-sound-toggle"
                      />
                      <div className="settings-notification-list">
                        {notificationHistory.map((item) => (
                          <article className="settings-notification-item" key={item.id}>
                            <p className="settings-notification-title">
                              <strong>{item.title}</strong>
                              <span>{item.createdAt}</span>
                            </p>
                            <p className="settings-notification-details">{item.details}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : activeSettingsGroup === 'cloud' ? (
                    <div className="settings-group-stack">
                      <header className="settings-group-head">
                        <h3>Облако</h3>
                        <p>Подключение сервиса для AI-контроля ошибок и удалённого мониторинга.</p>
                      </header>
                      <div className="settings-cloud-actions">
                        <button
                          type="button"
                          className="settings-network-btn settings-network-btn-primary"
                          onClick={handleCloudConnectionToggle}
                          data-testid="settings-cloud-connect-toggle"
                        >
                          {isCloudConnected ? 'Отключить облако' : 'Подключить облако'}
                        </button>
                      </div>
                      <SettingsToggleRow
                        label="AI контроль ошибок"
                        checked={isCloudAiMonitoringEnabled}
                        onChange={handleCloudAiMonitoringToggle}
                        testId="settings-cloud-ai-toggle"
                      />
                      <article className="settings-description-card">
                        <p><span>Статус</span><strong>{isCloudConnected ? 'Подключено' : 'Не подключено'}</strong></p>
                        <p><span>Сервис</span><strong>TreeD Cloud Guard</strong></p>
                        <p><span>Режим AI</span><strong>{isCloudAiMonitoringEnabled ? 'Включен' : 'Выключен'}</strong></p>
                      </article>
                      <p className="settings-cloud-notice">{cloudConnectionNotice}</p>
                    </div>
                  ) : activeSettingsGroup === 'device' ? (
                    <div className="settings-group-stack">
                      <header className="settings-group-head">
                        <h3>Об устройстве</h3>
                        <p>Основная информация о контроллере и программной конфигурации.</p>
                      </header>
                      <article className="settings-description-card">
                        {DEVICE_INFO_LINES.map(([label, value]) => (
                          <p key={label}><span>{label}</span><strong>{value}</strong></p>
                        ))}
                      </article>
                    </div>
                  ) : activeSettingsGroup === 'updates' ? (
                    <div className="settings-group-stack">
                      <header className="settings-group-head">
                        <h3>Обновления</h3>
                        <p>Проверка актуальности версии и доступных обновлений.</p>
                      </header>
                      <article className="settings-description-card">
                        <p><span>Текущая версия</span><strong>{UPDATE_CURRENT_VERSION}</strong></p>
                        <p><span>Доступная версия</span><strong>{availableUpdateVersion ?? 'Нет данных'}</strong></p>
                      </article>
                      <div className="settings-cloud-actions">
                        <button
                          type="button"
                          className="settings-network-btn settings-network-btn-primary"
                          onClick={handleCheckUpdates}
                          data-testid="settings-check-updates-button"
                          disabled={isCheckingUpdates}
                        >
                          {isCheckingUpdates ? 'Проверка...' : 'Проверить обновления'}
                        </button>
                      </div>
                      <p className="settings-cloud-notice">{updateNotice}</p>
                    </div>
                  ) : activeSettingsGroup === 'language' ? (
                    <div className="settings-group-stack">
                      <header className="settings-group-head">
                        <h3>Язык</h3>
                        <p>Локализация интерфейса и голосовых подсказок.</p>
                      </header>
                      <SettingsSelectField
                        label="Язык интерфейса"
                        value={languageValue}
                        options={LANGUAGE_OPTIONS}
                        onChange={setLanguageValue}
                      />
                      <SettingsToggleRow
                        label="Внешний голосовой ассистент"
                        checked={isExternalVoiceEnabled}
                        onChange={setIsExternalVoiceEnabled}
                        testId="settings-external-voice-toggle"
                      />
                    </div>
                  ) : (
                    <div className="settings-group-stack settings-group-stack-console">
                      <header className="settings-group-head">
                        <h3>Консоль</h3>
                        <p>Отправка G-code и макросов через виртуальную клавиатуру.</p>
                      </header>

                      <div className="settings-console-quick">
                        {CONSOLE_QUICK_COMMANDS.map((command, index) => (
                          <button
                            key={command}
                            type="button"
                            className="settings-console-chip"
                            onClick={() => handleConsoleQuickCommandInsert(command)}
                            data-testid={`settings-console-quick-${index}`}
                          >
                            {command}
                          </button>
                        ))}
                      </div>

                      <label className="settings-console-input-wrap">
                        <span>Команда</span>
                        <textarea
                          ref={consoleInputRef}
                          className="settings-console-input"
                          value={consoleCommandValue}
                          onChange={handleConsoleInputChange}
                          onFocus={handleConsoleKeyboardOpen}
                          placeholder="Например: G28 или START_PRINT"
                          spellCheck={false}
                          data-testid="settings-console-input"
                        />
                      </label>

                      <div className="settings-console-actions">
                        <button
                          type="button"
                          className="settings-network-btn settings-network-btn-primary"
                          onClick={handleConsoleSubmit}
                          data-testid="settings-console-send-button"
                        >
                          Отправить
                        </button>
                        <button
                          type="button"
                          className="settings-network-btn"
                          onClick={handleConsoleKeyboardOpen}
                          data-testid="settings-console-keyboard-open-button"
                        >
                          Клавиатура
                        </button>
                      </div>

                      <p className="settings-console-notice" data-testid="settings-console-notice">{consoleNotice}</p>

                      <div className="settings-console-history">
                        {consoleHistory.length > 0 ? (
                          consoleHistory.map((item) => (
                            <article className="settings-console-history-item" key={item.id}>
                              <p><strong>{item.command}</strong><span>{item.createdAt}</span></p>
                            </article>
                          ))
                        ) : (
                          <p className="settings-network-empty">История команд пока пуста.</p>
                        )}
                      </div>

                    </div>
                  )}
                </div>
              </div>
              {false ? (
                <div
                  className="settings-keyboard-layer"
                  role="presentation"
                  onClick={handleSettingsKeyboardClose}
                  data-testid="settings-keyboard-layer"
                >
                  <div
                    className="settings-keyboard-popup"
                    role="dialog"
                    aria-modal="true"
                    aria-label={settingsKeyboardLabel}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <SettingsVirtualKeyboard
                      valueLabel={settingsKeyboardLabel}
                      value={settingsKeyboardValue}
                      placeholder={settingsKeyboardPlaceholder}
                      rows={SETTINGS_VIRTUAL_KEYBOARD_ROWS}
                      onKeyPress={handleSettingsVirtualKey}
                      onClose={handleSettingsKeyboardClose}
                      onKeyMouseDown={handleSettingsKeyboardKeyMouseDown}
                      showEnterKey={isConsoleSettingsKeyboardOpen}
                      testId={settingsKeyboardTestId}
                      previewTestId={settingsKeyboardPreviewTestId}
                    />
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="screen-placeholder" data-testid={`screen-${activeScreen}`}>
              <p className="screen-placeholder-body">{SCREEN_PLACEHOLDERS[activeScreen].description}</p>
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
              onClick={() => setActiveScreen(item.id)}
            />
          ))}
        </nav>

        {activeKeyboardTarget !== null ? (
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
                valueLabel={keyboardLabel}
                value={activeKeyboardTarget === 'wifiSearch' ? wifiSearchQuery : settingsKeyboardValue}
                placeholder={keyboardPlaceholder}
                language={keyboardLanguage}
                isCapsEnabled={isKeyboardCapsEnabled}
                onToggleLanguage={handleVirtualKeyboardLanguageToggle}
                onToggleCaps={handleVirtualKeyboardCapsToggle}
                onKeyPress={handleVirtualKeyboardKey}
                onClose={handleKeyboardClose}
                onKeyMouseDown={handleVirtualKeyboardKeyMouseDown}
                showEnterKey={isConsoleSettingsKeyboardOpen}
                testId={keyboardTestId}
                previewTestId={keyboardPreviewTestId}
              />
            </div>
          </div>
        ) : null}

        {selectedPrintFile !== null ? (
          <div className="file-modal-layer" role="presentation" onClick={closeFileModal}>
            <section
              className="file-modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={FILE_MODAL_TITLE_ID}
              data-testid="print-file-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="file-modal-head">
                <h2 id={FILE_MODAL_TITLE_ID}>Файл печати</h2>
                <button type="button" className="file-modal-close" aria-label="Закрыть окно файла" onClick={closeFileModal}>
                  ×
                </button>
              </header>

              <div className="file-modal-preview" aria-hidden="true">
                <PrintPreviewIcon />
              </div>

              <p className="file-modal-name">{selectedPrintFile.name}</p>

              <dl className="file-modal-meta">
                <div>
                  <dt>Время печати</dt>
                  <dd>{selectedPrintFile.printTime}</dd>
                </div>
                <div>
                  <dt>Масса</dt>
                  <dd>{selectedPrintFile.weight}</dd>
                </div>
                <div>
                  <dt>Материал</dt>
                  <dd>{selectedPrintFile.material}</dd>
                </div>
              </dl>

              <div className="file-modal-actions">
                <button
                  type="button"
                  className="file-modal-action"
                  data-testid="print-file-start-button"
                  onClick={() => void handleStartSelectedFile()}
                  disabled={isBusy}
                >
                  {pendingCommand === 'start' ? 'Запуск...' : 'Старт печати'}
                </button>
                <button
                  type="button"
                  className="file-modal-action file-modal-action-danger"
                  data-testid="print-file-delete-button"
                  onClick={handleDeleteSelectedFile}
                  disabled={isBusy}
                >
                  Удалить файл
                </button>
              </div>
            </section>
          </div>
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
                </div>
              ) : null}

              {activeTopPopup === 'notifications' ? (
                <div className="top-popup-content">
                  <p className="top-popup-note">Последнее сообщение от принтера:</p>
                  <ul className="top-popup-list">
                    <li>{snapshot.message}</li>
                  </ul>
                  <p className="top-popup-secondary">Новые системные уведомления будут добавляться в этот список.</p>
                </div>
              ) : null}

              {activeTopPopup === 'power' ? (
                <div className="top-popup-content">
                  <p className="top-popup-warning">
                    Выключение принтера остановит текущую задачу и потребует ручного запуска питания.
                  </p>
                  <div className="top-popup-actions">
                    <button type="button" className="top-popup-action top-popup-action-danger" onClick={handlePowerShutdownPlaceholder}>
                      Выключить принтер
                    </button>
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
