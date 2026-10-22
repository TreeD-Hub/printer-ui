import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHostNetworkClient, createHostUpdateClient, createMockSnapshot } from '../../mocks/runtime'
import { initializeTheme, readThemePreference, THEME_STORAGE_KEY } from '../ui/theme'
import { useSettingsController } from './settingsController'

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
  window.localStorage.removeItem(THEME_STORAGE_KEY)
  document.documentElement.dataset.theme = 'dark'
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.removeItem(THEME_STORAGE_KEY)
  document.documentElement.dataset.theme = 'dark'
})

describe('тема интерфейса', () => {
  it('использует тёмную тему при отсутствии, некорректной настройке и отказе чтения', () => {
    expect(readThemePreference()).toBe('dark')
    window.localStorage.setItem(THEME_STORAGE_KEY, 'system')
    expect(readThemePreference()).toBe('dark')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(readThemePreference()).toBe('dark')
  })

  it('восстанавливает тему и применяет её до первого рендера', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    expect(initializeTheme()).toBe('light')
    function ThemeProbe() {
      return <output>{document.documentElement.dataset.theme}</output>
    }
    render(<ThemeProbe />)
    expect(screen.getByText('light')).toBeInTheDocument()
  })

  it('переключает тему, сохраняет выбор и восстанавливает его после повторного монтирования', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result, unmount } = renderSettings()
    await act(async () => {})
    expect(setItem).not.toHaveBeenCalled()
    act(() => result.current.pageProps.interfaceSettings.onDarkThemeChange(false))
    expect(result.current.pageProps.interfaceSettings.isDarkThemeEnabled).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    unmount()

    const restored = renderSettings()
    await act(async () => {})
    expect(restored.result.current.pageProps.interfaceSettings.isDarkThemeEnabled).toBe(false)
    act(() => restored.result.current.pageProps.interfaceSettings.onDarkThemeChange(true))
    expect(restored.result.current.pageProps.interfaceSettings.isDarkThemeEnabled).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('применяет тему на сеанс и сообщает об отказе сохранения', async () => {
    const { result } = renderSettings()
    await act(async () => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('denied') })
    act(() => result.current.pageProps.interfaceSettings.onDarkThemeChange(false))
    expect(result.current.pageProps.interfaceSettings.isDarkThemeEnabled).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(result.current.pageProps.interfaceSettings.themeNotice).toContain('Не удалось сохранить')
    act(() => result.current.pageProps.interfaceSettings.onDarkThemeChange(true))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(result.current.pageProps.interfaceSettings.themeNotice).toBe('')
  })
})
