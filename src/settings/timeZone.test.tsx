import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHostNetworkClient, createHostUpdateClient, createMockSnapshot } from '../../mocks/runtime'
import { receivePrinterGcodeResponse } from '../core/store/printerNotifications'
import { TemperatureTrendChart } from '../ui/printTuneWidgets'
import { usePrintSessionController } from '../printSession/usePrintSessionController'
import { PRINT_FILE_LIBRARY } from '../printFiles'
import {
  DEFAULT_TIMEZONE_OPTION,
  formatUiDateTime,
  getTimeZoneOffsetMinutes,
  readTimeZonePreference,
  TIMEZONE_STORAGE_KEY,
  TimeZoneContext,
} from '../ui/timeZone'
import { useSettingsController } from './settingsController'

const DELHI = '(UTC+05:30) Нью-Дели, Мумбаи'
const WEST = '(UTC-12:00) Международная линия перемены дат (запад)'

function renderSettings() {
  const args = {
    snapshot: createMockSnapshot(),
    connectionLabel: 'Подключено',
    networkClient: createHostNetworkClient(),
    updateClient: createHostUpdateClient(),
    executeCommand: vi.fn().mockResolvedValue(true),
    getCommandBlockReason: () => null,
    activeKeyboardTarget: null,
    openKeyboard: () => undefined,
    closeKeyboard: () => undefined,
  }
  return renderHook(() => useSettingsController(args))
}

beforeEach(() => {
  window.localStorage.removeItem(TIMEZONE_STORAGE_KEY)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  window.localStorage.removeItem(TIMEZONE_STORAGE_KEY)
})

describe('часовой пояс интерфейса', () => {
  it('выбирает Москву по умолчанию и при некорректной или недоступной настройке', () => {
    expect(readTimeZonePreference()).toBe(DEFAULT_TIMEZONE_OPTION)
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, 'UTC+99:99')
    expect(readTimeZonePreference()).toBe(DEFAULT_TIMEZONE_OPTION)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(readTimeZonePreference()).toBe(DEFAULT_TIMEZONE_OPTION)
  })

  it.each([
    [DEFAULT_TIMEZONE_OPTION, '23.10.2026', '01:45'],
    [DELHI, '23.10.2026', '04:15'],
    [WEST, '22.10.2026', '10:45'],
  ])('отображает дату и время для %s независимо от системного пояса', (option, date, time) => {
    const formatted = formatUiDateTime('2026-10-22T22:45:00Z', getTimeZoneOffsetMinutes(option), {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    expect(formatted).toContain(date)
    expect(formatted).toContain(time)
  })

  it('не падает при некорректной метке времени', () => {
    expect(formatUiDateTime('invalid', 180)).toBe('—')
  })

  it('сохраняет выбор, восстанавливает его после запуска и пересчитывает прежние записи консоли', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-22T22:45:00Z'))
    const { result, unmount } = renderSettings()
    await act(async () => {})
    act(() => receivePrinterGcodeResponse('timezone response'))
    expect(result.current.pageProps.console.history[0].createdAt).toBe('01:45:00')
    act(() => result.current.pageProps.interfaceSettings.onTimezoneChange(DELHI))
    expect(result.current.pageProps.console.history[0].createdAt).toBe('04:15:00')
    expect(window.localStorage.getItem(TIMEZONE_STORAGE_KEY)).toBe(DELHI)
    act(() => result.current.pageProps.interfaceSettings.onTimezoneChange('UTC+99:99'))
    expect(result.current.pageProps.interfaceSettings.timezoneValue).toBe(DELHI)
    unmount()
    const restored = renderSettings()
    await act(async () => {})
    expect(restored.result.current.pageProps.interfaceSettings.timezoneValue).toBe(DELHI)
  })

  it('применяет выбор на сеанс и сообщает об отказе сохранения', async () => {
    const { result } = renderSettings()
    await act(async () => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    act(() => result.current.pageProps.interfaceSettings.onTimezoneChange(DELHI))
    expect(result.current.pageProps.interfaceSettings.timezoneValue).toBe(DELHI)
    expect(result.current.pageProps.interfaceSettings.timezoneNotice).toContain('Не удалось сохранить')
    expect(readTimeZonePreference()).toBe(DEFAULT_TIMEZONE_OPTION)
  })

  it('обновляет подписи графика при смене пояса без изменения временных точек', () => {
    const timestamp = Date.parse('2026-10-22T22:45:00Z')
    const series = [{ id: 'nozzle' as const, label: 'Сопло', tone: 'orange' as const, points: [{ timestamp, current: 20, target: 0 }] }]
    const chart = (offset: number) => <TimeZoneContext.Provider value={offset}>
      <TemperatureTrendChart series={series} testId="timezone-chart" />
    </TimeZoneContext.Provider>
    const { rerender } = render(chart(180))
    expect(screen.getByTestId('timezone-chart')).toHaveTextContent('01:45')
    rerender(chart(330))
    expect(screen.getByTestId('timezone-chart')).toHaveTextContent('04:15')
    expect(series[0].points[0].timestamp).toBe(timestamp)
  })

  it('показывает один прогноз окончания печати в выбранных часовых поясах', () => {
    const snapshot = createMockSnapshot()
    const file = { ...PRINT_FILE_LIBRARY[0], printTime: '1 ч 40 мин' }
    snapshot.source = 'live'
    snapshot.updatedAt = '2026-10-22T22:45:00Z'
    snapshot.printFiles = [file]
    snapshot.printJob = { ...snapshot.printJob, state: 'printing', filename: file.name, filePath: file.path, progress: 0.5 }
    const { result } = renderHook(() => usePrintSessionController({ snapshot }))
    expect(result.current.getAdjustedEtaTime(180)).toBe('02:35')
    expect(result.current.getAdjustedEtaTime(330)).toBe('05:05')
  })
})
