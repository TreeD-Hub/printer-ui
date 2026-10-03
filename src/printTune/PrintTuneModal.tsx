import type { ReactNode } from 'react'

import type { TemperatureKeyboardTarget } from '../control'
import { rounded } from '../dashboard/helpers'
import {
  IconMask,
  NumericKeypad,
  TuneValueEditor,
  TuneCompactStepperInput,
  useModalFocus,
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
  onKeyboardClose: () => void
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
  onTemperatureTargetChange: (target: TemperatureKeyboardTarget) => void
}

export function PrintTuneModal({
  activeGroup,
  temperature,
  values,
  handlers,
  keyboard,
  onClose,
  onApply,
  onTemperatureTargetChange,
}: PrintTuneModalProps) {
  const dialogRef = useModalFocus<HTMLElement>(activeGroup !== null, onClose)
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
            target: temperature.bedTargetTemp,
            maxTarget: temperature.bedMaxC,
            onTargetChange: temperature.onBedTargetChange,
            testIdPrefix: 'print-tune-temp-bed',
          }
        : {
            keyboardTarget: 'nozzle' as const,
            uiLabel: 'Сопло',
            icon: 'metricNozzle' as const,
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
      <div className={`tune-value-workspace ${isKeyboardOpen ? 'is-keyboard-open' : ''}`}>
          <TuneValueEditor label={activeTemperatureRow.uiLabel} icon={activeTemperatureRow.icon}
            labelControl={
              <div className="tune-temperature-targets" role="group" aria-label="Выбор нагревателя">
                {(['nozzle', 'bed'] as const).map((target) => (
                  <button key={target} type="button"
                    className={`tune-heater-choice ${activeGroup === target ? 'is-active' : ''}`}
                    aria-label={target === 'nozzle' ? 'Сопло' : 'Стол'}
                    aria-pressed={activeGroup === target}
                    onClick={() => {
                      if (activeGroup === target) return
                      onTemperatureTargetChange(target)
                      if (temperature.keyboardTarget !== null) temperature.onKeyboardOpen(target)
                    }}>
                    <span className="tune-heater-name">{target === 'nozzle' ? 'Сопло' : 'Стол'}</span>
                    <IconMask name={target === 'nozzle' ? 'metricNozzle' : 'metricBed'} size={28} />
                    <span className="tune-heater-reading">
                      {rounded(target === 'nozzle' ? temperature.currentNozzleTemp : temperature.currentBedTemp)}
                      <span>°C</span>
                    </span>
                    <span className="tune-heater-state">{activeGroup === target ? 'Выбрано' : 'Настроить'}</span>
                  </button>
                ))}
              </div>
            }>
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
          </TuneValueEditor>

          {temperature.keyboardTarget !== null ? (
            temperature.renderKeyboardPanel('is-tune-workspace')
          ) : null}
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
      <NumericKeypad label={activeKeyboardMeta.label} value={keyboard.value} showValue={false} showHeader={false}
        ariaLabel="Цифровая клавиатура параметра печати" closeLabel="Закрыть клавиатуру параметра печати"
        onClose={keyboard.onClose} onDigit={keyboard.onDigit} onBackspace={keyboard.onBackspace}
        onDecimal={activeKeyboardMeta.allowDecimal ? keyboard.onDecimal : undefined}
        onSubmit={keyboard.onSubmit} testIdPrefix="print-tune-keyboard" />
    )
  }

  function renderNumericTuneContent(row: NumericTuneRow): ReactNode {
    const displayTargetValue =
      keyboard.target === row.keyboardTarget
        ? keyboard.value
        : formatTuneKeyboardValue(row.value, row.fractionDigits ?? 0)

    return (
      <div className={`tune-value-workspace ${isKeyboardOpen ? 'is-keyboard-open' : ''}`}>
          <TuneValueEditor label={row.uiLabel} icon={row.icon} currentText={row.currentText}>
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
          </TuneValueEditor>

          {renderNumericKeyboardPanel()}
      </div>
    )
  }

  function renderCompactTuneGroupContent(): ReactNode {
    if (activeGroup === 'fan') {
      return renderNumericTuneContent({
        keyboardTarget: 'fan',
        uiLabel: 'Обдув',
        icon: 'metricFan',
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
        ref={dialogRef}
        className={`print-tune-modal-dialog is-numeric-tune ${isKeyboardOpen ? 'is-keyboard-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={PRINT_TUNE_MODAL_TITLE_ID}
        data-testid="print-tune-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="print-cancel-modal-head">
          <h2 id={PRINT_TUNE_MODAL_TITLE_ID}>{activeMeta.label}</h2>
          <div className="print-tune-modal-head-actions">
            {isKeyboardOpen ? <button type="button"
              className="settings-network-btn print-tune-modal-head-save"
              onClick={isTemperatureGroup ? temperature.onKeyboardClose : keyboard.onClose}>
              Назад
            </button> : null}
            {!isKeyboardOpen ? <button
              type="button"
              className="settings-network-btn settings-network-btn-primary print-tune-modal-head-save"
              onClick={onApply}
              data-testid="print-tune-modal-apply-button"
            >
              Готово
            </button> : null}
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
