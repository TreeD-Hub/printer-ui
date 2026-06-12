import { memo, useEffect, useRef, useState } from 'react'
import { IconMask, TemperatureTrendChart, TuneCompactStepperInput } from '../../ui'
import { CONTROL_HEATING_PRESET_OPTIONS } from '../config'
import type { HeatingControlPanelProps } from '../types'

export const HeatingControlPanel = memo(function HeatingControlPanel({
  rows,
  chartSeries,
  temperatureKeyboardTarget,
  temperatureKeyboardValue,
  printNozzleTargetTemp,
  printBedTargetTemp,
  commandBlockReasons,
  renderTemperatureKeyboardPanel,
  onTemperatureKeyboardOpen,
  onHeatingPresetApply,
  onHeatingDisable,
}: HeatingControlPanelProps) {
  const lockPopupIdRef = useRef(0)
  const [lockPopup, setLockPopup] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    if (lockPopup === null) {
      return
    }

    const timeoutId = window.setTimeout(() => setLockPopup(null), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [lockPopup])

  function showLockPopup(message: string | null): void {
    if (message === null) {
      return
    }

    lockPopupIdRef.current += 1
    setLockPopup({
      id: lockPopupIdRef.current,
      message,
    })
  }

  function getTemperatureTargetBlockReason(target: HeatingControlPanelProps['temperatureKeyboardTarget']): string | null {
    return target === 'nozzle'
      ? commandBlockReasons.nozzleTarget
      : commandBlockReasons.bedTarget
  }

  function getPresetBlockReason(): string | null {
    return commandBlockReasons.nozzleTarget ?? commandBlockReasons.bedTarget
  }

  function handlePresetApply(nozzle: number, bed: number): void {
    const blockReason = getPresetBlockReason()
    if (blockReason !== null) {
      showLockPopup(blockReason)
      return
    }

    onHeatingPresetApply(nozzle, bed)
  }

  function handleHeatingDisable(): void {
    if (commandBlockReasons.turnOffHeaters !== null) {
      showLockPopup(commandBlockReasons.turnOffHeaters)
      return
    }

    onHeatingDisable()
  }

  return (
    <div className="control-heating-grid">
      <div className="control-heating-main">
        {lockPopup !== null ? (
          <div
            key={lockPopup.id}
            className="control-lock-popup"
            role="alertdialog"
            aria-live="assertive"
            aria-label="Причина блокировки"
            data-testid="heating-lock-popup"
          >
            <p>{lockPopup.message}</p>
            <button
              type="button"
              className="control-lock-popup-close"
              aria-label="Закрыть уведомление"
              onClick={() => setLockPopup(null)}
            >
              ×
            </button>
          </div>
        ) : null}
        <section className="control-heating-rows" aria-label="Температуры сопла и стола">
          {rows.map((row) => {
            const targetBlockReason = getTemperatureTargetBlockReason(row.keyboardTarget)

            return (
              <div key={row.id} className="control-heating-row control-subpanel">
                <div className="control-heating-sensor">
                  <span className={`control-heating-sensor-icon is-${row.tone}`} aria-hidden="true">
                    <IconMask name={row.icon} size={18} />
                  </span>
                  <div className="control-heating-sensor-text">
                    <h3>{row.uiLabel}</h3>
                  </div>
                </div>
                <div className="control-heating-current">
                  {Math.round(row.current)} <span>°C</span>
                </div>
                <TuneCompactStepperInput
                  value={row.target}
                  min={0}
                  max={300}
                  step={5}
                  unit="°C"
                  readOnly={true}
                  displayValue={
                    temperatureKeyboardTarget === row.keyboardTarget
                      ? temperatureKeyboardValue
                      : String(Math.round(row.target))
                  }
                  onChange={(nextValue) => row.onTargetChange(Math.round(clampControlValue(nextValue, 0, 300)))}
                  onInputFocus={() => onTemperatureKeyboardOpen(row.keyboardTarget)}
                  disabled={targetBlockReason !== null}
                  onBlocked={() => showLockPopup(targetBlockReason)}
                  inputAriaLabel={`Целевая температура ${row.uiLabel.toLowerCase()}`}
                  testIdPrefix={row.testIdPrefix}
                />
              </div>
            )
          })}
        </section>

        <div className="control-heating-chart-block">
          <div className="print-temp-chart-head control-heating-chart-head">
            <p className="print-temp-chart-title">График нагрева</p>
          </div>
          <TemperatureTrendChart
            series={chartSeries}
            testId="control-heating-chart"
          />
        </div>
      </div>

      {temperatureKeyboardTarget !== null ? (
        <article className="control-card control-card-heating-keyboard control-subpanel">
          {renderTemperatureKeyboardPanel('is-control')}
        </article>
      ) : (
        <article className="control-card control-card-heating-presets control-subpanel">
          <div className="control-card-head">
            <h3 className="control-card-title">Предустановки</h3>
          </div>
          <div className="control-heating-presets-list" role="group" aria-label="Предустановки нагрева">
            {CONTROL_HEATING_PRESET_OPTIONS.map((preset) => {
              const isActive =
                printNozzleTargetTemp === preset.nozzle &&
                printBedTargetTemp === preset.bed

              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`control-heating-preset-btn${isActive ? ' is-active' : ''}`}
                  aria-pressed={isActive}
                  aria-disabled={getPresetBlockReason() !== null || undefined}
                  data-testid={`control-heating-preset-${preset.id}`}
                  onClick={() => handlePresetApply(preset.nozzle, preset.bed)}
                >
                  <span className="control-heating-preset-label">{preset.label}</span>
                  <span className="control-heating-preset-values">
                    {preset.nozzle}° / {preset.bed}°
                  </span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className={`control-heating-cooldown-btn${printNozzleTargetTemp === 0 && printBedTargetTemp === 0 ? ' is-active' : ''}`}
            aria-pressed={printNozzleTargetTemp === 0 && printBedTargetTemp === 0}
            aria-disabled={commandBlockReasons.turnOffHeaters !== null || undefined}
            data-testid="control-heating-disable"
            onClick={handleHeatingDisable}
          >
            <span className="control-heating-cooldown-icon" aria-hidden="true">
              <IconMask name="utilitySnowflake" size={18} />
            </span>
            <span>Отключить нагрев</span>
          </button>
        </article>
      )}
    </div>
  )
})

function clampControlValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
