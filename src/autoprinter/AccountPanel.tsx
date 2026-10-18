import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { AutoPrinterController } from '../core/store/useAutoPrinter'
import { useModalFocus } from '../ui'
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

function pairingCodeLabel(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

export function AccountPanel({ controller }: AccountPanelProps) {
  const [isConfirmOpen, setConfirmOpen] = useState(false)
  const dialogRef = useModalFocus<HTMLElement>(isConfirmOpen, () => setConfirmOpen(false))
  const { status, availability, stale, error, pending, pairing } = controller
  const isCurrent = availability === 'available' && !stale && status !== null
  const accountLinkingSupported = status?.capabilities?.account_linking === true
  const accountLinkingAvailable = isCurrent && accountLinkingSupported
  const isOffline = status?.connection === 'offline' || status?.connection === 'disconnected'
  const canPair = accountLinkingAvailable && status.binding_state === 'unpaired'
    && status.capabilities?.pairing !== false && !isOffline && pending === null
  const canUnlink = accountLinkingAvailable
    && (status.binding_state === 'paired' || status.binding_state === 'revoked')
    && status.unlink_pending !== true && pending === null
  const pairingIsFresh = isCurrent && pairing !== null && Date.parse(pairing.expires_at) > Date.now()

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
            {status.enabled === false && <p className="account-notice" role="status">Управление AutoPrinter выключено в системе.</p>}
            {status.configured === false && <p className="account-notice" role="status">AutoPrinter не настроен в системе.</p>}
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
                  <div><span>Аккаунт TreeD</span><strong>{status.owner_profile?.display_name || 'Аккаунт подключён'}</strong></div>
                  <div><span>Принтер</span><strong>{status.display_name || 'Имя принтера не задано'}</strong></div>
                  <p className="account-pending" role="status">Отвязка завершится после окончания текущей работы и восстановления связи с TreeD.</p>
                </div>
              )
            ) : status.binding_state === 'paired' ? (
              <div className="account-details">
                <div>
                  <span>Аккаунт TreeD</span>
                  <strong>{status.owner_profile?.display_name || 'Аккаунт подключён'}</strong>
                </div>
                <div>
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
              <p className="account-notice" role="status">Текущая версия Core не поддерживает привязку аккаунта.</p>
            ) : (
              <div className="account-pairing">
                <div className="account-qr-area">
                  {pairingIsFresh && pairing?.verification_url ? (
                    <div className="account-qr">
                      <QRCodeSVG
                        value={pairing.verification_url}
                        size={208}
                        marginSize={4}
                        level="M"
                        role="img"
                        aria-label="QR-код для привязки аккаунта TreeD"
                        title="Ссылка привязки TreeD. Код действует ограниченное время."
                        bgColor="#ffffff"
                        fgColor="#000000"
                      />
                    </div>
                  ) : (
                    <p>{pairingIsFresh ? 'Core не вернул безопасную ссылку для QR-кода.' : 'Получите временный код, чтобы начать привязку.'}</p>
                  )}
                </div>
                <div className="account-pairing-copy">
                  <h3>Подключите аккаунт</h3>
                  <p>Откройте ссылку QR-кодом или введите код на сайте TreeD. Создание кода не подтверждает привязку.</p>
                  {pairingIsFresh && pairing && (
                    <>
                      <strong className="account-code">{pairingCodeLabel(pairing.code)}</strong>
                      <p className="account-expiry">Код действует до {new Date(pairing.expires_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}.</p>
                    </>
                  )}
                  {isOffline && <p className="account-offline" role="status">TreeD сейчас недоступен. Новый код можно получить после восстановления связи.</p>}
                  <button type="button" disabled={!canPair} onClick={() => void controller.requestPairing()}>
                    {pending?.type === 'pairing' ? 'Получаем код…' : pairingIsFresh ? 'Обновить код' : 'Получить код'}
                  </button>
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
