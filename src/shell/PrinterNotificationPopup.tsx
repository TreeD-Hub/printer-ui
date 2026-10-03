import { dismissPrinterNotification, usePrinterNotifications } from '../core/store/printerNotifications'

export function PrinterNotificationPopup({ enabled = true }: { enabled?: boolean }) {
  const { popup } = usePrinterNotifications()
  if (!popup || !enabled) return null
  return (
    <aside className={`printer-event-popup is-${popup.severity}`} role="alertdialog" aria-modal="false"
      aria-labelledby="printer-event-title" aria-describedby="printer-event-details">
      <button type="button" className="printer-event-close" onClick={dismissPrinterNotification}
        aria-label="Закрыть уведомление">×</button>
      <strong id="printer-event-title">{popup.title}</strong>
      <p id="printer-event-details" aria-live="polite">{popup.details}</p>
    </aside>
  )
}
