import { memo } from 'react'
import { SettingsToggleRow } from '../../ui'
import type { LightingControlPanelProps } from '../types'

export const LightingControlPanel = memo(function LightingControlPanel({
  lightPreferences = { onStartup: false, onPrintStart: true },
  lightPreferencesBlockReason,
  onLightPreferenceChange,
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
      <div className="control-lighting-list" role="group" aria-label="Управление подсветкой">
        <SettingsToggleRow
          label="Основной свет"
          icon="metricLight"
          description={mainLightStateLabel}
          checked={isMainLightEnabled}
          testId="control-light-main"
          title={mainLightCommandBlockReason ?? undefined}
          onChange={onMainLightToggle}
          disabled={isMainLightDisabled}
        />

        <SettingsToggleRow
          label="Подсветка ПГ"
          icon="metricNozzle"
          description={toolheadLightStateLabel}
          checked={isToolheadLightEnabled}
          testId="control-light-toolhead"
          title={toolheadLightCommandBlockReason ?? undefined}
          onChange={onToolheadLightToggle}
          disabled={isToolheadLightDisabled}
        />
      </div>
      <section className="control-light-preferences" aria-label="Автовключение света">
        <h3>Автовключение</h3>
        {([
          ['onStartup', 'Свет при запуске принтера'],
          ['onPrintStart', 'Свет при начале печати'],
        ] as const).map(([setting, label]) => (
          <SettingsToggleRow
            key={setting}
            label={label}
            checked={lightPreferences[setting]}
            disabled={isBusy || lightPreferencesBlockReason != null || !onLightPreferenceChange}
            onChange={(enabled) => onLightPreferenceChange?.(setting, enabled)}
          />
        ))}
        {lightPreferencesBlockReason ? <p role="status">{lightPreferencesBlockReason}</p> : null}
      </section>
    </article>
  )
})
