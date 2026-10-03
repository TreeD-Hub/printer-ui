import { memo, useState } from 'react'
import type {
  FilamentSensorMode,
  FilamentSensorSensitivity,
} from '@treed/printer-logic'
import type { FilamentSensorControlPanelProps } from '../types'
import '../filamentSensor.css'

const MODE_OPTIONS: Array<{ id: FilamentSensorMode; label: string; description: string }> = [
  { id: 'presence', label: 'Только наличие', description: 'Контролируется установка нити. Сигнал энкодера движения не учитывается.' },
  { id: 'motion', label: 'Наличие и движение', description: 'Контролируются наличие нити и её фактическая подача во время печати.' },
]

const SENSITIVITY_OPTIONS: Array<{ id: FilamentSensorSensitivity; label: string; value: string }> = [
  { id: 'low', label: 'Низкая', value: '25 мм' },
  { id: 'medium', label: 'Средняя', value: '15 мм' },
  { id: 'high', label: 'Высокая', value: '7 мм' },
]

export const FilamentSensorControlPanel = memo(function FilamentSensorControlPanel({
  snapshot,
  isStale,
  pendingCommand,
  commandError,
  modeBlockReasons,
  sensitivityBlockReasons,
  onModeChange,
  onSensitivityChange,
}: FilamentSensorControlPanelProps) {
  const [sensitivityToConfirm, setSensitivityToConfirm] = useState<FilamentSensorSensitivity | null>(null)
  const isPending = pendingCommand === 'setFilamentSensorMode' || pendingCommand === 'setFilamentEncoderSensitivity'
  const filamentStatus = snapshot.filamentDetected === true
    ? 'Нить установлена'
    : snapshot.filamentDetected === false
      ? 'Нить отсутствует'
      : 'Состояние неизвестно'
  const activeModeOption = MODE_OPTIONS.find((option) => option.id === snapshot.mode) ?? MODE_OPTIONS[0]
  const blockReason = modeBlockReasons.presence
    ?? modeBlockReasons.motion
    ?? sensitivityBlockReasons.low
    ?? sensitivityBlockReasons.medium
    ?? sensitivityBlockReasons.high

  async function confirmSensitivityChange(): Promise<void> {
    if (sensitivityToConfirm === null) {
      return
    }
    if (await onSensitivityChange(sensitivityToConfirm)) {
      setSensitivityToConfirm(null)
    }
  }

  return (
    <article
      className="control-filament-panel control-filament-panel--refined"
      aria-label="Управление датчиком нити"
    >
      <div className="control-filament-layout-v2">
        <div className="control-filament-primary-column">
          <section className="control-filament-status control-subpanel" aria-live="polite">
            <div>
              <p>Состояние нити</p>
              <strong>{filamentStatus}</strong>
            </div>
            <span
              className={`control-filament-status-dot ${snapshot.filamentDetected === true ? 'is-ok' : 'is-warning'}`}
              aria-hidden="true"
            />
          </section>

          <div className="control-filament-notices" aria-live="polite">
            {isStale ? <p className="control-filament-notice is-warning">Снимок состояния устарел.</p> : null}
            {snapshot.message !== null ? <p className="control-filament-notice">{snapshot.message}</p> : null}
            {commandError ? <p className="control-filament-notice is-error" role="alert">{commandError}</p> : null}
            {isPending ? <p className="control-filament-notice">Ожидание подтверждения от принтера...</p> : null}
          </div>

          <section className="control-filament-section control-filament-mode-section" aria-labelledby="filament-mode-title">
            <div className="control-filament-section-head">
              <h3 id="filament-mode-title">Режим работы</h3>
            </div>
            <div className="control-filament-mode-grid control-filament-mode-grid--compact" role="group" aria-label="Режим датчика нити">
              {MODE_OPTIONS.map((option) => {
                const isActive = snapshot.mode === option.id
                const reason = modeBlockReasons[option.id]
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`control-filament-choice control-filament-choice--compact${isActive ? ' is-active' : ''}`}
                    aria-pressed={isActive}
                    data-testid={`filament-mode-${option.id}`}
                    title={reason ?? undefined}
                    disabled={!snapshot.supported || isPending || reason !== null}
                    onClick={() => void onModeChange(option.id)}
                  >
                    <span className="control-filament-radio" aria-hidden="true" />
                    <strong>{option.label}</strong>
                  </button>
                )
              })}
            </div>
            <div className="control-filament-mode-description" data-testid="filament-mode-description">
              <strong>{activeModeOption.label}</strong>
              <p>{activeModeOption.description}</p>
            </div>
          </section>
        </div>

        <section
          className="control-filament-section control-filament-sensitivity-section"
          aria-labelledby="filament-sensitivity-title"
        >
          <div className="control-filament-section-head control-filament-sensitivity-head">
            <h3 id="filament-sensitivity-title">Чувствительность энкодера</h3>
            <span>Изменение перезапустит Klipper</span>
          </div>
          <div
            className="control-filament-sensitivity-grid control-filament-sensitivity-grid--vertical"
            role="group"
            aria-label="Чувствительность энкодера"
          >
            {SENSITIVITY_OPTIONS.map((option) => {
              const isActive = snapshot.sensitivity === option.id
              const reason = sensitivityBlockReasons[option.id]
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`control-filament-sensitivity control-filament-sensitivity--vertical${isActive ? ' is-active' : ''}`}
                  aria-pressed={isActive}
                  data-testid={`filament-sensitivity-${option.id}`}
                  title={reason ?? undefined}
                  disabled={!snapshot.motionSupported || isPending || reason !== null}
                  onClick={() => setSensitivityToConfirm(option.id)}
                >
                  <span className="control-filament-radio" aria-hidden="true" />
                  <span className="control-filament-sensitivity-copy">
                    <strong>{option.label}</strong>
                    <small>{option.value}</small>
                  </span>
                </button>
              )
            })}
          </div>
          {blockReason !== null ? <p className="control-filament-block-reason">{blockReason}</p> : null}
        </section>
      </div>

      {sensitivityToConfirm !== null ? (
        <div className="control-filament-confirm-layer" role="presentation">
          <section
            className="control-filament-confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Подтверждение перезапуска Klipper"
          >
            <h3>Перезапустить Klipper?</h3>
            <p>Новый уровень чувствительности применится после перезапуска. Печать сейчас должна быть остановлена.</p>
            <div>
              <button type="button" onClick={() => setSensitivityToConfirm(null)}>Отмена</button>
              <button
                type="button"
                data-testid="filament-sensitivity-confirm"
                onClick={() => void confirmSensitivityChange()}
              >
                Применить
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </article>
  )
})
