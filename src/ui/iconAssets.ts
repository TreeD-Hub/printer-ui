import actionPause from '../assets/icons/action-pause.svg'
import actionStopCritical from '../assets/icons/action-stop-critical.svg'
import menuControl from '../assets/icons/menu-control.svg'
import menuDashboard from '../assets/icons/menu-dashboard.svg'
import menuFiles from '../assets/icons/menu-files.svg'
import menuMacros from '../assets/icons/menu-macros.svg'
import menuSettings from '../assets/icons/menu-settings.svg'
import statusCloud from '../assets/icons/status-cloud.svg'
import statusNotification from '../assets/icons/status-notification.svg'
import statusPower from '../assets/icons/status-power.svg'
import statusWifi from '../assets/icons/status-wifi.svg'

export const UI_ICON_ASSETS = {
  actionPause,
  actionStopCritical,
  menuControl,
  menuDashboard,
  menuFiles,
  menuMacros,
  menuSettings,
  statusCloud,
  statusNotification,
  statusPower,
  statusWifi,
} as const

export type UiIconName = keyof typeof UI_ICON_ASSETS
