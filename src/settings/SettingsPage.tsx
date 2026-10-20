import { useState, type ChangeEvent, type RefObject } from 'react'
import {
  SettingsInfoCard,
  SettingsSelectField,
  SettingsSidebarMenu,
  SettingsToggleRow,
  useModalFocus,
} from '../ui'
import {
  DEVICE_INFO_LINES,
  LANGUAGE_OPTIONS,
  SETTINGS_GROUP_OPTIONS,
  SLEEP_MODE_OPTIONS,
  TIMEZONE_OPTIONS,
  type SettingsGroupId,
  type SettingsNotificationItem,
  type WifiNetworkItem,
  type WifiNetworkSecurity,
} from './config'
import type { UpdateReleaseResult } from './updateReleaseClient'
import type { HostConfigConflict, HostUpdateOperation, HostUpdateTargetId } from '../core/hostUpdate'
import type { AutoPrinterController } from '../core/store/useAutoPrinter'
import { AutoPrinterPanel } from '../autoprinter/AutoPrinterPanel'
import { AccountPanel } from '../autoprinter/AccountPanel'
import '../autoprinter/autoprinter.css'
import type { DetectionFrame, DetectionStatus } from '../core/hostDetection'

export type ConsoleHistoryItem = {
  id: string
  command: string
  createdAt: string
  kind: 'command' | 'response' | 'error'
}

export type SettingsPageProps = {
  autoPrinter?: {
    controller: AutoPrinterController
    moonrakerConnected: boolean
    onOpenDashboard: () => void
  }
  activeSettingsGroup: SettingsGroupId
  onSettingsGroupChange: (nextGroup: SettingsGroupId) => void
  system: {
    contractStatus: string
    runtimeStatus: string
    onExportDiagnostics: () => void
    factoryReset: {
      canReset: boolean
      isResetting: boolean
      notice: string
      onReset: () => Promise<void>
    }
  }
  interfaceSettings: {
    isDarkThemeEnabled: boolean
    isMaxPerformanceModeEnabled: boolean
    sleepModeValue: string
    timezoneValue: string
    onDarkThemeChange: (checked: boolean) => void
    onMaxPerformanceModeChange: (checked: boolean) => void
    onSleepModeChange: (value: string) => void
    onTimezoneChange: (value: string) => void
  }
  network: {
    isCapabilityAvailable: boolean
    isBusy: boolean
    searchInputRef: RefObject<HTMLInputElement | null>
    passwordInputRef: RefObject<HTMLInputElement | null>
    searchQuery: string
    selectedWifiNetworkId: string | null
    selectedWifiNetwork: WifiNetworkItem | null
    filteredWifiNetworks: WifiNetworkItem[]
    passwordValue: string
    isPasswordVisible: boolean
    currentSsid: string | null
    wifiIpLabel: string
    connectedWifiNetwork: WifiNetworkItem | null
    connectionLabel: string
    notice: string
    capabilityNotice: string
    onSearchQueryChange: (event: ChangeEvent<HTMLInputElement>) => void
    onSearchInputFocus: () => void
    onScan: () => void
    onNetworkSelect: (networkId: string) => void
    onPasswordChange: (event: ChangeEvent<HTMLInputElement>) => void
    onPasswordInputFocus: () => void
    onPasswordVisibilityToggle: () => void
    onConnect: () => void
    onForgetSelected: () => void
  }
  notifications: {
    isNotificationsEnabled: boolean
    isNotificationSoundsEnabled: boolean
    history: SettingsNotificationItem[]
    onNotificationsEnabledChange: (checked: boolean) => void
    onNotificationSoundsEnabledChange: (checked: boolean) => void
  }
  cloud: {
    isCapabilityAvailable: boolean
    isConnected: boolean
    isAiMonitoringEnabled: boolean
    isBusy: boolean
    notice: string
    onAiMonitoringToggle: (checked: boolean) => void
    detectionStatus: DetectionStatus | null
    detectionStatusError: string | null
    detectionFrame: DetectionFrame | null
    isDetectionFrameBusy: boolean
    onShowDetectionFrame: () => void
  }
  updates: {
    configConflicts: HostConfigConflict[]
    selectedConfigResets: HostConfigConflict[]
    isConfigReviewOpen: boolean
    onToggleConfigReset: (conflict: HostConfigConflict) => void
    onCancelConfigReview: () => void
    onConfirmConfigReview: () => Promise<void>
    releaseResults: UpdateReleaseResult[]
    isCheckingUpdates: boolean
    applyingUpdateTarget: HostUpdateTargetId | null
    isApplyBlockedByActivePrint: boolean
    isCapabilityAvailable: boolean
    notice: string
    operation: HostUpdateOperation | null
    isReconnectPending: boolean
    onDismissOperation: () => void
    onCheckUpdates: () => void
    onApplyUpdate: () => void
    pausedUpdateTarget: HostUpdateTargetId | null
    onCancelPausedUpdate: () => void
    onConfirmPausedUpdate: () => Promise<void>
  }
  language: {
    languageValue: string
    isExternalVoiceEnabled: boolean
    onLanguageChange: (value: string) => void
    onExternalVoiceChange: (checked: boolean) => void
  }
  console: {
    inputRef: RefObject<HTMLTextAreaElement | null>
    commandValue: string
    notice: string
    history: ConsoleHistoryItem[]
    onInputChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
    onKeyboardOpen: () => void
    onSubmit: () => void
    onQuickCommandInsert: (command: string) => void
  }
}

function wifiSecurityLabel(security: WifiNetworkSecurity): string {
  if (security === 'open') {
    return 'Открытая'
  }

  return security.toUpperCase()
}

function NetworkSettings({ network }: { network: SettingsPageProps['network'] }) {
  const [openedNetworkId, setOpenedNetworkId] = useState<string | null>(null)
  const selected = network.isCapabilityAvailable && network.selectedWifiNetwork?.id === openedNetworkId
    ? network.selectedWifiNetwork
    : null

  return (
    <div className="settings-group-stack settings-group-stack-network">
      <header className="settings-network-header">
        <div className="settings-group-head">
          <h3>Сеть</h3>
          {network.isCapabilityAvailable && !selected && (
            <p>{network.currentSsid
              ? `${network.currentSsid} · IP ${network.wifiIpLabel}`
              : 'Wi-Fi не подключён'}</p>
          )}
        </div>
        {network.isCapabilityAvailable && (
          selected ? (
            <button type="button" className="settings-network-btn"
              onClick={() => setOpenedNetworkId(null)} disabled={network.isBusy}>
              К списку сетей
            </button>
          ) : (
            <button type="button" className="settings-network-btn"
              onClick={network.onScan} data-testid="settings-network-scan" disabled={network.isBusy}>
              {network.isBusy ? 'Поиск…' : 'Обновить'}
            </button>
          )
        )}
      </header>

      {!network.isCapabilityAvailable ? (
        <div className="settings-network-empty" role="status">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 18a29 29 0 0 1 38 0M11 25a20 20 0 0 1 26 0M18 32a9 9 0 0 1 12 0M7 7l34 34" />
            <circle cx="24" cy="39" r="1" fill="currentColor" />
          </svg>
          <p className="settings-network-empty-title" data-testid="settings-network-notice">{network.capabilityNotice}</p>
        </div>
      ) : selected ? (
        <div className="settings-network-details">
          <div className="settings-network-selected">
            <h4>{selected.ssid}</h4>
            <p>{selected.connected
              ? `Подключено · IP ${network.wifiIpLabel}`
              : `${wifiSecurityLabel(selected.security)} · Сигнал ${selected.signalPercent}%`}</p>
          </div>
          {!selected.connected && (
            selected.security !== 'open' ? (
              <div className="settings-network-password-field">
                <label htmlFor="settings-wifi-password">Пароль сети</label>
                <div className="settings-network-password-control">
                  <input id="settings-wifi-password" ref={network.passwordInputRef}
                    type={network.isPasswordVisible ? 'text' : 'password'}
                    value={network.passwordValue} onChange={network.onPasswordChange}
                    onClick={network.onPasswordInputFocus}
                    placeholder="Не менее 8 символов" autoComplete="off"
                    data-testid="settings-network-password-input" disabled={network.isBusy} />
                  <button type="button" className="settings-network-btn"
                    onClick={network.onPasswordVisibilityToggle} aria-pressed={network.isPasswordVisible}
                    data-testid="settings-network-password-visibility" disabled={network.isBusy}>
                    {network.isPasswordVisible ? 'Скрыть' : 'Показать'}
                  </button>
                </div>
              </div>
            ) : <p className="settings-network-open-note">Открытая сеть — пароль не нужен.</p>
          )}
          <div className="settings-network-actions">
            {!selected.connected && (
              <button type="button" className="settings-network-btn settings-network-btn-primary"
                onClick={network.onConnect} data-testid="settings-network-connect-button" disabled={network.isBusy}>
                Подключить
              </button>
            )}
            {(selected.saved || selected.connected) && (
              <button type="button" className="settings-network-btn"
                onClick={network.onForgetSelected} data-testid="settings-network-forget-button" disabled={network.isBusy}>
                Забыть сеть
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="settings-network-list" role="group" aria-label="Список Wi-Fi сетей" aria-busy={network.isBusy}>
            {network.filteredWifiNetworks.length > 0 ? network.filteredWifiNetworks.map((item) => (
              <button key={item.id} type="button"
                className={`settings-network-item${item.connected ? ' is-active' : ''}`}
                onClick={() => { network.onNetworkSelect(item.id); setOpenedNetworkId(item.id) }}
                data-testid={`settings-network-item-${item.id}`} disabled={network.isBusy}>
                <span className="settings-network-item-copy">
                  <strong>{item.ssid}</strong>
                  <span>{item.connected ? 'Подключено' : item.saved ? 'Сохранена' : wifiSecurityLabel(item.security)}</span>
                </span>
                <span className="settings-network-item-meta">
                  <span aria-label={`Сигнал ${item.signalPercent}%`}>{item.signalPercent}%</span>
                  <span aria-hidden="true">›</span>
                </span>
              </button>
            )) : (
              <div className="settings-network-empty">
                <p className="settings-network-empty-title">{network.isBusy ? 'Ищем сети…' : 'Сети не найдены'}</p>
                {!network.isBusy && <p>Нажмите «Обновить» для поиска.</p>}
              </div>
            )}
          </div>
        </>
      )}
      {network.isCapabilityAvailable && network.notice && (
        <p className="settings-network-notice" role="status" data-testid="settings-network-notice">{network.notice}</p>
      )}
    </div>
  )
}

function updateReleaseStatusLabel(release: UpdateReleaseResult): string {
  if (release.status === 'error') {
    return 'Не удалось проверить'
  }

  if (release.status === 'latest') {
    return 'Актуальная версия'
  }

  if (release.canApply === true) {
    return 'Доступно обновление'
  }

  if (release.canApply === false) {
    return 'Обновление недоступно'
  }

  return 'Нужно проверить обновления'
}

function updateVersionLabel(version: string | null): string {
  if (!version || version === 'unknown') return '—'
  return version.replace(/^ui-main-(\d+)-(\d+)$/, '0.$1.$2').replace(/^v(?=\d)/, '')
}

export function SettingsPage({
  activeSettingsGroup,
  onSettingsGroupChange,
  system,
  interfaceSettings,
  network,
  notifications,
  cloud,
  updates,
  language,
  console,
  autoPrinter,
}: SettingsPageProps) {
  const pausedUpdateFocusRef = useModalFocus<HTMLElement>(updates.pausedUpdateTarget !== null, updates.onCancelPausedUpdate)
  const configReviewFocusRef = useModalFocus<HTMLElement>(updates.isConfigReviewOpen, updates.onCancelConfigReview)
  return (
    <section className="settings-screen" data-testid="screen-settings">
      <div className="settings-layout">
        <aside className="settings-menu-shell">
          <SettingsSidebarMenu
            options={SETTINGS_GROUP_OPTIONS}
            value={activeSettingsGroup}
            onChange={onSettingsGroupChange}
            ariaLabel="Группы настроек"
            testIdPrefix="settings-group"
            iconSize={28}
          />
        </aside>

        <div className="settings-content-shell">
          {activeSettingsGroup === 'system' ? (
            <div className="settings-group-stack">
              <header className="settings-group-head">
                <h3>Система</h3>
                <p>Состояние контроллера и хост-системы.</p>
              </header>

              <div className="settings-system-list">
                <SettingsInfoCard
                  title="mcu"
                  subtitle="stm32f446xx"
                  details={[
                    'Версия: 1.7.7-1-gd825857',
                    'Загрузка: 0.00, Время активности: 0.00',
                    'Частота: 180 MHz',
                  ]}
                  loadPercent={0}
                />
                <SettingsInfoCard
                  title="Host"
                  subtitle="armv7l"
                  details={[
                    'Версия: ?',
                    'ОС: Raspbian GNU/Linux 10 (buster)',
                    'Загрузка: 1.52, Память: 414.4 / 636.6 MB',
                    'Температура: 52°C',
                  ]}
                  loadPercent={38}
                />
              </div>
              <div className="settings-network-notice" role="status">
                <p>{system.contractStatus}</p>
                <p>{system.runtimeStatus}</p>
                <button
                  type="button"
                  className="settings-network-btn"
                  onClick={system.onExportDiagnostics}
                >
                  Экспорт диагностики
                </button>
              </div>
            </div>
          ) : activeSettingsGroup === 'interface' ? (
            <div className="settings-group-stack settings-group-stack-interface">
              <header className="settings-group-head">
                <h3>Интерфейс</h3>
                <p>Базовые параметры отображения и поведения экрана.</p>
              </header>

              <SettingsToggleRow
                label="Включить темную тему"
                checked={interfaceSettings.isDarkThemeEnabled}
                onChange={interfaceSettings.onDarkThemeChange}
                testId="settings-dark-theme-toggle"
              />
              <SettingsToggleRow
                label="Режим максимальной производительности"
                checked={interfaceSettings.isMaxPerformanceModeEnabled}
                onChange={interfaceSettings.onMaxPerformanceModeChange}
                testId="settings-max-performance-toggle"
              />
              <SettingsSelectField
                label="Спящий режим"
                value={interfaceSettings.sleepModeValue}
                options={SLEEP_MODE_OPTIONS}
                onChange={interfaceSettings.onSleepModeChange}
              />
              <SettingsSelectField
                label="Временная зона UTC"
                value={interfaceSettings.timezoneValue}
                options={TIMEZONE_OPTIONS}
                onChange={interfaceSettings.onTimezoneChange}
              />
            </div>
          ) : activeSettingsGroup === 'network' ? (
            <NetworkSettings key={String(network.isCapabilityAvailable)} network={network} />
          ) : activeSettingsGroup === 'notifications' ? (
            <div className="settings-group-stack settings-group-stack-notifications">
              <header className="settings-group-head">
                <h3>Уведомления</h3>
              </header>
              <SettingsToggleRow
                label="Всплывающие уведомления"
                checked={notifications.isNotificationsEnabled}
                onChange={notifications.onNotificationsEnabledChange}
                testId="settings-notifications-enabled-toggle"
              />
              <SettingsToggleRow
                label="Звуки уведомлений"
                checked={notifications.isNotificationSoundsEnabled}
                onChange={notifications.onNotificationSoundsEnabledChange}
                testId="settings-notification-sound-toggle"
              />
              <h3 className="settings-notification-heading" id="settings-notification-history-title">Журнал событий</h3>
              <div className="settings-notification-list" role="region" aria-labelledby="settings-notification-history-title">
                {notifications.history.length === 0 ? <p className="settings-notification-empty" role="status">Событий в текущем сеансе пока нет.</p> : null}
                {notifications.history.map((item) => (
                  <article className="settings-notification-item" key={item.id}>
                    <p className="settings-notification-title">
                      <strong>{item.title}</strong>
                      <span>{item.createdAt}</span>
                    </p>
                    <p className="settings-notification-details">{item.details}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : activeSettingsGroup === 'autoprinter' ? (
            autoPrinter ? (
              <AutoPrinterPanel {...autoPrinter} />
            ) : (
              <div className="settings-group-stack" role="status">Состояние AutoPrinter недоступно.</div>
            )
          ) : activeSettingsGroup === 'account' ? (
            autoPrinter ? (
              <AccountPanel controller={autoPrinter.controller} />
            ) : (
              <div className="settings-group-stack" role="status">Состояние аккаунта недоступно.</div>
            )
          ) : activeSettingsGroup === 'cloud' ? (
            <div className="settings-group-stack settings-group-stack-cloud">
              <header className="settings-group-head">
                <h3>Локальный анализ</h3>
                <p>Анализ кадров выполняется на принтере. При подтверждённой ошибке текущая печать ставится на паузу.</p>
              </header>
              <SettingsToggleRow
                label="Контроль ошибок печати"
                checked={cloud.isAiMonitoringEnabled}
                onChange={cloud.onAiMonitoringToggle}
                testId="settings-cloud-ai-toggle"
                disabled={!cloud.isCapabilityAvailable || cloud.isBusy}
              />
              <h3 className="settings-cloud-heading">Состояние анализа</h3>
              <article className="settings-description-card">
                <p><span>Настройка принтера</span><strong>{cloud.isConnected ? 'Доступна' : 'Недоступна'}</strong></p>
                <p><span>Анализ кадров</span><strong>{cloud.detectionStatus?.analysis_state === 'available' ? 'Работает' : cloud.detectionStatus?.analysis_state === 'idle' ? 'Ожидает печать' : 'Недоступен'}</strong></p>
                {cloud.detectionStatus && <p><span>Подтверждения</span><strong>{cloud.detectionStatus.counter} / {cloud.detectionStatus.threshold}</strong></p>}
                <p><span>Пауза печати</span><strong>{cloud.detectionStatus?.pause_state === 'confirmed' ? 'Подтверждена' : cloud.detectionStatus?.pause_state === 'requested' ? 'Ожидает подтверждения' : cloud.detectionStatus?.pause_state === 'failed' ? 'Не подтверждена' : 'Не запрошена'}</strong></p>
                {cloud.detectionStatus?.pause_error && <p role="alert"><span>Причина</span><strong>{cloud.detectionStatus.pause_error}</strong></p>}
                {cloud.detectionStatus?.model_version && <p><span>Модель</span><strong>{cloud.detectionStatus.model_version}</strong></p>}
              </article>
              <p className="settings-cloud-notice" role={cloud.detectionStatusError ? 'alert' : 'status'}>{cloud.detectionStatusError ?? cloud.notice}</p>
              {cloud.detectionStatus?.recent_frame && (
                <div className="settings-detection-frame">
                  <button type="button" className="settings-network-btn"
                    onClick={cloud.onShowDetectionFrame} disabled={cloud.isDetectionFrameBusy}
                    data-testid="settings-detection-frame-button">
                    {cloud.isDetectionFrameBusy ? 'Получаем кадр…' : 'Показать последний кадр'}
                  </button>
                  {cloud.detectionFrame && <figure>
                    <img src={`data:image/jpeg;base64,${cloud.detectionFrame.jpeg_base64}`} alt={`Кадр анализатора: ${cloud.detectionFrame.verdict}`} />
                    <figcaption>{cloud.detectionFrame.verdict} · {cloud.detectionFrame.captured_at}</figcaption>
                  </figure>}
                </div>
              )}
            </div>
          ) : activeSettingsGroup === 'device' ? (
            <div className="settings-group-stack settings-group-stack-device">
              <header className="settings-group-head">
                <h3>Об устройстве</h3>
              </header>
              <article className="settings-description-card">
                {DEVICE_INFO_LINES.map(([label, value]) => (
                  <p key={label}><span>{label}</span><strong>{value}</strong></p>
                ))}
              </article>
              <h3 className="settings-device-heading" id="settings-device-care-title">Эксплуатация и утилизация</h3>
              <section className="settings-device-care" aria-labelledby="settings-device-care-title">
                <article className="settings-device-care-item">
                  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 16h24l-3 34H25l-4-34ZM18 16h30M28 16v-5h11v5M25 50v5M42 50v5" />
                    <circle cx="40" cy="53" r="3" />
                    <path d="M12 8l43 49M53 8 12 57" />
                  </svg>
                  <div><h4>Раздельный сбор</h4><p>Не выбрасывайте с бытовым мусором. Сдайте устройство в пункт приёма электроники.</p></div>
                </article>
                <article className="settings-device-care-item">
                  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M32 18c-7-6-16-7-25-4v35c9-3 18-2 25 4 7-6 16-7 25-4V14c-9-3-18-2-25 4ZM32 18v35M14 23c4-1 8 0 12 2M14 31c4-1 8 0 12 2M38 25c4-2 8-3 12-2M38 33c4-2 8-3 12-2" />
                  </svg>
                  <div><h4>Руководство</h4><p>Перед использованием и обслуживанием прочитайте руководство по эксплуатации.</p></div>
                </article>
              </section>
            </div>
          ) : activeSettingsGroup === 'updates' ? (
            <div className="settings-group-stack settings-updates">
              <header className="settings-group-head">
                <h3>Обновления</h3>
              </header>
              <div className="settings-updates-versions" aria-live="polite">
                {updates.releaseResults.map((release) => (
                  <article key={release.id} className="settings-update-component" aria-label={release.label}>
                    <header>
                      <span className="settings-update-code">{release.id === 'printer-ui' ? 'UI' : 'CORE'}</span>
                      <h4>{release.label}</h4>
                    </header>
                    <div className="settings-update-body">
                      <div className={`settings-update-versions${release.status === 'available' ? ' has-update' : ' is-current'}`}>
                        <div><span>Установлено</span><strong>{updateVersionLabel(release.currentVersion)}</strong></div>
                        {release.status === 'available' ? (
                          <>
                            <svg className="settings-update-arrow" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="M4 16h23M18 7l9 9-9 9" />
                            </svg>
                            <div className="settings-update-next"><span>Новая версия</span><strong>{updates.isCheckingUpdates ? '…' : updateVersionLabel(release.latestVersion)}</strong></div>
                          </>
                        ) : release.status === 'latest' && !updates.isCheckingUpdates ? (
                          <svg className="settings-update-check" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <circle cx="16" cy="16" r="13" />
                            <path d="m9 16 5 5 9-10" />
                          </svg>
                        ) : null}
                      </div>
                      <p className={`settings-update-status${release.canApply === true ? ' is-available' : ''}`}>
                        {updates.isCheckingUpdates ? 'Проверяем версии…' : updateReleaseStatusLabel(release)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
              <div className="settings-updates-actions">
                <button
                  type="button"
                  className="settings-network-btn"
                  onClick={updates.onCheckUpdates}
                  data-testid="settings-check-updates-button"
                  disabled={updates.isCheckingUpdates || updates.applyingUpdateTarget !== null || !updates.isCapabilityAvailable ||
                    (updates.operation !== null && !['applied', 'error', 'rolled_back', 'rejected'].includes(updates.operation.status))}
                >
                  {updates.isCheckingUpdates ? 'Проверка...' : 'Проверить обновления'}
                </button>
                {updates.releaseResults.some((release) => release.status === 'available' && release.canApply === true && release.latestTag !== null) && (
                    <button
                      type="button"
                      className="settings-network-btn settings-update-apply"
                      onClick={updates.onApplyUpdate}
                      data-testid="settings-apply-updates-button"
                      disabled={
                        updates.isCheckingUpdates ||
                        system.factoryReset.isResetting ||
                        updates.applyingUpdateTarget !== null ||
                        (updates.operation !== null && !['applied', 'error', 'rolled_back', 'rejected'].includes(updates.operation.status)) ||
                        updates.isApplyBlockedByActivePrint
                      }
                    >
                      {updates.applyingUpdateTarget !== null
                        ? 'Запуск...'
                        : 'Обновить'}
                    </button>
                  )}
              </div>
              <p className="settings-updates-notice" role="status">
                {updates.notice || (updates.isApplyBlockedByActivePrint
                  ? 'Обновление будет доступно после завершения печати.'
                  : updates.releaseResults.length > 0 && updates.releaseResults.every((release) => release.status === 'latest') && !updates.isCheckingUpdates
                  ? 'Установлены последние версии системы и интерфейса.'
                  : 'Обновятся только компоненты, для которых доступна новая версия.')}
              </p>
            </div>
          ) : activeSettingsGroup === 'language' ? (
            <div className="settings-group-stack settings-group-stack-language">
              <SettingsSelectField
                label="Язык интерфейса"
                value={language.languageValue}
                options={LANGUAGE_OPTIONS}
                onChange={language.onLanguageChange}
              />
              <SettingsToggleRow
                label="Внешний голосовой ассистент"
                checked={language.isExternalVoiceEnabled}
                onChange={language.onExternalVoiceChange}
                testId="settings-external-voice-toggle"
              />
            </div>
          ) : (
            <div className="settings-group-stack settings-group-stack-console">
              <header className="settings-group-head">
                <h3>Консоль</h3>
              </header>

              <div className="settings-console-compose">
                <textarea
                  ref={console.inputRef}
                  className="settings-console-input"
                  value={console.commandValue}
                  onChange={console.onInputChange}
                  onFocus={console.onKeyboardOpen}
                  aria-label="Команда"
                  placeholder="Введите G-code или макрос"
                  spellCheck={false}
                  data-testid="settings-console-input"
                />
                <button
                  type="button"
                  className="settings-network-btn settings-network-btn-primary"
                  onClick={console.onSubmit}
                  data-testid="settings-console-send-button"
                >
                  Отправить
                </button>
              </div>

              <p className="settings-console-notice" role="status" data-testid="settings-console-notice">{console.notice}</p>

              <div className="settings-console-history" role="log" aria-label="Команды и ответы принтера" aria-live="polite" tabIndex={-1}>
                {console.history.length > 0 ? (
                  console.history.map((item) => (
                    <article className={`settings-console-history-item is-${item.kind}`} key={item.id}>
                      <time>{item.createdAt}</time>
                      <span className="settings-console-history-marker" aria-label={item.kind === 'command' ? 'Команда' : item.kind === 'error' ? 'Ошибка' : 'Ответ'}>
                        {item.kind === 'command' ? '>' : item.kind === 'error' ? '!' : '<'}
                      </span>
                      <p>{item.command}</p>
                    </article>
                  ))
                ) : (
                  <p className="settings-console-empty">Здесь появятся команды и ответы принтера.<br />Последние записи — сверху.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {updates.isConfigReviewOpen ? (
        <div className="system-reset-layer">
          <section ref={configReviewFocusRef} className="system-reset-dialog settings-update-dialog settings-config-review" role="dialog" aria-modal="true" aria-labelledby="config-review-title" aria-describedby="config-review-detail">
            <h2 id="config-review-title">Локальные изменения конфигов</h2>
            <p id="config-review-detail">Чтобы сохранить нужные настройки, перенесите их в local_overrides.cfg через редактор конфигов, затем выберите сброс исходного файла. Если уже восстановили его вручную — проверьте снова. Сброс вернёт файл к новой версии из репозитория.</p>
            <div className="settings-config-conflicts">
              {updates.configConflicts.map((conflict) => {
                const selected = updates.selectedConfigResets.some((row) => row.path === conflict.path && row.sha256 === conflict.sha256)
                return <div key={conflict.path} className="settings-config-conflict">
                  <code>{conflict.path.replace(/^config\//, '')}</code>
                  <button type="button" className={`file-modal-action${selected ? ' file-modal-action-danger' : ''}`} aria-pressed={selected}
                    aria-label={`${selected ? 'Отменить сброс' : 'Сбросить'} ${conflict.path}`} disabled={updates.isCheckingUpdates}
                    onClick={() => updates.onToggleConfigReset(conflict)}>{selected ? 'Отменить сброс' : 'Сбросить'}</button>
                </div>
              })}
            </div>
            <p aria-live="polite">{updates.notice || 'Сброс выполнится при обновлении. Старые файлы сохранятся в резервной копии. Калибровки SAVE_CONFIG сохраняются.'}</p>
            <div className="system-reset-actions settings-config-review-actions">
              <button type="button" className="file-modal-action" data-modal-initial-focus onClick={updates.onCancelConfigReview}>Назад</button>
              <button type="button" className="file-modal-action" onClick={updates.onCheckUpdates} disabled={updates.isCheckingUpdates}>{updates.isCheckingUpdates ? 'Проверяем…' : 'Проверить снова'}</button>
              <button type="button" className="file-modal-action file-modal-action-danger" onClick={() => void updates.onConfirmConfigReview()}
                disabled={updates.isCheckingUpdates || updates.configConflicts.some((conflict) => !updates.selectedConfigResets.some((row) => row.path === conflict.path && row.sha256 === conflict.sha256))}>
                {updates.configConflicts.length ? 'Сбросить и обновить' : 'Обновить'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {updates.pausedUpdateTarget !== null ? (
        <div className="system-reset-layer">
          <section ref={pausedUpdateFocusRef} className="system-reset-dialog settings-update-dialog" role="dialog" aria-modal="true" aria-labelledby="paused-update-title" aria-describedby="paused-update-detail">
            <h2 id="paused-update-title">Отменить печать и обновить?</h2>
            <p id="paused-update-detail">Печать стоит на паузе. Для обновления она будет отменена; продолжить это задание после обновления не получится.</p>
            <div className="system-reset-actions">
              <button type="button" className="file-modal-action" data-modal-initial-focus onClick={updates.onCancelPausedUpdate}>Назад</button>
              <button type="button" className="file-modal-action file-modal-action-danger" onClick={() => void updates.onConfirmPausedUpdate()}>Отменить и обновить</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
