import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { IconMask } from './IconMask'
import { joinClassNames } from './classNames'
import type { UiIconName } from './iconAssets'

type StatusIconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: UiIconName
  label: string
  tone?: 'default' | 'danger'
  showNotificationDot?: boolean
}

export const StatusIconButton = forwardRef<HTMLButtonElement, StatusIconButtonProps>(function StatusIconButton(
  {
    icon,
    label,
    tone = 'default',
    showNotificationDot = false,
    className,
    ...buttonProps
  },
  ref,
) {
  const isDanger = tone === 'danger'

  return (
    <button
      ref={ref}
      type="button"
      className={joinClassNames(
        'top-icon-btn',
        showNotificationDot && 'notification-btn',
        isDanger && 'power-btn',
        className,
      )}
      aria-label={label}
      {...buttonProps}
    >
      <IconMask
        name={icon}
        size={isDanger ? 20 : 22}
        className={showNotificationDot ? 'notification-icon' : undefined}
      />
    </button>
  )
})

type ActionSquareButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: UiIconName
  label: string
  tone?: 'primary' | 'danger'
}

export function ActionSquareButton({
  icon,
  label,
  tone = 'primary',
  className,
  ...buttonProps
}: ActionSquareButtonProps) {
  const toneClass = tone === 'danger' ? 'action-cancel' : 'action-pause'

  return (
    <button
      type="button"
      className={joinClassNames('stack-action', toneClass, className)}
      aria-label={label}
      {...buttonProps}
    >
      <IconMask name={icon} size={40} className="action-icon" />
    </button>
  )
}

type NavItemButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: UiIconName
  label: string
  active?: boolean
}

export function NavItemButton({
  icon,
  label,
  active = false,
  className,
  ...buttonProps
}: NavItemButtonProps) {
  return (
    <button
      type="button"
      className={joinClassNames('nav-item', active && 'is-active', className)}
      {...buttonProps}
    >
      <span className="nav-icon">
        <IconMask name={icon} size={32} />
      </span>
      <span>{label}</span>
    </button>
  )
}
