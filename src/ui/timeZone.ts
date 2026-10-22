import { createContext, useContext } from 'react'

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
export const TIMEZONE_STORAGE_KEY = 'treed-shell.timezone'
export const TimeZoneContext = createContext(180)

export function useTimeZoneOffset(): number {
  return useContext(TimeZoneContext)
}

export function isTimeZoneOption(value: string): boolean {
  return TIMEZONE_OPTIONS.some((option) => option === value)
}

export function readTimeZonePreference(): string {
  try {
    const value = window.localStorage.getItem(TIMEZONE_STORAGE_KEY)
    if (value !== null && isTimeZoneOption(value)) return value
  } catch {
    // При недоступном хранилище экран работает с московским временем.
  }
  return DEFAULT_TIMEZONE_OPTION
}

export function getTimeZoneOffsetMinutes(value: string): number {
  if (!isTimeZoneOption(value)) return 180
  const offset = /^\(UTC([+-])(\d{2}):(\d{2})\)/.exec(value)!
  return (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '-' ? -1 : 1)
}

export function formatUiDateTime(
  value: string | number,
  offsetMinutes: number,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' },
): string {
  // В списке заданы фиксированные смещения UTC; системный пояс и летнее время не применяются.
  const date = new Date(new Date(value).getTime() + offsetMinutes * 60_000)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ru-RU', { ...options, timeZone: 'UTC' })
}
