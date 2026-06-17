import type { ReactNode } from 'react'

import type { TemperatureKeyboardTarget } from '../control'
import { rounded } from '../dashboard/helpers'
import {
  HorizontalSteppedSlider,
  TemperatureTrendChart,
  TuneCompactStepperInput,
  TuneModeToggle,
} from '../ui'
import {
  formatTuneKeyboardValue,
  PRINT_TUNE_GROUP_META,
  resolvePrintTuneKeyboardMeta,
  type PrintTuneGroupId,
  type PrintTuneNumericKeyboardTarget,
  type TemperatureChartMode,
} from './printTuneKeyboard'

const PRINT_TUNE_MODAL_TITLE_ID = 'print-tune-modal-title'

type TemperatureChartSeries = {
  id: 'nozzle' | 'bed'
  label: string
  tone: 'orange' | 'green'
  values: number[]
  target: number
}

type PrintTuneTemperatureProps = {
  currentNozzleTemp: number
  currentBedTemp: number
  nozzleTargetTemp: number
  bedTargetTemp: number
  chartMode: TemperatureChartMode
  chartSeries: TemperatureChartSeries[]
  keyboardTarget: TemperatureKeyboardTarget | null
  keyboardValue: string
  renderKeyboardPanel: () => ReactNode
  onKeyboardOpen: (target: TemperatureKeyboardTarget) => void
  onChartModeChange: (mode: TemperatureChartMode) => void
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
  const isCompactKeyboardOpen = !isTemperatureGroup && keyboard.target !== null

  function renderTemperatureTuneContent(): ReactNode {
    const temperatureRows = [
      {
        id: 'nozzle' as const,
        keyboardTarget: 'nozzle' as const,
        sensorLabel: 'Extruder',
        uiLabel: 'Сопло',
        tone: 'orange' as const,
        current: temperature.currentNozzleTemp,
        target: temperature.nozzleTargetTemp,
        onTargetChange: temperature.onNozzleTargetChange,
        testIdPrefix: 'print-tune-temp-nozzle',
      },
      {
        id: 'bed' as const,
        keyboardTarget: 'bed' as const,
        sensorLabel: 'Heater Bed',
        uiLabel: 'Стол',
        tone: 'green' as const,
        current: temperature.currentBedTemp,
        target: temperature.bedTargetTemp,
        onTargetChange: temperature.onBedTargetChange,
        testIdPrefix: 'print-tune-temp-bed',
      },
    ]
    const chartSeries = temperature.chartSeries.filter((seriesItem) => {
      if (temperature.chartMode === 'both') {
        return true
      }
      return seriesItem.id === temperature.chartMode
    })

    return (
      <div
        className={`print-tune-modal-stack print-tune-modal-stack-temperature ${temperature.keyboardTarget !== null ? 'is-keyboard-open' : ''}`}
      >
        <div className="print-temp-workspace">
          <section className="print-temp-main-panel">
            <section className="print-temp-table" aria-label="Параметры температуры">
              <header className="print-temp-table-head">
                <span>Датчик</span>
                <span>Текущая</span>
                <span>Заданная</span>
              </header>

              {temperatureRows.map((row) => {
                const isActiveRow =
                  temperature.chartMode === 'both'
                    ? row.id === activeGroup
                    : row.id === temperature.chartMode
                const displayTargetValue =
                  temperature.keyboardTarget === row.keyboardTarget
                    ? temperature.keyboardValue
                    : String(Math.round(row.target))

                return (
                  <div
                    key={row.id}
                    className={`print-temp-table-row ${isActiveRow ? 'is-active' : ''}`}
                  >
                    <div className="print-temp-table-sensor">
                      <span className={`print-temp-table-marker ${row.tone === 'orange' ? 'is-orange' : 'is-green'}`} />
                      <div className="print-temp-table-sensor-text">
                        <strong>{row.sensorLabel}</strong>
                        <span>{row.uiLabel}</span>
                      </div>
                    </div>
                    <div className="print-temp-table-value">
                      {rounded(row.current)} <span>°C</span>
                    </div>
                    <TuneCompactStepperInput
                      value={row.target}
                      min={0}
                      max={300}
                      step={5}
                      unit="°C"
                      onChange={row.onTargetChange}
                      readOnly={true}
                      displayValue={displayTargetValue}
                      onInputFocus={() => temperature.onKeyboardOpen(row.keyboardTarget)}
                      inputAriaLabel={`Целевая температура ${row.uiLabel.toLowerCase()}`}
                      testIdPrefix={row.testIdPrefix}
                    />
                  </div>
                )
              })}
            </section>

            <div className="print-temp-chart-head">
              <p className="print-temp-chart-title">Температуры [°C]</p>
              <TuneModeToggle
                options={[
                  { id: 'nozzle', label: 'Сопло' },
                  { id: 'bed', label: 'Стол' },
                  { id: 'both', label: 'Общий' },
                ]}
                value={temperature.chartMode}
                onChange={(nextValue) => temperature.onChartModeChange(nextValue as TemperatureChartMode)}
                testIdPrefix="print-tune-temp-chart"
                layout="compact"
              />
            </div>

            <TemperatureTrendChart
              series={chartSeries}
              testId={activeGroup === 'nozzle' ? 'print-tune-chart-nozzle' : 'print-tune-chart-bed'}
            />
          </section>

          {temperature.keyboardTarget !== null ? temperature.renderKeyboardPanel() : null}
        </div>
      </div>
    )
  }

  function renderCompactTuneContent(content: ReactNode): ReactNode {
    const activeKeyboardMeta = keyboard.target === null
      ? null
      : resolvePrintTuneKeyboardMeta(keyboard.target)
    const activeTuneNote = activeMeta.note

    return (
      <div
        className={`print-tune-modal-stack print-tune-modal-stack-compact ${keyboard.target !== null ? 'is-keyboard-open' : ''}`}
      >
        <div className="print-tune-compact-workspace">
          <section className="print-tune-compact-main-panel">
            {activeTuneNote.length > 0 ? <p className="print-tune-note">{activeTuneNote}</p> : null}
            <div className="print-tune-compact-content">
              {content}
            </div>
          </section>

          {keyboard.target !== null && activeKeyboardMeta !== null ? (
            <aside className="print-temp-keyboard-side is-compact" aria-label="Цифровая клавиатура параметра печати">
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
          ) : null}
        </div>
      </div>
    )
  }

  function renderCompactCurrentRow(label: string, value: string): ReactNode {
    return (
      <p className="print-tune-current-row print-tune-current-row-compact">
        <span>{label}</span>
        <strong>{value}</strong>
      </p>
    )
  }

  function renderCompactTuneEditor({
    label,
    value,
    min,
    max,
    step,
    unit,
    fractionDigits = 0,
    onChange,
    testIdPrefix,
    displayValue,
    onInputFocus,
  }: {
    label: string
    value: number
    min: number
    max: number
    step: number
    unit?: string
    fractionDigits?: number
    onChange: (nextValue: number) => void
    testIdPrefix: string
    displayValue: string
    onInputFocus: () => void
  }): ReactNode {
    return (
      <section className="print-tune-compact-editor">
        <p className="label">{label}</p>
        <TuneCompactStepperInput
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          fractionDigits={fractionDigits}
          onChange={onChange}
          inputAriaLabel={label}
          testIdPrefix={testIdPrefix}
          displayValue={displayValue}
          readOnly={true}
          onInputFocus={onInputFocus}
        />
      </section>
    )
  }

  function renderCompactTuneGroupContent(): ReactNode {
    if (activeGroup === 'fan') {
      return (
        <div className="print-tune-modal-stack">
          <p className="print-tune-current-row print-tune-current-row-compact">
            <span>Текущее значение</span>
            <strong>{values.fanPercent}%</strong>
          </p>
          <HorizontalSteppedSlider
            value={values.fanPercent}
            min={0}
            max={100}
            step={5}
            onChange={handlers.onFanPercentChange}
            testId="print-tune-fan-slider"
          />
        </div>
      )
    }

    if (activeGroup === 'flow') {
      return renderCompactTuneContent(
        <>
          {renderCompactCurrentRow('Текущее значение', `${values.flowPercent}%`)}
          {renderCompactTuneEditor({
            label: 'Поток экструдера',
            value: values.flowPercent,
            min: 50,
            max: 150,
            step: 1,
            unit: '%',
            onChange: handlers.onFlowPercentChange,
            testIdPrefix: 'print-tune-flow',
            displayValue:
              keyboard.target === 'flow'
                ? keyboard.value
                : formatTuneKeyboardValue(values.flowPercent, 0),
            onInputFocus: () => keyboard.onOpen('flow'),
          })}
        </>,
      )
    }

    if (activeGroup === 'speed') {
      return renderCompactTuneContent(
        <>
          {renderCompactCurrentRow('Текущее значение', `${formatTuneKeyboardValue(values.speedFactorPercent, 0)}%`)}
          {renderCompactTuneEditor({
            label: 'Скорость печати',
            value: values.speedFactorPercent,
            min: 10,
            max: 300,
            step: 5,
            unit: '%',
            onChange: handlers.onSpeedFactorChange,
            testIdPrefix: 'print-tune-speed',
            displayValue:
              keyboard.target === 'speed'
                ? keyboard.value
                : formatTuneKeyboardValue(values.speedFactorPercent, 0),
            onInputFocus: () => keyboard.onOpen('speed'),
          })}
        </>,
      )
    }

    if (activeGroup === 'accel') {
      return renderCompactTuneContent(
        <>
          {renderCompactCurrentRow('Текущее значение', `${formatTuneKeyboardValue(values.accelMmS2, 0)} мм/с²`)}
          {renderCompactTuneEditor({
            label: 'Ускорение',
            value: values.accelMmS2,
            min: 500,
            max: 12000,
            step: 100,
            unit: 'мм/с²',
            onChange: handlers.onAccelChange,
            testIdPrefix: 'print-tune-accel',
            displayValue:
              keyboard.target === 'accel'
                ? keyboard.value
                : formatTuneKeyboardValue(values.accelMmS2, 0),
            onInputFocus: () => keyboard.onOpen('accel'),
          })}
        </>,
      )
    }

    if (activeGroup === 'kFactor') {
      return renderCompactTuneContent(
        <>
          {renderCompactCurrentRow('Текущее значение', formatTuneKeyboardValue(values.kFactor, 3))}
          {renderCompactTuneEditor({
            label: 'K-factor',
            value: values.kFactor,
            min: 0,
            max: 0.2,
            step: 0.005,
            fractionDigits: 3,
            onChange: handlers.onKFactorChange,
            testIdPrefix: 'print-tune-kfactor',
            displayValue:
              keyboard.target === 'kFactor'
                ? keyboard.value
                : formatTuneKeyboardValue(values.kFactor, 3),
            onInputFocus: () => keyboard.onOpen('kFactor'),
          })}
        </>,
      )
    }

    if (activeGroup === 'retract') {
      return renderCompactTuneContent(
        <>
          {renderCompactCurrentRow('Текущее значение', `${formatTuneKeyboardValue(values.retractMm, 1)} мм`)}
          {renderCompactTuneEditor({
            label: 'Откат',
            value: values.retractMm,
            min: 0,
            max: 5,
            step: 0.1,
            fractionDigits: 1,
            unit: 'мм',
            onChange: handlers.onRetractChange,
            testIdPrefix: 'print-tune-retract',
            displayValue:
              keyboard.target === 'retract'
                ? keyboard.value
                : formatTuneKeyboardValue(values.retractMm, 1),
            onInputFocus: () => keyboard.onOpen('retract'),
          })}
        </>,
      )
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
        className={`print-tune-modal-dialog ${isTemperatureGroup ? 'is-temperature' : 'is-compact'} ${isTemperatureGroup && temperature.keyboardTarget !== null ? 'is-temperature-keyboard-open' : ''} ${isCompactKeyboardOpen ? 'is-compact-keyboard-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={PRINT_TUNE_MODAL_TITLE_ID}
        data-testid="print-tune-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="print-cancel-modal-head">
          <h2 id={PRINT_TUNE_MODAL_TITLE_ID}>{activeMeta.label}</h2>
          <div className="print-tune-modal-head-actions">
            {isTemperatureGroup ? (
              <button
                type="button"
                className="settings-network-btn settings-network-btn-primary print-tune-modal-head-save"
                onClick={onApply}
                data-testid="print-tune-modal-apply-button"
              >
                Сохранить
              </button>
            ) : null}
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

        {isTemperatureGroup ? null : (
          <div className="print-tune-modal-actions">
            <button
              type="button"
              className="settings-network-btn"
              onClick={onClose}
              data-testid="print-tune-modal-close-button"
            >
              Закрыть
            </button>
            <button
              type="button"
              className="settings-network-btn settings-network-btn-primary"
              onClick={onApply}
              data-testid="print-tune-modal-apply-button"
            >
              Сохранить
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
