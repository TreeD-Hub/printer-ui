import type { CSSProperties } from 'react'
import {
  BOTTOM_NAV_ITEMS,
  type ScreenId,
} from '../dashboard/config'
import { DashboardContainer, type DashboardContainerProps } from '../dashboard/DashboardContainer'
import { ControlContainer, type ControlContainerProps } from '../control'
import { FilesContainer, type FilesContainerProps } from '../files'
import { MacrosContainer, type MacrosContainerProps } from '../macros'
import { SettingsContainer, type SettingsContainerProps } from '../settings'
import { NavItemButton } from '../ui'

type AppScreenContentProps = {
  activeScreen: ScreenId
  isFilesScreenActive: boolean
  hasActivePrint: boolean
  dashboard: DashboardContainerProps
  files: FilesContainerProps
  control: ControlContainerProps
  macros: MacrosContainerProps
  settings: SettingsContainerProps
  onScreenSelect: (screenId: ScreenId) => void
}

export function AppScreenContent({
  activeScreen,
  isFilesScreenActive,
  hasActivePrint,
  dashboard,
  files,
  control,
  macros,
  settings,
  onScreenSelect,
}: AppScreenContentProps) {
  const activeNavIndex = Math.max(
    0,
    BOTTOM_NAV_ITEMS.findIndex((item) => item.id === activeScreen),
  )

  return (
    <>
      <div className={`content-grid ${isFilesScreenActive ? 'is-files-active' : ''} ${activeScreen === 'control' ? 'is-control-active' : ''}`}>
        {activeScreen === 'dashboard' ? (
          <DashboardContainer {...dashboard} />
        ) : isFilesScreenActive ? (
          <FilesContainer {...files} />
        ) : activeScreen === 'control' ? (
          <ControlContainer {...control} />
        ) : activeScreen === 'macros' ? (
          <MacrosContainer {...macros} />
        ) : activeScreen === 'settings' ? (
          <SettingsContainer {...settings} />
        ) : (
          <section className="screen-placeholder" data-testid={`screen-${activeScreen}`}>
            <p className="screen-placeholder-body" />
          </section>
        )}
      </div>

      <nav
        className="bottom-nav"
        aria-label="Основная навигация"
        style={{ '--nav-active-index': String(activeNavIndex) } as CSSProperties}
      >
        <span className="bottom-nav-indicator" aria-hidden="true" />
        {BOTTOM_NAV_ITEMS.map((item) => (
          <NavItemButton
            key={item.id}
            label={item.id === 'dashboard' && hasActivePrint ? 'Печать' : item.label}
            icon={item.icon}
            active={item.id === activeScreen}
            aria-current={item.id === activeScreen ? 'page' : undefined}
            onClick={() => onScreenSelect(item.id)}
          />
        ))}
      </nav>
    </>
  )
}
