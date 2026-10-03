import { memo } from 'react'
import { StatusIconButton } from '../ui'
import { TOP_STATUS_BUTTONS, type TopStatusButtonId } from './config'

type DashboardStatusDockProps = {
  activeTopPopup: TopStatusButtonId | null
  hasUnreadPrinterNotification: boolean
  onOpenTopPopup: (id: TopStatusButtonId) => void
  onButtonRef: (id: TopStatusButtonId, node: HTMLButtonElement | null) => void
}

export const DashboardStatusDock = memo(function DashboardStatusDock({
  activeTopPopup,
  hasUnreadPrinterNotification,
  onOpenTopPopup,
  onButtonRef,
}: DashboardStatusDockProps) {
  return (
    <div className="dashboard-status-dock">
      <span className="dashboard-status-logo">TreeD</span>
      <div className="dashboard-status-actions top-icons" aria-label="иконки статуса главной">
        {TOP_STATUS_BUTTONS.map((item) => (
          <StatusIconButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            tone={item.tone}
            showNotificationDot={item.id === 'notifications' ? hasUnreadPrinterNotification : item.showNotificationDot}
            className={activeTopPopup === item.id ? 'is-active' : undefined}
            aria-haspopup="dialog"
            aria-expanded={activeTopPopup === item.id}
            onClick={() => onOpenTopPopup(item.id)}
            ref={(node) => onButtonRef(item.id, node)}
          />
        ))}
      </div>
    </div>
  )
})
