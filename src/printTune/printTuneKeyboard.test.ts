import { describe, expect, it } from 'vitest'

import {
  appendPrintTuneKeyboardDecimal,
  appendPrintTuneKeyboardDigit,
  formatTuneKeyboardValue,
  normalizePrintTuneKeyboardValue,
  resolvePrintTuneKeyboardMeta,
} from './printTuneKeyboard'

describe('print tune keyboard helpers', () => {
  it('keeps keyboard entry compact while typing digits', () => {
    expect(appendPrintTuneKeyboardDigit('0', '5')).toBe('5')
    expect(appendPrintTuneKeyboardDigit('1234567', '8')).toBe('1234567')
  })

  it('adds decimal separator only for decimal-capable targets', () => {
    expect(appendPrintTuneKeyboardDecimal('', true)).toBe('0.')
    expect(appendPrintTuneKeyboardDecimal('12', true)).toBe('12.')
    expect(appendPrintTuneKeyboardDecimal('12.', true)).toBe('12.')
    expect(appendPrintTuneKeyboardDecimal('12', false)).toBe('12')
  })

  it('normalizes submitted value by target bounds and precision', () => {
    expect(normalizePrintTuneKeyboardValue('999', resolvePrintTuneKeyboardMeta('flow'))).toBe(150)
    expect(normalizePrintTuneKeyboardValue('0.256', resolvePrintTuneKeyboardMeta('kFactor'))).toBe(0.2)
    expect(normalizePrintTuneKeyboardValue('999', resolvePrintTuneKeyboardMeta('speed'))).toBe(300)
    expect(normalizePrintTuneKeyboardValue('9', resolvePrintTuneKeyboardMeta('speed'))).toBe(10)
    expect(normalizePrintTuneKeyboardValue('abc', resolvePrintTuneKeyboardMeta('speed'))).toBeNull()
  })

  it('formats values without noisy trailing zeroes', () => {
    expect(formatTuneKeyboardValue(12, 0)).toBe('12')
    expect(formatTuneKeyboardValue(12.3, 1)).toBe('12.3')
    expect(formatTuneKeyboardValue(0.2, 3)).toBe('0.2')
  })
})
