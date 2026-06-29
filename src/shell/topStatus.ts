import type { PrinterCommandId } from '../core/commands'
import { TOP_STATUS_BUTTONS, type TopStatusButtonId } from '../dashboard/config'

export const CLOUD_LINK_URL = 'https://treed.pro'
export const CLOUD_QR_IMAGE_URL = 'https://api.qrserver.com/v1/create-qr-code/?size=144x144&data=https%3A%2F%2Ftreed.pro'
export const TOP_POPUP_MAX_WIDTH = 360
export const TOP_POPUP_GAP = 8
export const TOP_POPUP_SIDE_PADDING = 8
export const TOP_POPUP_ARROW_EDGE = 18
export const FALLBACK_SCREEN_WIDTH = 960

export const TOP_BAR_POPUP_TITLES: Record<TopStatusButtonId, string> = {
  wifi: 'Состояние Wi-Fi',
  cloud: 'Состояние облака',
  notifications: 'Уведомления',
  power: 'Питание и перезапуск',
}

export type PowerMenuCommand = Extract<
  PrinterCommandId,
  'shutdownHost' | 'rebootHost' | 'restartKlipper' | 'firmwareRestart' | 'restartMoonraker'
>

export type PowerMenuAction = {
  command: PowerMenuCommand
  label: string
  tone?: 'default' | 'danger'
}

export type PowerMenuActionState = PowerMenuAction & {
  blockReason: string | null
}

export const POWER_MENU_ACTIONS: PowerMenuAction[] = [
  {
    command: 'restartKlipper',
    label: 'Перезапустить Klipper',
  },
  {
    command: 'firmwareRestart',
    label: 'Перезапустить прошивку MCU',
  },
  {
    command: 'restartMoonraker',
    label: 'Перезапустить Moonraker',
  },
  {
    command: 'rebootHost',
    label: 'Перезагрузить принтер',
    tone: 'danger',
  },
  {
    command: 'shutdownHost',
    label: 'Выключить принтер',
    tone: 'danger',
  },
]

export type TopPopupPosition = {
  top: number
  left: number
  arrowLeft: number
}

type TopPopupPositionInput = {
  id: TopStatusButtonId
  shellWidth: number
  anchorCenterX?: number
  anchorBottomY?: number
}

export function resolveFallbackAnchorCenterX(id: TopStatusButtonId, screenWidth: number): number {
  const buttonIndex = TOP_STATUS_BUTTONS.findIndex((item) => item.id === id)
  const buttonsFromRight = TOP_STATUS_BUTTONS.length - 1 - Math.max(0, buttonIndex)
  const rightEdge = screenWidth - 24 - (buttonsFromRight * 64)

  return rightEdge - 28
}

export function resolveTopPopupPosition({
  id,
  shellWidth,
  anchorCenterX,
  anchorBottomY = 0,
}: TopPopupPositionInput): TopPopupPosition {
  const popupWidth = Math.min(TOP_POPUP_MAX_WIDTH, shellWidth - (TOP_POPUP_SIDE_PADDING * 2))
  const resolvedAnchorCenterX = anchorCenterX ?? resolveFallbackAnchorCenterX(id, shellWidth)
  let left = resolvedAnchorCenterX - (popupWidth / 2)
  left = Math.max(TOP_POPUP_SIDE_PADDING, Math.min(left, shellWidth - popupWidth - TOP_POPUP_SIDE_PADDING))

  const arrowLeft = Math.max(
    TOP_POPUP_ARROW_EDGE,
    Math.min(resolvedAnchorCenterX - left, popupWidth - TOP_POPUP_ARROW_EDGE),
  )

  return {
    top: Math.max(TOP_POPUP_GAP, anchorBottomY + TOP_POPUP_GAP),
    left,
    arrowLeft,
  }
}
