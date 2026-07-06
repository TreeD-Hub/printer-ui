import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type { TopStatusButtonId } from '../dashboard/config'
import {
  FALLBACK_SCREEN_WIDTH,
  POWER_MENU_ACTIONS,
  resolveTopPopupPosition,
  type PowerMenuActionState,
  type PowerMenuCommand,
  type TopPopupPosition,
} from './topStatus'

type UseTopStatusControllerArgs = {
  screenShellRef: RefObject<HTMLElement | null>
  activeScreen: string
  currentPrinterNotificationId: string | null
  isBusy: boolean
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  getCommandBlockReason: (command: PrinterCommandId) => string | null
  requiresCommandConfirmation: (command: PrinterCommandId) => boolean
  transitionPowerCommand: PowerMenuCommand | null
}

type UseTopStatusControllerResult = {
  activeTopPopup: TopStatusButtonId | null
  topPopupPosition: TopPopupPosition | null
  powerMenuActions: PowerMenuActionState[]
  armedPowerCommand: PrinterCommandId | null
  hasUnreadPrinterNotification: boolean
  openTopPopup: (id: TopStatusButtonId) => void
  closeTopPopup: () => void
  setTopButtonRef: (id: TopStatusButtonId, node: HTMLButtonElement | null) => void
  onPowerMenuAction: (command: PowerMenuCommand) => void
}

export function useTopStatusController({
  screenShellRef,
  activeScreen,
  currentPrinterNotificationId,
  isBusy,
  executeCommand,
  getCommandBlockReason,
  requiresCommandConfirmation,
  transitionPowerCommand,
}: UseTopStatusControllerArgs): UseTopStatusControllerResult {
  const topButtonRefs = useRef<Record<TopStatusButtonId, HTMLButtonElement | null>>({
    wifi: null,
    cloud: null,
    notifications: null,
    power: null,
  })
  const [activeTopPopup, setActiveTopPopup] = useState<TopStatusButtonId | null>(null)
  const [lastReadPrinterNotificationId, setLastReadPrinterNotificationId] = useState<string | null>(null)
  const [armedPowerCommand, setArmedPowerCommand] = useState<PrinterCommandId | null>(null)
  const [topPopupPosition, setTopPopupPosition] = useState<TopPopupPosition | null>(null)
  const hasUnreadPrinterNotification =
    currentPrinterNotificationId !== null &&
    currentPrinterNotificationId !== lastReadPrinterNotificationId
  const powerMenuActions = POWER_MENU_ACTIONS.map((action) => ({
    ...action,
    blockReason: getCommandBlockReason(action.command),
  }))

  const closeTopPopup = useCallback(() => {
    setActiveTopPopup(null)
    setTopPopupPosition(null)
  }, [])

  const readTopPopupPosition = useCallback((id: TopStatusButtonId): TopPopupPosition => {
    const shellElement = screenShellRef.current
    const anchorButton = topButtonRefs.current[id]
    const shellRect = shellElement?.getBoundingClientRect()
    const anchorRect = anchorButton?.getBoundingClientRect()
    const shellWidth = shellRect && shellRect.width > 0 ? shellRect.width : FALLBACK_SCREEN_WIDTH
    const anchorCenterX =
      shellRect && anchorRect && shellRect.width > 0 && anchorRect.width > 0
        ? anchorRect.left - shellRect.left + (anchorRect.width / 2)
        : undefined
    const anchorBottomY =
      shellRect && anchorRect && shellRect.height > 0 && anchorRect.height > 0
        ? anchorRect.bottom - shellRect.top
        : 0

    return resolveTopPopupPosition({
      id,
      shellWidth,
      anchorCenterX,
      anchorBottomY,
    })
  }, [screenShellRef])

  const openTopPopup = useCallback(
    (id: TopStatusButtonId) => {
      if (activeTopPopup === id) {
        closeTopPopup()
        return
      }
      setArmedPowerCommand(null)
      setTopPopupPosition(readTopPopupPosition(id))
      setActiveTopPopup(id)
    },
    [activeTopPopup, closeTopPopup, readTopPopupPosition],
  )

  const setTopButtonRef = useCallback((id: TopStatusButtonId, node: HTMLButtonElement | null): void => {
    topButtonRefs.current[id] = node
  }, [])

  const onPowerMenuAction = useCallback((command: PowerMenuCommand): void => {
    const blockReason = getCommandBlockReason(command)

    if (blockReason !== null) {
      setArmedPowerCommand(null)
      return
    }

    if (requiresCommandConfirmation(command) && armedPowerCommand !== command) {
      setArmedPowerCommand(command)
      return
    }

    void executeCommand({ command }).then(() => {
      setArmedPowerCommand(null)
    })
  }, [armedPowerCommand, executeCommand, getCommandBlockReason, requiresCommandConfirmation])

  useEffect(() => {
    if (transitionPowerCommand !== null) {
      setArmedPowerCommand(null)
    }
  }, [transitionPowerCommand])

  useEffect(() => {
    if (activeScreen !== 'dashboard' && activeTopPopup !== null) {
      closeTopPopup()
    }
  }, [activeScreen, activeTopPopup, closeTopPopup])

  useEffect(() => {
    if (activeTopPopup === 'notifications' && currentPrinterNotificationId !== null) {
      setLastReadPrinterNotificationId(currentPrinterNotificationId)
    }
  }, [activeTopPopup, currentPrinterNotificationId])

  useEffect(() => {
    if (currentPrinterNotificationId === null && lastReadPrinterNotificationId !== null) {
      setLastReadPrinterNotificationId(null)
    }
  }, [currentPrinterNotificationId, lastReadPrinterNotificationId])

  useEffect(() => {
    if (activeTopPopup === null || typeof window === 'undefined') {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTopPopup()
      }
    }

    const handleResize = () => {
      setTopPopupPosition(readTopPopupPosition(activeTopPopup))
    }

    window.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', handleResize)
    }
  }, [activeTopPopup, closeTopPopup, readTopPopupPosition])

  return {
    activeTopPopup,
    topPopupPosition,
    powerMenuActions,
    armedPowerCommand,
    hasUnreadPrinterNotification,
    openTopPopup,
    closeTopPopup,
    setTopButtonRef,
    onPowerMenuAction: isBusy || transitionPowerCommand !== null ? () => undefined : onPowerMenuAction,
  }
}
