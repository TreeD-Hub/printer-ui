const SCREEN_WIDTH = 960
const SCREEN_HEIGHT = 544
const CSS_PPI = 96
const DEFAULT_PHYSICAL_DIAGONAL = 5

export type PreviewMode = 'none' | '1x1' | 'physical'

export type PreviewSettings = {
  mode: PreviewMode
  diagonalInches?: number
}

export function clampPercent(current: number, target: number): number {
  if (target <= 0) {
    return 0
  }

  const value = (current / target) * 100
  return Math.max(0, Math.min(100, value))
}

export function rounded(value: number): string {
  return `${Math.round(value)}`
}

export function statusLabel(raw: string): string {
  if (!raw) {
    return 'Печать'
  }

  const lower = raw.toLowerCase()

  switch (lower) {
    case 'printing':
      return 'Печать'
    case 'standby':
      return 'Ожидание'
    case 'paused':
      return 'Пауза'
    case 'complete':
      return 'Завершено'
    default:
      return raw.charAt(0).toUpperCase() + raw.slice(1)
  }
}

export function resolvePreviewSettings(search: string): PreviewSettings {
  const params = new URLSearchParams(search)
  const view = (params.get('view') ?? '').toLowerCase()

  if (view === '1x1') {
    return { mode: '1x1' }
  }

  if (view === 'physical-5') {
    return { mode: 'physical', diagonalInches: 5 }
  }

  if (view === 'physical-6') {
    return { mode: 'physical', diagonalInches: 6 }
  }

  if (view === 'physical') {
    const rawDiagonal = Number(params.get('diag'))
    if (Number.isFinite(rawDiagonal) && rawDiagonal > 0) {
      return { mode: 'physical', diagonalInches: rawDiagonal }
    }
    return { mode: 'physical', diagonalInches: DEFAULT_PHYSICAL_DIAGONAL }
  }

  return { mode: 'none' }
}

export function calculatePreviewZoom(settings: PreviewSettings, devicePixelRatio: number): number {
  if (settings.mode === 'none') {
    return 1
  }

  const ratio = devicePixelRatio || 1
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 1
  }

  if (settings.mode === '1x1') {
    return 1 / ratio
  }

  const diagonalInches = settings.diagonalInches ?? DEFAULT_PHYSICAL_DIAGONAL
  const targetPpi = Math.sqrt(SCREEN_WIDTH ** 2 + SCREEN_HEIGHT ** 2) / diagonalInches
  const desktopPpiApprox = CSS_PPI * ratio
  const zoom = desktopPpiApprox / targetPpi
  return Math.max(0.2, Math.min(2, zoom))
}
