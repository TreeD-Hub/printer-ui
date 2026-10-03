import type { ReactNode } from 'react'
import { IconMask } from './IconMask'
import type { UiIconName } from './iconAssets'
import './numericTuneWidgets.css'

type TuneValueEditorProps = {
  label: string
  icon: UiIconName
  currentText?: string
  labelControl?: ReactNode
  children: ReactNode
}

export function TuneValueEditor({ label, icon, currentText, labelControl, children }: TuneValueEditorProps) {
  return (
    <section className="tune-value-editor" aria-label={label}>
      {labelControl ?? <h3><IconMask name={icon} size={24} />{label}</h3>}
      {currentText ? <p className="tune-value-current"><span>Сейчас</span><strong>{currentText}</strong></p> : null}
      <span className="tune-value-target-label">Установить</span>
      {children}
    </section>
  )
}

type NumericKeypadProps = {
  label: string
  ariaLabel: string
  closeLabel: string
  value: string
  unit?: string
  className?: string
  showValue?: boolean
  showHeader?: boolean
  onDigit: (digit: string) => void
  onClear?: () => void
  clearLabel?: string
  onBackspace: () => void
  onDecimal?: () => void
  onSubmit: () => void
  onClose: () => void
  testIdPrefix?: string
}

export function NumericKeypad({
  label, ariaLabel, closeLabel, value, unit, className = '', showValue = true, showHeader = true,
  onDigit, onClear, clearLabel = 'Очистить значение', onBackspace, onDecimal,
  onSubmit, onClose, testIdPrefix,
}: NumericKeypadProps) {
  return (
    <aside className={`print-temp-keyboard-side numeric-keypad ${className}`} aria-label={ariaLabel}>
      {showHeader ? <div className="print-temp-keyboard-head">
        <p className="print-temp-keyboard-label">{label}</p>
        <button type="button" className="print-cancel-modal-close print-temp-keyboard-close"
          aria-label={closeLabel} onClick={onClose}>×</button>
      </div> : null}
      {showValue ? <p className="print-temp-keyboard-display">{value}{value && unit ? <span> {unit}</span> : null}</p> : null}
      <div className="print-temp-keyboard-grid">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button key={digit} type="button" className="settings-network-btn print-temp-keyboard-key"
            onClick={() => onDigit(digit)} aria-label={`Цифра ${digit}`}
            data-testid={testIdPrefix ? `${testIdPrefix}-digit-${digit}` : undefined}>{digit}</button>
        ))}
        <button type="button" className="settings-network-btn print-temp-keyboard-key"
          onClick={onClear ?? onBackspace} aria-label={onClear ? clearLabel : 'Удалить последний символ'}
          data-testid={testIdPrefix && !onClear ? `${testIdPrefix}-backspace` : undefined}>{onClear ? 'C' : '⌫'}</button>
        <button type="button" className="settings-network-btn print-temp-keyboard-key"
          onClick={() => onDigit('0')} aria-label="Цифра 0"
          data-testid={testIdPrefix ? `${testIdPrefix}-digit-0` : undefined}>0</button>
        {onClear || onDecimal ? (
          <button type="button" className="settings-network-btn print-temp-keyboard-key"
            onClick={onDecimal ?? onBackspace} aria-label={onDecimal ? 'Десятичная точка' : 'Удалить последний символ'}
            data-testid={testIdPrefix ? `${testIdPrefix}-${onDecimal ? 'decimal' : 'backspace'}` : undefined}>
            {onDecimal ? '.' : '⌫'}
          </button>
        ) : <span className="print-temp-keyboard-spacer" aria-hidden="true" />}
      </div>
      <button type="button" className="settings-network-btn settings-network-btn-primary print-temp-keyboard-submit"
        onClick={onSubmit} data-testid={testIdPrefix ? `${testIdPrefix}-submit` : undefined}>Ввод</button>
    </aside>
  )
}
