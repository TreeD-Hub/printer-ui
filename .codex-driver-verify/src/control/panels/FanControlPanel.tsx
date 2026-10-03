import { memo, useEffect, useRef, useState } from 'react'
import { HorizontalSteppedSlider, IconMask } from '../../ui'
import { CONTROL_FAN_PRESET_OPTIONS } from '../config'
import type { FanControlPanelProps } from '../types'

function normalizeFanPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)))
}

function findClosestFanPresetId(value: number): string {
  const normalizedValue = normalizeFanPercent(value)
  const [firstPreset, ...remainingPresets] = CONTROL_FAN_PRESET_OPTIONS

  return remainingPresets.reduce((closestPreset, preset) => {
    const closestDistance = Math.abs(closestPreset.value - normalizedValue)
    const presetDistance = Math.abs(preset.value - normalizedValue)

    return presetDistance < closestDistance ? preset : closestPreset
  }, firstPreset).id
}

export const FanControlPanel = memo(function FanControlPanel({
  printFanPercent,
  isBusy,
  commandBlockReason,
  onFanPercentChange,
}: FanControlPanelProps) {
  const lockPopupIdRef = useRef(0)
  const isFanSliderDraggingRef = useRef(false)
  const pendingFanPercentRef = useRef(normalizeFanPercent(printFanPercent))
  const [lockPopup, setLockPopup] = useState<{ id: number; message: string } | null>(null)
  const [displayFanPercent, setDisplayFanPercent] = useState<number>(() => normalizeFanPercent(printFanPercent))
  const activeFanPresetId = findClosestFanPresetId(displayFanPercent)

  useEffect(() => {
    if (isFanSliderDraggingRef.current) {
      return
    }

    const normalized = normalizeFanPercent(printFanPercent)
    pendingFanPercentRef.current = normalized
    setDisplayFanPercent(normalized)
  }, [printFanPercent])

  useEffect(() => {
    if (lockPopup === null) {
      return
    }

    const timeoutId = window.setTimeout(() => setLockPopup(null), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [lockPopup])

  function showLockPopup(): void {
    if (commandBlockReason === null) {
      return
    }

    lockPopupIdRef.current += 1
    setLockPopup({
      id: lockPopupIdRef.current,
      message: commandBlockReason,
    })
  }

  function commitFanPercent(nextValue: number): void {
    if (commandBlockReason !== null) {
      showLockPopup()
      return
    }

    const normalized = normalizeFanPercent(nextValue)
    pendingFanPercentRef.current = normalized
    setDisplayFanPercent(normalized)

    if (normalized === normalizeFanPercent(printFanPercent)) {
      return
    }

    onFanPercentChange(normalized)
  }

  function handleFanSliderPreview(nextValue: number): void {
    const normalized = normalizeFanPercent(nextValue)
    isFanSliderDraggingRef.current = true
    pendingFanPercentRef.current = normalized
    setDisplayFanPercent(normalized)
  }

  function handleFanSliderCommit(): void {
    if (!isFanSliderDraggingRef.current) {
      return
    }

    isFanSliderDraggingRef.current = false
    commitFanPercent(pendingFanPercentRef.current)
  }

  function handleFanSliderCancel(): void {
    if (!isFanSliderDraggingRef.current) {
      return
    }

    isFanSliderDraggingRef.current = false
    const normalized = normalizeFanPercent(printFanPercent)
    pendingFanPercentRef.current = normalized
    setDisplayFanPercent(normalized)
  }

  return (
    <article className="control-card control-card-fan">
      {lockPopup !== null ? (
        <div
          key={lockPopup.id}
          className="control-lock-popup"
          role="alertdialog"
          aria-live="assertive"
          aria-label="Причина блокировки"
          data-testid="fan-lock-popup"
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
      <div className="control-fan-body">
        <section className="control-fan-summary" aria-label="Текущее состояние вентилятора">
          <div className="control-fan-summary-copy">
            <h4>Обдув модели</h4>
            <p>Охлаждение / воздушный поток</p>
          </div>
          <div className="control-fan-summary-value">
            <strong>{displayFanPercent}%</strong>
            <span>Скорость вентилятора</span>
          </div>
        </section>

        <section className="control-fan-slider-panel control-subpanel" aria-label="Регулировка скорости вентилятора">
          <button
            type="button"
            className="control-fan-step-btn"
            aria-label="Уменьшить скорость вентилятора на 5 процентов"
            aria-disabled={commandBlockReason !== null || undefined}
            onClick={() => commitFanPercent(displayFanPercent - 5)}
            disabled={isBusy || displayFanPercent <= 0}
          >
            -
          </button>
          <div
            className="control-fan-slider-core"
            onPointerUpCapture={handleFanSliderCommit}
            onPointerCancelCapture={handleFanSliderCancel}
          >
            <HorizontalSteppedSlider
              className="control-fan-design-slider"
              value={displayFanPercent}
              min={0}
              max={100}
              step={5}
              onChange={handleFanSliderPreview}
              disabled={isBusy || commandBlockReason !== null}
              onBlocked={showLockPopup}
              testId="control-fan-slider"
            />
            <div className="control-fan-slider-labels" aria-hidden="true">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100%</span>
            </div>
          </div>
          <button
            type="button"
            className="control-fan-step-btn"
            aria-label="Увеличить скорость вентилятора на 5 процентов"
            aria-disabled={commandBlockReason !== null || undefined}
            onClick={() => commitFanPercent(displayFanPercent + 5)}
            disabled={isBusy || displayFanPercent >= 100}
          >
            +
          </button>
        </section>

        <section className="control-fan-presets" aria-labelledby="control-fan-presets-title">
          <p id="control-fan-presets-title">Предустановки</p>
          <div className="control-fan-preset-row" role="group" aria-label="Предустановки вентилятора">
            {CONTROL_FAN_PRESET_OPTIONS.map((preset) => {
              const isActive = activeFanPresetId === preset.id

              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`control-fan-preset-btn${isActive ? ' is-active' : ''}`}
                  aria-pressed={isActive}
                  aria-disabled={commandBlockReason !== null || undefined}
                  data-testid={`control-fan-preset-${preset.id}`}
                  onClick={() => commitFanPercent(preset.value)}
                  disabled={isBusy}
                >
                  <span className="control-fan-preset-dot" aria-hidden="true" />
                  <span>{preset.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="control-fan-note control-subpanel">
          <span className="control-fan-info-icon" aria-hidden="true">i</span>
          <p>Регулирует интенсивность обдува модели для улучшения качества печати.</p>
          <IconMask name="metricFan" size={44} className="control-fan-note-icon" />
        </section>
      </div>
    </article>
  )
})
