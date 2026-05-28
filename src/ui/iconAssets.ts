import actionPause from '../assets/icons/action-pause.svg'
import actionResume from '../assets/icons/action-resume.svg'
import actionStopCritical from '../assets/icons/action-stop-critical.svg'
import menuControl from '../assets/icons/menu-control.svg'
import metricBed from '../assets/icons/metric-bed.svg'
import metricNozzle from '../assets/icons/metric-nozzle.svg'
import menuDashboard from '../assets/icons/menu-dashboard.svg'
import menuDevice from '../assets/icons/menu-device.svg'
import menuFiles from '../assets/icons/menu-files.svg'
import menuInterface from '../assets/icons/menu-interface.svg'
import menuLanguage from '../assets/icons/menu-language.svg'
import menuMacros from '../assets/icons/menu-macros.svg'
import menuSettings from '../assets/icons/menu-settings.svg'
import menuUpdates from '../assets/icons/menu-updates.svg'
import statusCloud from '../assets/icons/status-cloud.svg'
import statusNotification from '../assets/icons/status-notification.svg'
import statusPower from '../assets/icons/status-power.svg'
import statusWifi from '../assets/icons/status-wifi.svg'

export const UI_ICON_ASSETS = {
  actionPause,
  actionResume,
  actionStopCritical,
  metricBed,
  metricNozzle,
  menuControl,
  menuDashboard,
  menuDevice,
  menuFiles,
  menuInterface,
  menuLanguage,
  menuMacros,
  menuSettings,
  menuUpdates,
  statusCloud,
  statusNotification,
  statusPower,
  statusWifi,
} as const

export type UiIconName = keyof typeof UI_ICON_ASSETS
