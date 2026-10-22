export type UiTheme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'treed-shell.theme'
export const DEFAULT_THEME: UiTheme = 'dark'

export function readThemePreference(): UiTheme {
  try {
    const theme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (theme === 'dark' || theme === 'light') return theme
  } catch {
    // При недоступном хранилище интерфейс запускается в тёмной теме.
  }
  return DEFAULT_THEME
}

export function applyTheme(theme: UiTheme): void {
  document.documentElement.dataset.theme = theme
}

export function initializeTheme(): UiTheme {
  const theme = readThemePreference()
  applyTheme(theme)
  return theme
}
