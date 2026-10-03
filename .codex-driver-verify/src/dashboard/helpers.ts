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
