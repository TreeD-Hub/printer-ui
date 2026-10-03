import { type CSSProperties, useLayoutEffect, useState } from 'react'
import type { TopStatusButtonId } from '../dashboard/config'
import { dismissPrinterNotification, usePrinterNotifications } from '../core/store/printerNotifications'
import type { TopPopupPosition } from './topStatus'

type PrinterNotificationPopupProps = {
  enabled: boolean
  activeScreen: string
  readTopPopupPosition: (id: TopStatusButtonId) => TopPopupPosition
}

export function PrinterNotificationPopup({ enabled, activeScreen, readTopPopupPosition }: PrinterNotificationPopupProps) {
  const { popup } = usePrinterNotifications()
  const [position, setPosition] = useState<TopPopupPosition | null>(null)
  const popupId = popup?.id

  useLayoutEffect(() => {
    if (!enabled || !popupId) return
    const updatePosition = () => setPosition(readTopPopupPosition('notifications'))
    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [enabled, popupId, activeScreen, readTopPopupPosition])

  if (!popup || !enabled || !position) return null
  return (
    <aside className={`top-popup-dialog printer-event-popup is-${popup.severity}`} role="alertdialog" aria-modal="false"
      aria-labelledby="printer-event-title" aria-describedby="printer-event-details"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        '--top-popup-arrow-left': `${position.arrowLeft}px`,
      } as CSSProperties}>
      <header className="top-popup-head">
        <h2 id="printer-event-title">{popup.title}</h2>
        <button type="button" className="top-popup-close" onClick={dismissPrinterNotification}
          aria-label="Закрыть уведомление">×</button>
      </header>
      <div className="top-popup-content">
        <p id="printer-event-details" aria-live="polite">{popup.details}</p>
      </div>
    </aside>
  )
}
