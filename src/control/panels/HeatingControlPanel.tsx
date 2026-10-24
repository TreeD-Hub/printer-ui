import { memo, useEffect, useRef, useState } from 'react'
import { HorizontalSteppedSlider, IconMask, TemperatureTrendChart, TuneCompactStepperInput } from '../../ui'
import { CONTROL_HEATING_PRESET_OPTIONS, CONTROL_MOVE_STEP_OPTIONS } from '../config'
import type { HeatingControlPanelProps, MovementControlPanelProps } from '../types'

type Props = HeatingControlPanelProps & {
  filament: Pick<MovementControlPanelProps,
    'moveStepKey' | 'onMoveStepChange' | 'isFilamentBusy' | 'onFilamentMove' | 'getLastCommandError'> & {
      commandBlockReasons: Pick<MovementControlPanelProps['commandBlockReasons'], 'loadFilament' | 'unloadFilament'>
    }
}

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
  filament,
}: Props) {
  const lockPopupIdRef = useRef(0)
  const [lockPopup, setLockPopup] = useState<{ id: number; message: string } | null>(null)
  const [temperatureDraft, setTemperatureDraft] = useState<{ id: 'nozzle' | 'bed'; value: number } | null>(null)
  const temperatureDragRef = useRef<'nozzle' | 'bed' | null>(null)
  const filamentPendingRef = useRef(false)

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

  async function handleFilamentMove(direction: -1 | 1): Promise<void> {
    const blockReason = filament.isFilamentBusy || filamentPendingRef.current
      ? 'Команда филамента уже выполняется.'
      : direction > 0 ? filament.commandBlockReasons.unloadFilament : filament.commandBlockReasons.loadFilament
    if (blockReason !== null) {
      showLockPopup(blockReason)
      return
    }
    const step = CONTROL_MOVE_STEP_OPTIONS.find((option) => option.id === filament.moveStepKey)!
    filamentPendingRef.current = true
    try {
      const ok = await filament.onFilamentMove(direction, step.valueMm)
      if (!ok) showLockPopup(filament.getLastCommandError() || 'Не удалось переместить филамент.')
    } finally {
      filamentPendingRef.current = false
    }
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
            const displayedTarget = temperatureDraft?.id === row.id ? temperatureDraft.value : row.target

            return (
              <section key={row.id} className="control-heating-row control-subpanel" aria-label={`Нагреватель: ${row.uiLabel.toLowerCase()}`}>
                <div className="control-heating-summary">
                  <div className="control-heating-sensor">
                    <span className={`control-heating-sensor-icon is-${row.tone}`} aria-hidden="true">
                      <IconMask name={row.icon} size={28} />
                    </span>
                    <div className="control-heating-sensor-text">
                      <h3>{row.uiLabel}</h3>
                    </div>
                  </div>
                  <div className="control-heating-current">
                    {Math.round(row.current)} <span>°C</span>
                  </div>
                </div>
                <TuneCompactStepperInput
                  value={row.target}
                  min={0}
                  max={row.maxTarget}
                  step={5}
                  unit="°C"
                  readOnly={true}
                  displayValue={
                    temperatureKeyboardTarget === row.keyboardTarget
                      ? temperatureKeyboardValue
                      : String(Math.round(displayedTarget))
                  }
                  onChange={(nextValue) => row.onTargetChange(Math.round(clampControlValue(nextValue, 0, row.maxTarget)))}
                  onInputFocus={() => onTemperatureKeyboardOpen(row.keyboardTarget)}
                  disabled={targetBlockReason !== null}
                  onBlocked={() => showLockPopup(targetBlockReason)}
                  inputAriaLabel={`Целевая температура ${row.uiLabel.toLowerCase()}`}
                  testIdPrefix={row.testIdPrefix}
                />
                <div
                  className="control-heating-slider"
                  onPointerDownCapture={() => { temperatureDragRef.current = row.id }}
                  onPointerUpCapture={() => {
                    if (temperatureDragRef.current !== row.id) return
                    temperatureDragRef.current = null
                    setTemperatureDraft(null)
                    if (targetBlockReason !== null) showLockPopup(targetBlockReason)
                    else if (temperatureDraft?.id === row.id) row.onTargetChange(temperatureDraft.value)
                  }}
                  onPointerCancelCapture={() => {
                    temperatureDragRef.current = null
                    setTemperatureDraft(null)
                  }}
                  onLostPointerCapture={() => {
                    temperatureDragRef.current = null
                    setTemperatureDraft(null)
                  }}
                >
                  <HorizontalSteppedSlider
                    className={`control-fan-design-slider control-heating-design-slider is-${row.tone}`}
                    ariaLabel={`Быстрая температура: ${row.uiLabel.toLowerCase()}`}
                    value={displayedTarget}
                    min={0}
                    max={row.maxTarget}
                    step={5}
                    disabled={targetBlockReason !== null}
                    onBlocked={() => showLockPopup(targetBlockReason)}
                    onChange={(value) => {
                      if (temperatureDragRef.current === row.id) setTemperatureDraft({ id: row.id, value })
                      else row.onTargetChange(value)
                    }}
                  />
                </div>
              </section>
            )
          })}
        </section>
        <div className="control-heating-chart-block" role="img" aria-label="История температуры сопла и стола. Сплошные линии — текущая температура, пунктир — заданная.">
          <TemperatureTrendChart series={chartSeries} testId="control-heating-chart" />
        </div>
      </div>

      {temperatureKeyboardTarget !== null ? (
        <article className="control-card control-card-heating-keyboard control-subpanel">
          {renderTemperatureKeyboardPanel('is-control')}
        </article>
      ) : (
        <article className="control-card control-card-heating-presets control-subpanel" aria-label="Филамент и предустановки нагрева">
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
                  aria-label={`${preset.label}: сопло ${preset.nozzle}°C, стол ${preset.bed}°C`}
                  aria-disabled={getPresetBlockReason() !== null || undefined}
                  data-testid={`control-heating-preset-${preset.id}`}
                  onClick={() => handlePresetApply(preset.nozzle, preset.bed)}
                >
                  <span className="control-heating-preset-label">{preset.label}</span>
                  <span className="control-heating-preset-values">
                    {preset.nozzle}/{preset.bed}°
                  </span>
                </button>
              )
            })}
          </div>
          <section className="control-heating-filament" aria-label="Движение филамента">
            <div className="control-heating-filament-step">
              <p>Шаг, мм</p>
              <div className="control-heating-filament-step-options" role="group" aria-label="Шаг движения филамента">
                {CONTROL_MOVE_STEP_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`control-heating-filament-step-btn${filament.moveStepKey === option.id ? ' is-active' : ''}`}
                    aria-label={`Шаг филамента ${option.valueMm} мм`}
                    aria-pressed={filament.moveStepKey === option.id}
                    onClick={() => filament.onMoveStepChange(option.id)}
                  >
                    {option.valueMm}
                  </button>
                ))}
              </div>
            </div>
            {([1, -1] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                className="control-heating-filament-move"
                aria-disabled={filament.isFilamentBusy || (direction > 0
                  ? filament.commandBlockReasons.unloadFilament !== null
                  : filament.commandBlockReasons.loadFilament !== null) || undefined}
                onClick={() => void handleFilamentMove(direction)}
              >
                <span className="axis-cross-arrow" aria-hidden="true">{direction > 0 ? '↑' : '↓'}</span>
                <span>{direction > 0 ? 'Выгрузить' : 'Загрузить'}</span>
              </button>
            ))}
          </section>
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
