import type { WifiNetworkItem, WifiNetworkSecurity } from '@treed/printer-logic'
import type { SettingsMenuOption } from '../ui'

export type { WifiNetworkItem, WifiNetworkSecurity }

export type SettingsGroupId =
  | 'system'
  | 'interface'
  | 'network'
  | 'notifications'
  | 'cloud'
  | 'device'
  | 'updates'
  | 'language'
  | 'console'

export type SettingsNotificationItem = {
  id: string
  title: string
  details: string
  createdAt: string
}

export const SETTINGS_GROUP_OPTIONS: Array<SettingsMenuOption<SettingsGroupId>> = [
  { id: 'network', label: 'Сеть', icon: 'statusWifi' },
  { id: 'system', label: 'Система', icon: 'menuSettings' },
  { id: 'interface', label: 'Интерфейс', icon: 'menuInterface' },
  { id: 'notifications', label: 'Уведомления', icon: 'statusNotification' },
  { id: 'cloud', label: 'Облако', icon: 'statusCloud' },
  { id: 'device', label: 'Об устройстве', icon: 'menuDevice' },
  { id: 'updates', label: 'Обновления', icon: 'menuUpdates' },
  { id: 'language', label: 'Язык', icon: 'menuLanguage' },
  { id: 'console', label: 'Консоль', icon: 'menuControl' },
]

export const SLEEP_MODE_OPTIONS = ['30 сек', '1 мин', '5 мин', '10 мин'] as const

export const TIMEZONE_OPTIONS = [
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

export const DEFAULT_TIMEZONE_OPTION = '(UTC+03:00) Москва, Санкт-Петербург'
export const LANGUAGE_OPTIONS = ['Русский', 'English'] as const
export const UPDATE_CURRENT_VERSION = '0.1.0'
export const UPDATE_AVAILABLE_VERSION = '0.1.1'

export const SETTINGS_NOTIFICATION_HISTORY: SettingsNotificationItem[] = [
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
    details: 'До планового Т.О осталось 126 часов.',
    createdAt: '10:08',
  },
]

export const DEVICE_INFO_LINES = [
  ['Модель', 'TreeD V2'],
  ['Host', 'Rock Pi / Armbian Debian 12'],
  ['Main MCU', 'Octopus Pro CAN'],
  ['Toolhead MCU', 'EBB42 CAN'],
  ['Probe', 'Eddy Duo CAN'],
  ['Профиль', 'treed_v2_corexy_v1'],
] as const

export const CONSOLE_QUICK_COMMANDS = [
  'G28',
  'BED_MESH_CALIBRATE',
  'M104 S200',
  'M140 S60',
  'START_PRINT',
] as const

export const WIFI_NETWORK_LIBRARY: WifiNetworkItem[] = [
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

export const DEFAULT_SELECTED_WIFI_NETWORK_ID =
  WIFI_NETWORK_LIBRARY.find((item) => item.connected)?.id ?? WIFI_NETWORK_LIBRARY[0]?.id ?? null
