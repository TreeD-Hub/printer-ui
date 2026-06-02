import { memo } from 'react'
import type { LightingControlPanelProps } from '../types'

export const LightingControlPanel = memo(function LightingControlPanel({
  isMainLightEnabled,
  isToolheadLightEnabled,
  onMainLightToggle,
  onToolheadLightToggle,
}: LightingControlPanelProps) {
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
          data-testid="control-light-main"
          onClick={onMainLightToggle}
        >
          <span className="control-lighting-icon is-main" aria-hidden="true" />
          <span className="control-lighting-copy">
            <span className="control-lighting-title">Основной свет</span>
            <span className="control-lighting-state">{isMainLightEnabled ? 'Вкл' : 'Выкл'}</span>
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
          data-testid="control-light-toolhead"
          onClick={onToolheadLightToggle}
        >
          <span className="control-lighting-icon is-toolhead" aria-hidden="true" />
          <span className="control-lighting-copy">
            <span className="control-lighting-title">Подсветка ПГ</span>
            <span className="control-lighting-state">{isToolheadLightEnabled ? 'Вкл' : 'Выкл'}</span>
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
