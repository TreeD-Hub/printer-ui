import type { ReactNode } from 'react'

import type { TemperatureKeyboardTarget } from '../control'
import { rounded } from '../dashboard/helpers'
import {
  IconMask,
  TuneCompactStepperInput,
} from '../ui'
import type { UiIconName } from '../ui/iconAssets'
import {
  formatTuneKeyboardValue,
  PRINT_TUNE_GROUP_META,
  resolvePrintTuneKeyboardMeta,
  type PrintTuneGroupId,
  type PrintTuneNumericKeyboardTarget,
} from './printTuneKeyboard'

const PRINT_TUNE_MODAL_TITLE_ID = 'print-tune-modal-title'

type PrintTuneTemperatureProps = {
  currentNozzleTemp: number
  currentBedTemp: number
  nozzleTargetTemp: number
  bedTargetTemp: number
  nozzleMaxC: number
  bedMaxC: number
  keyboardTarget: TemperatureKeyboardTarget | null
  keyboardValue: string
  renderKeyboardPanel: (className?: string) => ReactNode
  onKeyboardOpen: (target: TemperatureKeyboardTarget) => void
  onNozzleTargetChange: (value: number) => void
  onBedTargetChange: (value: number) => void
}

type PrintTuneValuesProps = {
  fanPercent: number
  flowPercent: number
  speedFactorPercent: number
  accelMmS2: number
  kFactor: number
  retractMm: number
}

type PrintTuneValueHandlers = {
  onFanPercentChange: (value: number) => void
  onFlowPercentChange: (value: number) => void
  onSpeedFactorChange: (value: number) => void
  onAccelChange: (value: number) => void
  onKFactorChange: (value: number) => void
  onRetractChange: (value: number) => void
}

type PrintTuneKeyboardProps = {
  target: PrintTuneNumericKeyboardTarget | null
  value: string
  onOpen: (target: PrintTuneNumericKeyboardTarget) => void
  onClose: () => void
  onDigit: (digit: string) => void
  onDecimal: () => void
  onBackspace: () => void
  onSubmit: () => void
}

type NumericTuneRow = {
  keyboardTarget: PrintTuneNumericKeyboardTarget
  uiLabel: string
  icon: UiIconName
  tone: 'orange' | 'green'
  currentText: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  fractionDigits?: number
  onChange: (value: number) => void
  testIdPrefix: string
}

export type PrintTuneModalProps = {
  activeGroup: PrintTuneGroupId | null
  temperature: PrintTuneTemperatureProps
  values: PrintTuneValuesProps
  handlers: PrintTuneValueHandlers
  keyboard: PrintTuneKeyboardProps
  onClose: () => void
  onApply: () => void
}

export function PrintTuneModal({
  activeGroup,
  temperature,
  values,
  handlers,
  keyboard,
  onClose,
  onApply,
}: PrintTuneModalProps) {
  if (activeGroup === null) {
    return null
  }

  const activeMeta = PRINT_TUNE_GROUP_META[activeGroup]
  const isTemperatureGroup = activeGroup === 'nozzle' || activeGroup === 'bed'
  const isKeyboardOpen = isTemperatureGroup ? temperature.keyboardTarget !== null : keyboard.target !== null

  function renderTemperatureTuneContent(): ReactNode {
    const activeTemperatureRow =
      activeGroup === 'bed'
        ? {
            keyboardTarget: 'bed' as const,
            uiLabel: 'Стол',
            icon: 'metricBed' as const,
            tone: 'green' as const,
            current: temperature.currentBedTemp,
            target: temperature.bedTargetTemp,
            maxTarget: temperature.bedMaxC,
            onTargetChange: temperature.onBedTargetChange,
            testIdPrefix: 'print-tune-temp-bed',
          }
        : {
            keyboardTarget: 'nozzle' as const,
            uiLabel: 'Сопло',
            icon: 'metricNozzle' as const,
            tone: 'orange' as const,
            current: temperature.currentNozzleTemp,
            target: temperature.nozzleTargetTemp,
            maxTarget: temperature.nozzleMaxC,
            onTargetChange: temperature.onNozzleTargetChange,
            testIdPrefix: 'print-tune-temp-nozzle',
          }

    const displayTargetValue =
      temperature.keyboardTarget === activeTemperatureRow.keyboardTarget
        ? temperature.keyboardValue
        : String(Math.round(activeTemperatureRow.target))

    return (
      <div
        className={`print-tune-modal-stack print-tune-modal-stack-temperature ${temperature.keyboardTarget !== null ? 'is-keyboard-open' : ''}`}
      >
        <div className="print-temp-workspace">
          <section className="print-temp-main-panel">
            <div className="control-heating-row control-subpanel print-temp-control-row is-active">
              <div className="control-heating-sensor">
                <span className={`control-heating-sensor-icon is-${activeTemperatureRow.tone}`} aria-hidden="true">
                  <IconMask name={activeTemperatureRow.icon} size={18} />
                </span>
                <div className="control-heating-sensor-text">
                  <h3>{activeTemperatureRow.uiLabel}</h3>
                </div>
              </div>
              <div className="control-heating-current">
                {rounded(activeTemperatureRow.current)} <span>°C</span>
              </div>
              <TuneCompactStepperInput
                value={activeTemperatureRow.target}
                min={0}
                max={activeTemperatureRow.maxTarget}
                step={5}
                unit="°C"
                onChange={activeTemperatureRow.onTargetChange}
                readOnly={true}
                displayValue={displayTargetValue}
                onInputFocus={() => temperature.onKeyboardOpen(activeTemperatureRow.keyboardTarget)}
                inputAriaLabel={`Целевая температура ${activeTemperatureRow.uiLabel.toLowerCase()}`}
                testIdPrefix={activeTemperatureRow.testIdPrefix}
              />
            </div>
          </section>

          {temperature.keyboardTarget !== null ? (
            temperature.renderKeyboardPanel('is-print-tune')
          ) : null}
        </div>
      </div>
    )
  }

  function renderNumericKeyboardPanel(): ReactNode {
    const activeKeyboardMeta = keyboard.target === null
      ? null
      : resolvePrintTuneKeyboardMeta(keyboard.target)

    if (keyboard.target === null || activeKeyboardMeta === null) {
      return null
    }

    return (
      <aside className="print-temp-keyboard-side is-print-tune" aria-label="Цифровая клавиатура параметра печати">
        <div className="print-temp-keyboard-head">
          <p className="print-temp-keyboard-label">{activeKeyboardMeta.label}</p>
          <button
            type="button"
            className="print-cancel-modal-close print-temp-keyboard-close"
            aria-label="Закрыть клавиатуру параметра печати"
            onClick={keyboard.onClose}
          >
            ×
          </button>
        </div>
        <p className="print-temp-keyboard-display">
          {keyboard.value}
          {keyboard.value.length > 0 && activeKeyboardMeta.unit.length > 0 ? <span> {activeKeyboardMeta.unit}</span> : null}
        </p>
        <div className="print-temp-keyboard-grid">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              className="settings-network-btn print-temp-keyboard-key"
              onClick={() => keyboard.onDigit(digit)}
              aria-label={`Цифра ${digit}`}
              data-testid={`print-tune-keyboard-digit-${digit}`}
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            className="settings-network-btn print-temp-keyboard-key"
            onClick={keyboard.onBackspace}
            data-testid="print-tune-keyboard-backspace"
          >
            Стереть
          </button>
          <button
            type="button"
            className="settings-network-btn print-temp-keyboard-key"
            onClick={() => keyboard.onDigit('0')}
            aria-label="Цифра 0"
            data-testid="print-tune-keyboard-digit-0"
          >
            0
          </button>
          {activeKeyboardMeta.allowDecimal ? (
            <button
              type="button"
              className="settings-network-btn print-temp-keyboard-key"
              onClick={keyboard.onDecimal}
              data-testid="print-tune-keyboard-decimal"
            >
              .
            </button>
          ) : (
            <span className="print-temp-keyboard-spacer" aria-hidden="true" />
          )}
        </div>
        <button
          type="button"
          className="settings-network-btn settings-network-btn-primary print-temp-keyboard-submit"
          onClick={keyboard.onSubmit}
          data-testid="print-tune-keyboard-submit"
        >
          Ввод
        </button>
      </aside>
    )
  }

  function renderNumericTuneContent(row: NumericTuneRow): ReactNode {
    const displayTargetValue =
      keyboard.target === row.keyboardTarget
        ? keyboard.value
        : formatTuneKeyboardValue(row.value, row.fractionDigits ?? 0)

    return (
      <div
        className={`print-tune-modal-stack print-tune-modal-stack-temperature ${keyboard.target !== null ? 'is-keyboard-open' : ''}`}
      >
        <div className="print-temp-workspace">
          <section className="print-temp-main-panel">
            <div className="control-heating-row control-subpanel print-temp-control-row is-active">
              <div className="control-heating-sensor">
                <span className={`control-heating-sensor-icon is-${row.tone}`} aria-hidden="true">
                  <IconMask name={row.icon} size={18} />
                </span>
                <div className="control-heating-sensor-text">
                  <h3>{row.uiLabel}</h3>
                </div>
              </div>
              <div className="control-heating-current">
                {row.currentText}
              </div>
              <TuneCompactStepperInput
                value={row.value}
                min={row.min}
                max={row.max}
                step={row.step}
                unit={row.unit}
                fractionDigits={row.fractionDigits}
                onChange={row.onChange}
                readOnly={true}
                displayValue={displayTargetValue}
                onInputFocus={() => keyboard.onOpen(row.keyboardTarget)}
                inputAriaLabel={`Целевое значение: ${row.uiLabel.toLowerCase()}`}
                testIdPrefix={row.testIdPrefix}
              />
            </div>
          </section>

          {renderNumericKeyboardPanel()}
        </div>
      </div>
    )
  }

  function renderCompactTuneGroupContent(): ReactNode {
    if (activeGroup === 'fan') {
      return renderNumericTuneContent({
        keyboardTarget: 'fan',
        uiLabel: 'Обдув',
        icon: 'metricFan',
        tone: 'green',
        currentText: `${values.fanPercent}%`,
        value: values.fanPercent,
        min: 0,
        max: 100,
        step: 5,
        unit: '%',
        onChange: handlers.onFanPercentChange,
        testIdPrefix: 'print-tune-fan',
      })
    }

    if (activeGroup === 'flow') {
      return renderNumericTuneContent({
        keyboardTarget: 'flow',
        uiLabel: 'Поток',
        icon: 'metricFlow',
        tone: 'green',
        currentText: `${values.flowPercent}%`,
        value: values.flowPercent,
        min: 50,
        max: 150,
        step: 1,
        unit: '%',
        onChange: handlers.onFlowPercentChange,
        testIdPrefix: 'print-tune-flow',
      })
    }

    if (activeGroup === 'speed') {
      return renderNumericTuneContent({
        keyboardTarget: 'speed',
        uiLabel: 'Скорость',
        icon: 'metricSpeed',
        tone: 'orange',
        currentText: `${formatTuneKeyboardValue(values.speedFactorPercent, 0)}%`,
        value: values.speedFactorPercent,
        min: 10,
        max: 300,
        step: 5,
        unit: '%',
        onChange: handlers.onSpeedFactorChange,
        testIdPrefix: 'print-tune-speed',
      })
    }

    if (activeGroup === 'accel') {
      return renderNumericTuneContent({
        keyboardTarget: 'accel',
        uiLabel: 'Ускорение',
        icon: 'metricSpeed',
        tone: 'orange',
        currentText: `${formatTuneKeyboardValue(values.accelMmS2, 0)} мм/с²`,
        value: values.accelMmS2,
        min: 500,
        max: 12000,
        step: 100,
        unit: 'мм/с²',
        onChange: handlers.onAccelChange,
        testIdPrefix: 'print-tune-accel',
      })
    }

    if (activeGroup === 'kFactor') {
      return renderNumericTuneContent({
        keyboardTarget: 'kFactor',
        uiLabel: 'K-factor',
        icon: 'metricFlow',
        tone: 'green',
        currentText: formatTuneKeyboardValue(values.kFactor, 3),
        value: values.kFactor,
        min: 0,
        max: 0.2,
        step: 0.005,
        fractionDigits: 3,
        onChange: handlers.onKFactorChange,
        testIdPrefix: 'print-tune-kfactor',
      })
    }

    if (activeGroup === 'retract') {
      return renderNumericTuneContent({
        keyboardTarget: 'retract',
        uiLabel: 'Откат',
        icon: 'metricFlow',
        tone: 'orange',
        currentText: `${formatTuneKeyboardValue(values.retractMm, 1)} мм`,
        value: values.retractMm,
        min: 0,
        max: 5,
        step: 0.1,
        unit: 'мм',
        fractionDigits: 1,
        onChange: handlers.onRetractChange,
        testIdPrefix: 'print-tune-retract',
      })
    }

    return null
  }

  const content = isTemperatureGroup ? renderTemperatureTuneContent() : renderCompactTuneGroupContent()

  return (
    <div
      className="print-tune-modal-layer"
      role="presentation"
      onClick={onClose}
      data-testid="print-tune-modal-layer"
    >
      <section
        className={`print-tune-modal-dialog is-temperature ${isKeyboardOpen ? 'is-temperature-keyboard-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={PRINT_TUNE_MODAL_TITLE_ID}
        data-testid="print-tune-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="print-cancel-modal-head">
          <h2 id={PRINT_TUNE_MODAL_TITLE_ID}>{activeMeta.label}</h2>
          <div className="print-tune-modal-head-actions">
            <button
              type="button"
              className="settings-network-btn settings-network-btn-primary print-tune-modal-head-save"
              onClick={onApply}
              data-testid="print-tune-modal-apply-button"
            >
              Сохранить
            </button>
            <button
              type="button"
              className="print-cancel-modal-close"
              aria-label={`Закрыть окно параметра: ${activeMeta.label}`}
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>

        {content}
      </section>
    </div>
  )
}
