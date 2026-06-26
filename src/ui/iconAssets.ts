import actionPause from '../assets/icons/action-pause.svg'
import actionDelete from '../assets/icons/action-delete.svg'
import actionResume from '../assets/icons/action-resume.svg'
import actionStopCritical from '../assets/icons/action-stop-critical.svg'
import menuControl from '../assets/icons/menu-control.svg'
import metricBed from '../assets/icons/metric-bed.svg'
import metricFlow from '../assets/icons/metric-flow.svg'
import metricNozzle from '../assets/icons/metric-nozzle.svg'
import metricSpeed from '../assets/icons/metric-speed.svg'
import menuDashboard from '../assets/icons/menu-dashboard.svg'
import menuDevice from '../assets/icons/menu-device.svg'
import menuFiles from '../assets/icons/menu-files.svg'
import menuInterface from '../assets/icons/menu-interface.svg'
import menuLanguage from '../assets/icons/menu-language.svg'
import menuMacros from '../assets/icons/menu-macros.svg'
import menuSettings from '../assets/icons/menu-settings.svg'
import menuUpdates from '../assets/icons/menu-updates.svg'
import metricFan from '../assets/icons/metric-fan.svg'
import metricLight from '../assets/icons/metric-light.svg'
import statusCloud from '../assets/icons/status-cloud.svg'
import statusNotification from '../assets/icons/status-notification.svg'
import statusPower from '../assets/icons/status-power.svg'
import statusWifi from '../assets/icons/status-wifi.svg'
import utilityChevron from '../assets/icons/utility-chevron.svg'
import utilitySnowflake from '../assets/icons/utility-snowflake.svg'

export const UI_ICON_ASSETS = {
  actionDelete,
  actionPause,
  actionResume,
  actionStopCritical,
  metricBed,
  metricFlow,
  metricNozzle,
  metricSpeed,
  menuControl,
  menuDashboard,
  menuDevice,
  menuFiles,
  menuInterface,
  menuLanguage,
  menuMacros,
  menuSettings,
  menuUpdates,
  metricFan,
  metricLight,
  statusCloud,
  statusNotification,
  statusPower,
  statusWifi,
  utilityChevron,
  utilitySnowflake,
} as const

export type UiIconName = keyof typeof UI_ICON_ASSETS
