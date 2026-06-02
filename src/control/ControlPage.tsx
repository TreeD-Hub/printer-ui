import { memo } from 'react'
import { IconMask, SettingsSidebarMenu } from '../ui'
import { CONTROL_GROUP_OPTIONS } from './config'
import { FanControlPanel } from './panels/FanControlPanel'
import { HeatingControlPanel } from './panels/HeatingControlPanel'
import { LightingControlPanel } from './panels/LightingControlPanel'
import { MaintenanceControlPanel } from './panels/MaintenanceControlPanel'
import { MovementControlPanel } from './panels/MovementControlPanel'
import type {
  ControlGroupId,
  FanControlPanelProps,
  HeatingControlPanelProps,
  LightingControlPanelProps,
  MaintenanceControlPanelProps,
  MovementControlPanelProps,
} from './types'

type ControlPageProps = {
  activeControlGroup: ControlGroupId
  isControlMenuCompact: boolean
  onControlGroupChange: (groupId: ControlGroupId) => void
  onControlMenuCompactToggle: () => void
  movement: MovementControlPanelProps
  heating: HeatingControlPanelProps
  fan: FanControlPanelProps
  lighting: LightingControlPanelProps
  maintenance: MaintenanceControlPanelProps
}

export const ControlPage = memo(function ControlPage({
  activeControlGroup,
  isControlMenuCompact,
  onControlGroupChange,
  onControlMenuCompactToggle,
  movement,
  heating,
  fan,
  lighting,
  maintenance,
}: ControlPageProps) {
  const activeControlGroupOption =
    CONTROL_GROUP_OPTIONS.find((option) => option.id === activeControlGroup) ?? CONTROL_GROUP_OPTIONS[0]

  return (
    <section className="control-screen" data-testid="screen-control">
      <div className={`control-layout ${isControlMenuCompact ? 'is-menu-compact' : ''}`}>
        <aside className={`settings-menu-shell control-menu-shell ${isControlMenuCompact ? 'is-compact' : ''}`}>
          <button
            type="button"
            className="control-menu-collapse-btn"
            aria-expanded={!isControlMenuCompact}
            aria-label={isControlMenuCompact ? 'Развернуть меню управления' : 'Свернуть меню управления до иконок'}
            data-testid="control-menu-mode-toggle"
            onClick={onControlMenuCompactToggle}
          >
            <IconMask name="utilityChevron" size={20} className="control-menu-collapse-icon" />
          </button>
          <SettingsSidebarMenu
            options={CONTROL_GROUP_OPTIONS}
            value={activeControlGroup}
            onChange={onControlGroupChange}
            ariaLabel="Разделы управления"
            testIdPrefix="control-group"
            iconSize={28}
          />
        </aside>

        <div className="settings-content-shell control-content-shell">
          {activeControlGroup === 'maintenance' ? (
            <div className="control-maintenance-header">
              <div className="control-maintenance-heading">
                <p className="control-tab-label" data-testid="control-active-tab-label">Т.О</p>
                <p className="control-maintenance-subtitle">
                  Сервисное обслуживание и напоминания для вашего 3D-принтера.
                </p>
              </div>
              <p className="control-maintenance-status-pill">
                Следующее ТО через {maintenance.status.hoursLeft} ч
                <span aria-hidden="true" />
              </p>
            </div>
          ) : (
            <p className="control-tab-label" data-testid="control-active-tab-label">
              {activeControlGroupOption.label}
            </p>
          )}
          <div className="control-scroll-area">
            {activeControlGroup === 'movement' ? (
              <MovementControlPanel {...movement} />
            ) : activeControlGroup === 'heating' ? (
              <HeatingControlPanel {...heating} />
            ) : activeControlGroup === 'fans' ? (
              <FanControlPanel {...fan} />
            ) : activeControlGroup === 'lighting' ? (
              <LightingControlPanel {...lighting} />
            ) : (
              <MaintenanceControlPanel {...maintenance} />
            )}
          </div>
        </div>
      </div>
    </section>
  )
})
