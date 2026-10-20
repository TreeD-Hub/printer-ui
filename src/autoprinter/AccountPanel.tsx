import { useEffect, useId, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { AutoPrinterController } from '../core/store/useAutoPrinter'
import { useModalFocus } from '../ui'
import { useCurrentTime } from './useCurrentTime'
import './account.css'

type AccountPanelProps = {
  controller: AutoPrinterController
}

function stateLabel(controller: AutoPrinterController): string {
  if (controller.availability === 'loading') return 'Загрузка состояния'
  if (controller.availability === 'unsupported') return 'Не поддерживается'
  if (controller.stale || controller.availability === 'error') return 'Нет свежих данных'
  return 'Состояние обновлено'
}

function AccountOwner({ name, avatar }: { name?: string; avatar?: string | null }) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null)
  const initials = name?.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toLocaleUpperCase() || 'TD'
  return (
    <div className="account-owner">
      <div className="account-avatar">
        {avatar && avatar !== failedAvatar
          ? <img src={avatar} alt={`Аватар ${name || 'аккаунта TreeD'}`} referrerPolicy="no-referrer" onError={() => setFailedAvatar(avatar)} />
          : <span aria-hidden="true">{initials}</span>}
      </div>
      <div className="account-owner-copy">
        <span>Аккаунт TreeD</span>
        <strong>{name || 'Аккаунт подключён'}</strong>
        <span className="account-owner-status">Принтер привязан</span>
      </div>
    </div>
  )
}

export function AccountPanel({ controller }: AccountPanelProps) {
  const qrDotsId = useId()
  const autoPairingRequested = useRef(false)
  const [isConfirmOpen, setConfirmOpen] = useState(false)
  const now = useCurrentTime(controller.pairing?.expires_at != null)
  const dialogRef = useModalFocus<HTMLElement>(isConfirmOpen, () => setConfirmOpen(false))
  const { status, availability, stale, error, pending, pairing } = controller
  const isCurrent = availability === 'available' && !stale && status !== null
  const accountLinkingSupported = status?.capabilities?.account_linking === true
  const accountLinkingAvailable = isCurrent && accountLinkingSupported
  const isOffline = status?.connection === 'offline' || status?.connection === 'disconnected'
  const hasPairing = pairing !== null && (pairing.expires_at === null || Date.parse(pairing.expires_at) > now)
  const canPair = accountLinkingAvailable && status.binding_state === 'unpaired'
    && status.enabled !== false && status.configured !== false && status.unlink_pending !== true
    && status.capabilities?.pairing !== false && !isOffline && pending === null && !hasPairing
  const canUnlink = accountLinkingAvailable
    && (status.binding_state === 'paired' || status.binding_state === 'revoked')
    && status.unlink_pending !== true && pending === null
  const pairingIsFresh = isCurrent && hasPairing
  const canCancelPairing = accountLinkingAvailable && status.binding_state === 'unpaired'
    && status.capabilities?.pairing_cancel === true && !isOffline && pending === null

  useEffect(() => {
    if (pairing !== null) autoPairingRequested.current = true
    if (!canPair || autoPairingRequested.current) return
    autoPairingRequested.current = true
    void controller.requestPairing()
  }, [canPair, pairing, controller.requestPairing])

  return (
    <section className="account-panel" aria-labelledby="account-title" data-testid="account-panel">
      <header className="account-head">
        <div>
          <h2 id="account-title">Аккаунт</h2>
          <p>Связь принтера с аккаунтом TreeD.</p>
        </div>
        <span>{stateLabel(controller)}</span>
      </header>

      <main className="account-content">
        {availability === 'unsupported' ? (
          <p className="account-notice" role="status">Эта версия Core не поддерживает привязку аккаунта.</p>
        ) : status === null ? (
          <p className="account-notice" role={error ? 'alert' : 'status'}>{error ?? 'Получаем состояние аккаунта.'}</p>
        ) : (
          <>
            {stale && <p className="account-notice" role="status">Показано последнее известное состояние. Для действий нужно обновить связь с Moonraker.</p>}
            {error && <p className="account-notice account-error" role="alert">{error}</p>}
            {status.enabled === false ? <p className="account-notice" role="status">Подключение к аккаунту выключено в настройках принтера.</p>
              : status.configured === false && <p className="account-notice" role="status">Подключение к аккаунту ещё не настроено.</p>}
            {status.unlink_pending === true ? (
              status.binding_state === 'unpaired' ? (
                <p className="account-pending" role="status">Проверяем состояние отвязки.</p>
              ) : status.binding_state === 'revoked' ? (
                <div className="account-details">
                  <div><span>Состояние</span><strong>Доступ отозван</strong></div>
                  <p className="account-pending" role="status">Сброс ожидает завершения текущей работы и связи с TreeD.</p>
                </div>
              ) : (
                <div className="account-details">
                  <AccountOwner name={status.owner_profile?.display_name} avatar={status.owner_profile?.avatar_url} />
                  <div><span>Принтер</span><strong>{status.display_name || 'Имя принтера не задано'}</strong></div>
                  <p className="account-pending" role="status">Отвязка завершится после окончания текущей работы и восстановления связи с TreeD.</p>
                </div>
              )
            ) : status.binding_state === 'paired' ? (
              <div className="account-details">
                <AccountOwner name={status.owner_profile?.display_name} avatar={status.owner_profile?.avatar_url} />
                <div className="account-printer">
                  <span>Принтер</span>
                  <strong>{status.display_name || 'Имя принтера не задано'}</strong>
                </div>
                {pending?.type === 'account_unlink' ? <p className="account-pending" role="status">Сохраняем запрос на отвязку…</p> : accountLinkingSupported ? (
                  <button className="account-danger" type="button" disabled={!canUnlink} onClick={() => setConfirmOpen(true)}>Отвязать</button>
                ) : <p className="account-offline" role="status">Управление привязкой недоступно в этой версии Core.</p>}
                {isOffline && <p className="account-offline" role="status">TreeD сейчас недоступен. Запрос сохранится локально и завершится после восстановления связи.</p>}
              </div>
            ) : status.binding_state === 'revoked' ? (
              <div className="account-details">
                <div>
                  <span>Состояние</span>
                  <strong>Доступ к аккаунту отозван</strong>
                  <p>Профиль скрыт. Можно сбросить локальную привязку, если Core ещё хранит действительные учётные данные устройства.</p>
                </div>
                {pending?.type === 'account_unlink' ? <p className="account-pending" role="status">Сохраняем запрос на сброс…</p> : accountLinkingSupported ? (
                  <button className="account-danger" type="button" disabled={!canUnlink} onClick={() => setConfirmOpen(true)}>Сбросить привязку</button>
                ) : <p className="account-offline" role="status">Сброс недоступен в этой версии Core.</p>}
                {isOffline && <p className="account-offline" role="status">TreeD сейчас недоступен. Запрос сохранится локально и завершится после восстановления связи.</p>}
              </div>
            ) : !accountLinkingSupported ? (
              status.enabled !== false && status.configured !== false
                && <p className="account-notice" role="status">Текущая версия Core не поддерживает привязку аккаунта.</p>
            ) : (
              <div className="account-pairing">
                <div className="account-qr-area">
                  {pairingIsFresh && pairing?.verification_url ? (
                    <div className="account-qr">
                      <svg width={280} height={280} role="img" aria-label="QR-код для привязки аккаунта TreeD">
                        <title>Ссылка для привязки принтера к аккаунту TreeD.</title>
                        <defs>
                          <pattern id={qrDotsId} width={1} height={1} patternUnits="userSpaceOnUse">
                            <circle cx={0.5} cy={0.5} r={0.47} fill="#000000" shapeRendering="geometricPrecision" />
                          </pattern>
                        </defs>
                        <QRCodeSVG
                          value={pairing.verification_url}
                          size={280}
                          marginSize={4}
                          level="H"
                          role="presentation"
                          aria-hidden="true"
                          bgColor="#ffffff"
                          fgColor={`url(#${qrDotsId})`}
                        />
                      </svg>
                    </div>
                  ) : (
                    <p role="status">{pairingIsFresh ? 'Не удалось получить ссылку для QR-кода.' : pending?.type === 'pairing' ? 'Получаем QR-код…' : 'Код привязки не создан.'}</p>
                  )}
                </div>
                <div className="account-pairing-copy">
                  <h3>Подключите аккаунт</h3>
                  <p>Сканируйте QR-код или введите код на сайте TreeD. Подтвердите привязку в аккаунте.</p>
                  {pairingIsFresh && pairing && (
                    <>
                      <strong className="account-code">{pairing.code}</strong>
                      {pairing.expires_at !== null && <p className="account-expiry">Код действует до {new Date(pairing.expires_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}.</p>}
                    </>
                  )}
                  {isOffline && <p className="account-offline" role="status">TreeD сейчас недоступен. Новый код можно получить после восстановления связи.</p>}
                  {hasPairing ? (
                    status.capabilities?.pairing_cancel === true && <button type="button" disabled={!canCancelPairing} onClick={() => void controller.cancelPairing()}>
                      {pending?.type === 'pairing_cancel' ? 'Отменяем…' : 'Отменить привязку'}
                    </button>
                  ) : <button type="button" disabled={!canPair} onClick={() => void controller.requestPairing()}>
                    {pending?.type === 'pairing' ? 'Получаем код…' : 'Получить код'}
                  </button>}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {isConfirmOpen && (
        <div className="account-dialog-layer" role="presentation" onClick={() => setConfirmOpen(false)}>
          <section ref={dialogRef} className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-unlink-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="account-unlink-title">Отвязать принтер?</h3>
            <p>Новые задания будут заблокированы. Отвязка завершится после текущей работы и связи с TreeD. История и файлы сохранятся.</p>
            <div className="account-dialog-actions">
              <button type="button" data-modal-initial-focus onClick={() => setConfirmOpen(false)}>Назад</button>
              <button className="account-danger" type="button" onClick={() => { setConfirmOpen(false); void controller.requestUnlink() }}>Отвязать</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
