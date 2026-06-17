import type { DashboardTuneGroupId } from '../dashboard/DashboardPage'

export type PrintTuneNumericKeyboardTarget =
  | 'flow'
  | 'speed'
  | 'accel'
  | 'kFactor'
  | 'retract'

export type PrintTuneGroupId = DashboardTuneGroupId
export type TemperatureChartMode = 'nozzle' | 'bed' | 'both'

export type PrintTuneKeyboardMeta = {
  label: string
  unit: string
  min: number
  max: number
  fractionDigits: number
  allowDecimal: boolean
}

export const PRINT_TUNE_GROUP_META: Record<PrintTuneGroupId, { label: string; note: string }> = {
  nozzle: {
    label: 'Температуры',
    note: '',
  },
  bed: {
    label: 'Температуры',
    note: '',
  },
  fan: {
    label: 'Обдув',
    note: 'Настройте обдув модели.',
  },
  flow: {
    label: 'Поток',
    note: 'Настройте поток экструдера.',
  },
  speed: {
    label: 'Скорость',
    note: 'Настройте скорость печати.',
  },
  accel: {
    label: 'Ускорение',
    note: 'Настройте ускорение печати.',
  },
  kFactor: {
    label: 'K-factor',
    note: 'Настройте pressure advance (K-factor).',
  },
  retract: {
    label: 'Откат',
    note: 'Настройте параметры отката.',
  },
}

function clampAxisValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function formatTuneKeyboardValue(value: number, fractionDigits: number): string {
  if (fractionDigits <= 0) {
    return String(Math.round(value))
  }

  return value
    .toFixed(fractionDigits)
    .replace(/\.?0+$/, '')
}

export function resolvePrintTuneKeyboardMeta(target: PrintTuneNumericKeyboardTarget): PrintTuneKeyboardMeta {
  if (target === 'flow') {
    return { label: 'Поток', unit: '%', min: 50, max: 150, fractionDigits: 0, allowDecimal: false }
  }
  if (target === 'speed') {
    return { label: 'Скорость', unit: '%', min: 10, max: 300, fractionDigits: 0, allowDecimal: false }
  }
  if (target === 'accel') {
    return { label: 'Ускорение', unit: 'мм/с²', min: 500, max: 12000, fractionDigits: 0, allowDecimal: false }
  }
  if (target === 'kFactor') {
    return { label: 'K-factor', unit: '', min: 0, max: 0.2, fractionDigits: 3, allowDecimal: true }
  }
  if (target === 'retract') {
    return { label: 'Откат', unit: 'мм', min: 0, max: 5, fractionDigits: 1, allowDecimal: true }
  }

  const exhaustiveTarget: never = target
  throw new Error(`Unknown print tune keyboard target: ${exhaustiveTarget}`)
}

export function appendPrintTuneKeyboardDigit(currentValue: string, digit: string): string {
  const nextValue = `${currentValue}${digit}`.replace(/^0+(?=\d)/, '')
  return nextValue.slice(0, 7)
}

export function appendPrintTuneKeyboardDecimal(currentValue: string, allowDecimal: boolean): string {
  if (!allowDecimal) {
    return currentValue
  }

  if (currentValue.includes('.')) {
    return currentValue
  }

  if (currentValue.length === 0) {
    return '0.'
  }

  return `${currentValue}.`
}

export function normalizePrintTuneKeyboardValue(inputValue: string, meta: PrintTuneKeyboardMeta): number | null {
  if (inputValue.trim().length === 0) {
    return null
  }

  const parsed = Number(inputValue.replace(',', '.'))
  if (Number.isNaN(parsed)) {
    return null
  }

  return Number(
    clampAxisValue(parsed, meta.min, meta.max)
      .toFixed(meta.fractionDigits),
  )
}
