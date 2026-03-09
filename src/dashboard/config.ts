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
  flowPercent: 95,
  fileName: 'test_cube_v2.gcode',
  progressPercent: 67,
  etaTime: '12:34',
  layerCurrent: 145,
  layerTotal: 218,
  speedMmS: 180,
  accelMmS2: 6000,
  volumetricFlowMm3S: 14.2,
  kFactorLaPa: 0.035,
  retractMm: 0.8,
  zOffsetMm: -0.08,
} as const

export const BABYSTEP_STEP_OPTIONS = [0.1, 0.05, 0.025] as const

export type StatusButtonAsset = {
  icon: UiIconName
  label: string
  tone?: 'default' | 'danger'
  showNotificationDot?: boolean
}

export const TOP_STATUS_BUTTONS: readonly StatusButtonAsset[] = [
  { icon: 'statusWifi', label: 'Статус Wi-Fi' },
  { icon: 'statusCloud', label: 'Статус облака' },
  { icon: 'statusNotification', label: 'Уведомления', showNotificationDot: true },
  { icon: 'statusPower', label: 'Питание', tone: 'danger' },
]

export type NavItemAsset = {
  icon: UiIconName
  label: string
  active?: boolean
}

export const BOTTOM_NAV_ITEMS: readonly NavItemAsset[] = [
  { icon: 'menuDashboard', label: 'Главная', active: true },
  { icon: 'menuControl', label: 'Управление' },
  { icon: 'menuFiles', label: 'Файлы' },
  { icon: 'menuMacros', label: 'Макросы' },
  { icon: 'menuSettings', label: 'Настройки' },
]

export type QuickMetricDefinition = {
  key: 'volumetricFlow' | 'fan' | 'flow'
  label: string
  unit: string
  valueClassName: 'process-value' | 'percent'
}

export const QUICK_METRIC_DEFINITIONS: readonly QuickMetricDefinition[] = [
  {
    key: 'volumetricFlow',
    label: 'Объемный расход',
    unit: 'мм³/с',
    valueClassName: 'process-value',
  },
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
  { key: 'speed', label: 'Скорость', unit: 'мм/с' },
  { key: 'accel', label: 'Ускорение', unit: 'мм/с²' },
  { key: 'kFactor', label: 'K-factor' },
  { key: 'retract', label: 'Откат', unit: 'мм' },
]
