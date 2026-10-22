import { type CSSProperties } from 'react'
import { UI_ICON_ASSETS, type UiIconName } from './iconAssets'
import { SidebarIcon, type SidebarIconName } from './SidebarIcon'

// Панели и меню используют одни контуры для одинаковых функций.
const SHARED_PANEL_ICONS: Partial<Record<UiIconName, SidebarIconName>> = {
  metricNozzle: 'heat',
  metricFan: 'fan',
  metricLight: 'light',
}

type IconMaskProps = {
  name: UiIconName
  size?: number
  className?: string
}

export function IconMask({ name, size = 24, className = '' }: IconMaskProps) {
  const sharedIcon = SHARED_PANEL_ICONS[name]
  if (sharedIcon) {
    return <SidebarIcon name={sharedIcon} size={size} className={className} />
  }

  const iconUrl = `url("${UI_ICON_ASSETS[name]}")`
  const style: CSSProperties = {
    width: size,
    height: size,
    WebkitMaskImage: iconUrl,
    WebkitMaskPosition: 'center',
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
    maskImage: iconUrl,
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
  }

  return <span className={`ui-icon-mask ${className}`.trim()} style={style} aria-hidden="true" />
}
