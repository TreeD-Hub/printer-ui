import type { UiIconName } from '../ui/iconAssets'

export type TemperatureMetricDefinition = {
  key: 'nozzle' | 'bed'
  label: string
  target: number
  meterTone: 'orange' | 'green'
}

export const TEMPERATURE_METRIC_DEFINITIONS: readonly TemperatureMetricDefinition[] = [
  { key: 'nozzle', label: 'Сопло', target: 220, meterTone: 'orange' },
  { key: 'bed', label: 'Стол', target: 60, meterTone: 'green' },
]

export const DASHBOARD_VALUES = {
  fileName: 'test_cube_v2.gcode',
  progressPercent: 67,
  etaTime: '12:34',
  layerCurrent: 145,
  layerTotal: 218,
} as const

export const BABYSTEP_STEP_OPTIONS = [0.1, 0.05, 0.025] as const

export type TopStatusButtonId = 'wifi' | 'cloud' | 'notifications' | 'power'

export type StatusButtonAsset = {
  id: TopStatusButtonId
  icon: UiIconName
  label: string
  tone?: 'default' | 'danger'
  showNotificationDot?: boolean
}

export const TOP_STATUS_BUTTONS: readonly StatusButtonAsset[] = [
  { id: 'wifi', icon: 'statusWifi', label: 'Статус Wi-Fi' },
  { id: 'cloud', icon: 'statusCloud', label: 'Статус облака' },
  { id: 'notifications', icon: 'statusNotification', label: 'Уведомления', showNotificationDot: true },
  { id: 'power', icon: 'statusPower', label: 'Питание', tone: 'danger' },
]

export type ScreenId = 'dashboard' | 'control' | 'files' | 'macros' | 'settings'

export type NavItemAsset = {
  id: ScreenId
  icon: UiIconName
  label: string
}

export const BOTTOM_NAV_ITEMS: readonly NavItemAsset[] = [
  { id: 'dashboard', icon: 'menuDashboard', label: 'Главная' },
  { id: 'control', icon: 'menuControl', label: 'Управление' },
  { id: 'files', icon: 'menuFiles', label: 'Файлы' },
  { id: 'macros', icon: 'menuMacros', label: 'Макросы' },
  { id: 'settings', icon: 'menuSettings', label: 'Настройки' },
]

export type QuickMetricDefinition = {
  key: 'fan' | 'flow'
  label: string
  unit: string
  valueClassName: 'process-value' | 'percent'
}

export const QUICK_METRIC_DEFINITIONS: readonly QuickMetricDefinition[] = [
  {
    key: 'fan',
    label: 'Обдув',
    unit: '%',
    valueClassName: 'percent',
  },
  {
    key: 'flow',
    label: 'Поток',
    unit: '%',
    valueClassName: 'percent',
  },
]

export type ProcessMetricDefinition = {
  key: 'speed' | 'accel' | 'kFactor' | 'retract'
  label: string
  unit?: string
}

export const PROCESS_METRIC_DEFINITIONS: readonly ProcessMetricDefinition[] = [
  { key: 'speed', label: 'Скорость', unit: '%' },
  { key: 'accel', label: 'Ускорение', unit: 'мм/с²' },
  { key: 'kFactor', label: 'K-factor' },
  { key: 'retract', label: 'Откат', unit: 'мм' },
]
