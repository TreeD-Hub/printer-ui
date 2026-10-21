import { memo } from 'react'
import { IconMask, SettingsSidebarMenu } from '../ui'
import { CONTROL_GROUP_OPTIONS } from './config'
import { FanControlPanel } from './panels/FanControlPanel'
import { FilamentSensorControlPanel } from './panels/FilamentSensorControlPanel'
import { HeatingControlPanel } from './panels/HeatingControlPanel'
import { LightingControlPanel } from './panels/LightingControlPanel'
import { MaintenanceControlPanel } from './panels/MaintenanceControlPanel'
import { MovementControlPanel } from './panels/MovementControlPanel'
import { DriverModeControlPanel } from './panels/DriverModeControlPanel'
import { CameraControlPanel } from './panels/CameraControlPanel'
import type { DriverControlsProps } from './panels/DriverModeControlPanel'
import type {
  ControlGroupId,
  FanControlPanelProps,
  FilamentSensorControlPanelProps,
  HeatingControlPanelProps,
  LightingControlPanelProps,
  MaintenanceControlPanelProps,
  MovementControlPanelProps,
} from './types'

type ControlPageProps = {
  driverControls?: DriverControlsProps
  activeControlGroup: ControlGroupId
  isControlMenuCompact: boolean
  controlGroupBlockReasons?: Partial<Record<ControlGroupId, string | null>>
  onControlGroupChange: (groupId: ControlGroupId) => void
  onControlMenuCompactToggle: () => void
  movement: MovementControlPanelProps
  heating: HeatingControlPanelProps
  fan: FanControlPanelProps
  filament: FilamentSensorControlPanelProps
  lighting: LightingControlPanelProps
  maintenance: MaintenanceControlPanelProps
}

export const ControlPage = memo(function ControlPage({
  driverControls,
  activeControlGroup,
  isControlMenuCompact,
  controlGroupBlockReasons,
  onControlGroupChange,
  onControlMenuCompactToggle,
  movement,
  heating,
  fan,
  filament,
  lighting,
  maintenance,
}: ControlPageProps) {
  const activeControlGroupOption =
    CONTROL_GROUP_OPTIONS.find((option) => option.id === activeControlGroup) ?? CONTROL_GROUP_OPTIONS[0]
  const maintenanceStatusLabel = maintenance.status.isCycleBacked === true
    ? maintenance.status.hoursLeft > 0
      ? `Следующее ТО через ${maintenance.status.hoursLeft} ч`
      : 'Требуется плановое ТО'
    : maintenance.status.cycleState === 'loading'
      ? 'Загрузка данных ТО'
      : 'Расчёт ТО недоступен'

  if (activeControlGroup === 'camera') {
    return <CameraControlPanel onBack={() => onControlGroupChange('movement')} />
  }

  return (
    <section className="control-screen" data-testid="screen-control">
      <div className={`control-layout ${isControlMenuCompact ? 'is-menu-compact' : ''}`}>
        <aside className={`settings-menu-shell control-menu-shell ${isControlMenuCompact ? 'is-compact' : ''}`}>
          <button
            type="button"
            className="settings-sidebar-item control-menu-collapse-btn"
            aria-expanded={!isControlMenuCompact}
            aria-label={isControlMenuCompact ? 'Развернуть меню управления' : 'Свернуть меню управления до иконок'}
            title={isControlMenuCompact ? 'Развернуть меню' : 'Свернуть меню'}
            data-testid="control-menu-mode-toggle"
            onClick={onControlMenuCompactToggle}
          >
            <IconMask name="utilityChevron" size={20} className="control-menu-collapse-icon" />
            <span className="settings-sidebar-label">Свернуть меню</span>
          </button>
          <SettingsSidebarMenu
            options={CONTROL_GROUP_OPTIONS}
            value={activeControlGroup}
            onChange={onControlGroupChange}
            ariaLabel="Разделы управления"
            testIdPrefix="control-group"
            iconSize={28}
            disabledReasons={controlGroupBlockReasons}
          />
        </aside>

        <div className="settings-content-shell control-content-shell">
          <header className="control-view-header">
            {activeControlGroup === 'maintenance' ? (
              <div className="control-maintenance-header">
                <p className="control-tab-label" data-testid="control-active-tab-label">Т.О</p>
                <p className="control-maintenance-status-pill">
                  {maintenanceStatusLabel}
                  <span aria-hidden="true" />
                </p>
              </div>
            ) : (
              <p className="control-tab-label" data-testid="control-active-tab-label">
                {activeControlGroupOption.label}
              </p>
            )}
            {activeControlGroup === 'movement' ? (
              <h3 className="control-tab-label control-parking-label">Парковка</h3>
            ) : activeControlGroup === 'heating' ? (
              <h3 className="control-tab-label">
                {heating.temperatureKeyboardTarget === null ? 'Предустановки' : 'Ввод температуры'}
              </h3>
            ) : activeControlGroup === 'filament' ? (
              <h3 id="filament-sensitivity-title" className="control-tab-label">Чувствительность</h3>
            ) : activeControlGroup === 'drivers' && driverControls?.fanMode?.supported ? (
              <h3 className="control-tab-label">Обдув драйверов</h3>
            ) : null}
          </header>
          <div className="control-scroll-area">
            {activeControlGroup === 'movement' ? (
              <MovementControlPanel {...movement} />
            ) : activeControlGroup === 'heating' ? (
              <HeatingControlPanel {...heating} />
            ) : activeControlGroup === 'fans' ? (
              <FanControlPanel {...fan} />
            ) : activeControlGroup === 'lighting' ? (
              <LightingControlPanel {...lighting} />
            ) : activeControlGroup === 'filament' ? (
              <FilamentSensorControlPanel {...filament} />
            ) : activeControlGroup === 'drivers' ? (
              <div className="control-driver-profiles">
                {driverControls?.mode?.supported || driverControls?.fanMode?.supported ? (
                  <>
                    <DriverModeControlPanel controls={driverControls} kind="drivers" />
                    <DriverModeControlPanel controls={driverControls} kind="fan" />
                  </>
                ) : <p className="control-block-reason">Режимы драйверов недоступны на этом принтере.</p>}
              </div>
            ) : (
              <MaintenanceControlPanel {...maintenance} />
            )}
          </div>
        </div>
      </div>
    </section>
  )
})
