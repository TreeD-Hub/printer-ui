import type { ReactNode } from 'react'

export type SidebarIconName =
  | 'movement'
  | 'heat'
  | 'fan'
  | 'light'
  | 'filament'
  | 'drivers'
  | 'maintenance'
  | 'camera'
  | 'network'
  | 'system'
  | 'interface'
  | 'notifications'
  | 'analysis'
  | 'autoprinter'
  | 'account'
  | 'device'
  | 'updates'
  | 'language'
  | 'console'

type SidebarIconProps = {
  name: SidebarIconName
  size?: number
}

const shape = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  vectorEffect: 'non-scaling-stroke' as const,
}

export function SidebarIcon({ name, size = 28 }: SidebarIconProps) {
  let glyph: ReactNode = null

  switch (name) {
    case 'movement':
      glyph = <path {...shape} d="M12 3v18M3 12h18M8.5 6.5 12 3l3.5 3.5M8.5 17.5 12 21l3.5-3.5M6.5 8.5 3 12l3.5 3.5m11-7L21 12l-3.5 3.5" />
      break
    case 'heat':
      glyph = <>
        <path {...shape} d="M6 3h12M6 6h12M9 3v6m6-6v6" />
        <rect {...shape} x="5" y="9" width="14" height="5" rx="1" />
        <path {...shape} d="M8.5 14v3L12 21l3.5-4v-3" />
      </>
      break
    case 'fan':
      glyph = <>
        <circle {...shape} cx="12" cy="12" r="1.8" />
        <path {...shape} d="M10.5 10.8C8.1 9.3 7 5.8 9 4.3c2.4-1.8 5.7-.3 5 2.3l-1.1 3.8" />
        <path {...shape} d="M10.5 10.8C8.1 9.3 7 5.8 9 4.3c2.4-1.8 5.7-.3 5 2.3l-1.1 3.8" transform="rotate(120 12 12)" />
        <path {...shape} d="M10.5 10.8C8.1 9.3 7 5.8 9 4.3c2.4-1.8 5.7-.3 5 2.3l-1.1 3.8" transform="rotate(240 12 12)" />
      </>
      break
    case 'light':
      glyph = <>
        <rect {...shape} x="3.5" y="5" width="17" height="6" rx="1.5" />
        <path {...shape} d="M8 8h0m4 0h0m4 0h0M6.5 15 4 18m8-3v5m5.5-5 2.5 3" />
      </>
      break
    case 'filament':
      glyph = <>
        <rect {...shape} x="4.5" y="6.5" width="15" height="11" rx="2" />
        <path {...shape} d="M10 2.5v19M15.5 10h0m-1 4h2" />
      </>
      break
    case 'drivers':
      glyph = <>
        <path {...shape} d="m7 4-3 3v10l3 3h10l3-3V7l-3-3H7Z" />
        <circle {...shape} cx="12" cy="12" r="4" />
        <circle {...shape} cx="12" cy="12" r="1.2" />
        <path {...shape} d="M8 4V2m8 2V2" />
      </>
      break
    case 'maintenance':
      glyph = <path {...shape} d="M14 3.5a5.5 5.5 0 0 0-6.2 7.7l-4.2 4.2a3 3 0 0 0 4.2 4.2l4.2-4.2a5.5 5.5 0 0 0 7.7-6.2L16 12l-4-4 2-4.5Z" />
      break
    case 'camera':
      glyph = <>
        <rect {...shape} x="3.5" y="4.5" width="17" height="12" rx="2" />
        <circle {...shape} cx="12" cy="10.5" r="3.5" />
        <path {...shape} d="M12 16.5v4M8 20.5h8" />
      </>
      break
    case 'network':
      glyph = <>
        <path {...shape} d="M2.5 8.5a14 14 0 0 1 19 0M5.5 12a9.5 9.5 0 0 1 13 0m-10 3.5a5 5 0 0 1 7 0" />
        <circle {...shape} cx="12" cy="19" r="1" />
      </>
      break
    case 'system':
      glyph = <>
        <path {...shape} d="m10 3-.6 2.4-2 .9L5 5.7 3 9.2l1.8 1.7v2.2L3 14.8l2 3.5 2.4-.6 2 .9.6 2.4h4l.6-2.4 2-.9 2.4.6 2-3.5-1.8-1.7v-2.2L21 9.2l-2-3.5-2.4.6-2-.9L14 3h-4Z" />
        <circle {...shape} cx="12" cy="12" r="3" />
      </>
      break
    case 'interface':
      glyph = <>
        <rect {...shape} x="3" y="4.5" width="18" height="13" rx="1.5" />
        <path {...shape} d="M8 4.5v13M11.5 9H17m-5.5 4H15m-3 4.5V21m-4 0h8" />
      </>
      break
    case 'notifications':
      glyph = <>
        <path {...shape} d="M12 3v2m-7.5 12h15L18 14V11a6 6 0 0 0-12 0v3l-1.5 3ZM10 20a2.2 2.2 0 0 0 4 0" />
      </>
      break
    case 'analysis':
      glyph = <>
        <path {...shape} d="m3.5 6 6-3 6 3-6 3-6-3Zm0 0v7l5 2.5m1-6.5v4.5m6-7.5v3" />
        <circle {...shape} cx="15.5" cy="15" r="4.5" />
        <path {...shape} d="m18.7 18.2 2.8 2.8" />
      </>
      break
    case 'autoprinter':
      glyph = <>
        <path {...shape} d="M3 10a9 9 0 0 1 15.5-4M19 2v4h-4m6 8a9 9 0 0 1-15.5 4M5 22v-4h4" />
        <path {...shape} d="M9 8h6v3l-3 3-3-3V8Zm-1 9h8" />
      </>
      break
    case 'account':
      glyph = <>
        <circle {...shape} cx="12" cy="7" r="3.5" />
        <path {...shape} d="M4 20v-1a8 5.5 0 0 1 16 0v1H4Z" />
      </>
      break
    case 'device':
      glyph = <>
        <rect {...shape} x="4" y="3" width="16" height="18" rx="1" />
        <path {...shape} d="M4 7h16M9 7v3l3 3 3-3V7M7 17h10m-5 0v4" />
      </>
      break
    case 'updates':
      glyph = <>
        <path {...shape} d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4" />
      </>
      break
    case 'language':
      glyph = <>
        <path {...shape} d="M3 5h10M8 3v2m3 0c-.5 5-3.5 8-8 10m2-7c1.5 3.5 4 5.5 7 7m1 6 4-11 4 11m-6.5-4h5" />
      </>
      break
    case 'console':
      glyph = <>
        <rect {...shape} x="3" y="4.5" width="18" height="15" rx="1.5" />
        <path {...shape} d="m7 9 3 3-3 3m6 0h4" />
      </>
      break
  }

  return (
    <svg
      className="settings-sidebar-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {glyph}
    </svg>
  )
}
