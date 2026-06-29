import { memo } from 'react'
import type { LightingControlPanelProps } from '../types'

export const LightingControlPanel = memo(function LightingControlPanel({
  isMainLightEnabled,
  isToolheadLightEnabled,
  isBusy,
  mainLightCommandBlockReason,
  toolheadLightCommandBlockReason,
  onMainLightToggle,
  onToolheadLightToggle,
}: LightingControlPanelProps) {
  const isMainLightDisabled = isBusy || mainLightCommandBlockReason !== null
  const isToolheadLightDisabled = isBusy || toolheadLightCommandBlockReason !== null
  const mainLightStateLabel = mainLightCommandBlockReason !== null
    ? 'Недоступно'
    : isBusy
      ? 'Ожидание'
      : isMainLightEnabled
        ? 'Вкл'
        : 'Выкл'
  const toolheadLightStateLabel = toolheadLightCommandBlockReason !== null
    ? 'Недоступно'
    : isBusy
      ? 'Ожидание'
      : isToolheadLightEnabled
        ? 'Вкл'
        : 'Выкл'

  return (
    <article className="control-card-lighting">
      <div className="control-card-head">
        <h3 className="control-card-title">Подсветка</h3>
      </div>
      <div className="control-lighting-list" role="group" aria-label="Управление подсветкой">
        <button
          type="button"
          className={`control-lighting-row control-subpanel${isMainLightEnabled ? ' is-active' : ''}`}
          aria-pressed={isMainLightEnabled}
          aria-disabled={isMainLightDisabled || undefined}
          data-testid="control-light-main"
          title={mainLightCommandBlockReason ?? undefined}
          onClick={onMainLightToggle}
          disabled={isMainLightDisabled}
        >
          <span className="control-lighting-icon is-main" aria-hidden="true" />
          <span className="control-lighting-copy">
            <span className="control-lighting-title">Основной свет</span>
            <span className="control-lighting-state">{mainLightStateLabel}</span>
          </span>
          <span className="control-lighting-switch" aria-hidden="true">
            <span className="control-lighting-switch-knob" />
            <span className="control-lighting-switch-mark">{isMainLightEnabled ? '+' : '-'}</span>
          </span>
          <span className="control-lighting-more" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`control-lighting-row control-subpanel${isToolheadLightEnabled ? ' is-active' : ''}`}
          aria-pressed={isToolheadLightEnabled}
          aria-disabled={isToolheadLightDisabled || undefined}
          data-testid="control-light-toolhead"
          title={toolheadLightCommandBlockReason ?? undefined}
          onClick={onToolheadLightToggle}
          disabled={isToolheadLightDisabled}
        >
          <span className="control-lighting-icon is-toolhead" aria-hidden="true" />
          <span className="control-lighting-copy">
            <span className="control-lighting-title">Подсветка ПГ</span>
            <span className="control-lighting-state">{toolheadLightStateLabel}</span>
          </span>
          <span className="control-lighting-switch" aria-hidden="true">
            <span className="control-lighting-switch-knob" />
            <span className="control-lighting-switch-mark">{isToolheadLightEnabled ? '+' : '-'}</span>
          </span>
          <span className="control-lighting-more" aria-hidden="true" />
        </button>
      </div>
    </article>
  )
})
