import type { CSSProperties } from 'react'
import type { PrinterCommandId } from '../core/commands'
import type { TopStatusButtonId } from '../dashboard/config'
import type { PrinterDisplayNotification } from '../dashboard/printerStatusState'
import {
  CLOUD_LINK_URL,
  CLOUD_QR_IMAGE_URL,
  TOP_BAR_POPUP_TITLES,
  type PowerMenuActionState,
  type PowerMenuCommand,
  type TopPopupPosition,
} from './topStatus'

type TopStatusPopupsProps = {
  activeTopPopup: TopStatusButtonId | null
  topPopupPosition: TopPopupPosition | null
  connectionLabel: string
  wifiSsidLabel: string
  wifiIpLabel: string
  formattedSnapshotTime: string
  cloudStatusLabel: string
  isCloudCapabilityAvailable: boolean
  cloudCapabilityNotice: string
  commandError: string
  currentPrinterNotification: PrinterDisplayNotification | null
  powerMenuActions: PowerMenuActionState[]
  armedPowerCommand: PrinterCommandId | null
  isBusy: boolean
  onClose: () => void
  onOpenWifiSettings: () => void
  onPowerMenuAction: (command: PowerMenuCommand) => void
}

export function TopStatusPopups({
  activeTopPopup,
  topPopupPosition,
  connectionLabel,
  wifiSsidLabel,
  wifiIpLabel,
  formattedSnapshotTime,
  cloudStatusLabel,
  isCloudCapabilityAvailable,
  cloudCapabilityNotice,
  commandError,
  currentPrinterNotification,
  powerMenuActions,
  armedPowerCommand,
  isBusy,
  onClose,
  onOpenWifiSettings,
  onPowerMenuAction,
}: TopStatusPopupsProps) {
  if (activeTopPopup === null) {
    return null
  }

  return (
    <div className="top-popup-layer" role="presentation" onClick={onClose}>
      <section
        className="top-popup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="top-popup-title"
        data-testid={`top-popup-${activeTopPopup}`}
        style={
          topPopupPosition
            ? ({
                top: `${topPopupPosition.top}px`,
                left: `${topPopupPosition.left}px`,
                '--top-popup-arrow-left': `${topPopupPosition.arrowLeft}px`,
              } as CSSProperties)
            : undefined
        }
        onClick={(event) => event.stopPropagation()}
      >
        <header className="top-popup-head">
          <h2 id="top-popup-title">{TOP_BAR_POPUP_TITLES[activeTopPopup]}</h2>
          <button type="button" className="top-popup-close" aria-label="Закрыть окно" onClick={onClose}>
            ×
          </button>
        </header>

        {activeTopPopup === 'wifi' ? (
          <div className="top-popup-content">
            <dl className="top-popup-kv">
              <div>
                <dt>Статус сети</dt>
                <dd>{connectionLabel}</dd>
              </div>
              <div>
                <dt>Wi-Fi сеть</dt>
                <dd>{wifiSsidLabel}</dd>
              </div>
              <div>
                <dt>IP адрес</dt>
                <dd>{wifiIpLabel}</dd>
              </div>
              <div>
                <dt>Время</dt>
                <dd>{formattedSnapshotTime}</dd>
              </div>
            </dl>
            <div className="top-popup-actions">
              <button type="button" className="top-popup-action" onClick={onOpenWifiSettings}>
                Перейти в настройки Wi-Fi
              </button>
            </div>
          </div>
        ) : null}

        {activeTopPopup === 'cloud' ? (
          <div className="top-popup-content">
            <dl className="top-popup-kv">
              <div>
                <dt>Состояние</dt>
                <dd>{cloudStatusLabel}</dd>
              </div>
            </dl>
            {isCloudCapabilityAvailable ? (
              <a
                className="top-popup-qr-link"
                href={CLOUD_LINK_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Открыть treed.pro для добавления устройства"
              >
                <img
                  className="top-popup-qr-image"
                  src={CLOUD_QR_IMAGE_URL}
                  alt="QR-код для перехода на treed.pro"
                />
                <span>Сканируйте QR или откройте treed.pro</span>
              </a>
            ) : (
              <p className="top-popup-secondary">{cloudCapabilityNotice}</p>
            )}
          </div>
        ) : null}

        {activeTopPopup === 'notifications' ? (
          <div className="top-popup-content">
            <p className="top-popup-note">Уведомления принтера:</p>
            <ul className="top-popup-list">
              {commandError ? <li>{commandError}</li> : null}
              {currentPrinterNotification !== null ? (
                <li>
                  <strong>{currentPrinterNotification.title}</strong>
                  {currentPrinterNotification.details ? `: ${currentPrinterNotification.details}` : ''}
                </li>
              ) : null}
              {commandError || currentPrinterNotification !== null ? null : <li>Новых уведомлений нет.</li>}
            </ul>
            <p className="top-popup-secondary">Новые системные уведомления будут добавляться в этот список.</p>
          </div>
        ) : null}

        {activeTopPopup === 'power' ? (
          <div className="top-popup-content">
            <div className="top-popup-actions top-popup-power-actions">
              {powerMenuActions.map((action) => {
                const isActionUnavailable = action.blockReason !== null || isBusy
                const isArmed = !isActionUnavailable && armedPowerCommand === action.command
                const buttonLabel = isArmed ? 'Подтвердить' : action.label

                return (
                  <button
                    key={action.command}
                    type="button"
                    className={[
                      'top-popup-action',
                      action.tone === 'danger' ? 'top-popup-action-danger' : '',
                      isArmed ? 'is-armed' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => onPowerMenuAction(action.command)}
                    disabled={isActionUnavailable}
                    aria-disabled={isActionUnavailable}
                    aria-label={buttonLabel}
                  >
                    {buttonLabel}
                  </button>
                )
              })}
              <button type="button" className="top-popup-action top-popup-action-cancel" onClick={onClose}>
                Отмена
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
