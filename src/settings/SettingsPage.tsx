import type { ChangeEvent, RefObject } from 'react'
import {
  SettingsInfoCard,
  SettingsSelectField,
  SettingsSidebarMenu,
  SettingsToggleRow,
  useModalFocus,
} from '../ui'
import {
  CONSOLE_QUICK_COMMANDS,
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

export type ConsoleHistoryItem = {
  id: string
  command: string
  createdAt: string
}

export type SettingsPageProps = {
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
            <div className="settings-group-stack">
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
            <div className="settings-group-stack settings-group-stack-network">
              <header className="settings-group-head">
                <h3>Сеть</h3>
                <p>Поиск и подключение к Wi-Fi сети.</p>
              </header>

              <div className="settings-network-layout">
                <section className="settings-network-panel settings-network-panel-list">
                  <div className="settings-network-toolbar">
                    <label className="settings-network-search">
                      <span>Поиск сети</span>
                      <input
                        ref={network.searchInputRef}
                        type="search"
                        value={network.searchQuery}
                        onChange={network.onSearchQueryChange}
                        onFocus={network.isCapabilityAvailable ? network.onSearchInputFocus : undefined}
                        onClick={network.isCapabilityAvailable ? network.onSearchInputFocus : undefined}
                        placeholder="Введите имя сети"
                        data-testid="settings-network-search"
                        disabled={!network.isCapabilityAvailable || network.isBusy}
                      />
                    </label>
                    <button
                      type="button"
                      className="settings-network-btn settings-network-btn-primary"
                      onClick={network.onScan}
                      data-testid="settings-network-scan"
                      disabled={!network.isCapabilityAvailable || network.isBusy}
                    >
                      {network.isBusy ? '...' : 'Поиск'}
                    </button>
                  </div>

                  <div className="settings-network-list" role="listbox" aria-label="Список Wi-Fi сетей">
                    {network.filteredWifiNetworks.length > 0 ? (
                      network.filteredWifiNetworks.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`settings-network-item ${network.selectedWifiNetworkId === item.id ? 'is-active' : ''}`}
                          aria-pressed={network.selectedWifiNetworkId === item.id}
                          onClick={() => network.onNetworkSelect(item.id)}
                          data-testid={`settings-network-item-${item.id}`}
                          disabled={!network.isCapabilityAvailable || network.isBusy}
                        >
                          <div className="settings-network-item-copy">
                            <strong>{item.ssid}</strong>
                            <span>{wifiSecurityLabel(item.security)}</span>
                          </div>
                          <div className="settings-network-item-meta">
                            <span>{item.signalPercent}%</span>
                            {item.connected ? <em>Подключена</em> : item.saved ? <em>Сохранена</em> : null}
                          </div>
                        </button>
                      ))
                    ) : (
                      <p className="settings-network-empty">Сети не найдены.</p>
                    )}
                  </div>
                </section>

                <section className="settings-network-panel settings-network-panel-connect">
                  {network.selectedWifiNetwork !== null ? (
                    <>
                      <div className="settings-network-selected">
                        <p className="settings-network-selected-title">{network.selectedWifiNetwork.ssid}</p>
                        <p className="settings-network-selected-meta">
                          Защита: {wifiSecurityLabel(network.selectedWifiNetwork.security)} • Сигнал: {network.selectedWifiNetwork.signalPercent}%
                        </p>
                      </div>

                      {network.selectedWifiNetwork.security !== 'open' ? (
                        <label className="settings-network-password-field">
                          <span>Пароль</span>
                          <div className="settings-network-password-control">
                            <input
                              ref={network.passwordInputRef}
                              type={network.isPasswordVisible ? 'text' : 'password'}
                              value={network.passwordValue}
                              onChange={network.onPasswordChange}
                              onFocus={network.isCapabilityAvailable ? network.onPasswordInputFocus : undefined}
                              onClick={network.isCapabilityAvailable ? network.onPasswordInputFocus : undefined}
                              placeholder="Введите пароль"
                              data-testid="settings-network-password-input"
                              disabled={!network.isCapabilityAvailable || network.isBusy}
                            />
                            <button
                              type="button"
                              className="settings-network-btn"
                              onClick={network.onPasswordVisibilityToggle}
                              data-testid="settings-network-password-visibility"
                              disabled={!network.isCapabilityAvailable || network.isBusy}
                            >
                              {network.isPasswordVisible ? 'Скрыть' : 'Показать'}
                            </button>
                          </div>
                        </label>
                      ) : (
                        <p className="settings-network-open-note">Сеть открытая, пароль не требуется.</p>
                      )}

                      <div className="settings-network-actions">
                        <button
                          type="button"
                          className="settings-network-btn settings-network-btn-primary"
                          onClick={network.onConnect}
                          data-testid="settings-network-connect-button"
                          disabled={!network.isCapabilityAvailable || network.isBusy}
                        >
                          {network.isBusy ? '...' : 'Подключить'}
                        </button>
                        <button
                          type="button"
                          className="settings-network-btn"
                          onClick={network.onForgetSelected}
                          data-testid="settings-network-forget-button"
                          disabled={!network.isCapabilityAvailable || network.isBusy}
                        >
                          Забыть сеть
                        </button>
                      </div>

                      <article className="settings-description-card settings-network-status-card">
                        <p><span>IP адрес</span><strong>{network.wifiIpLabel}</strong></p>
                        <p>
                          <span>Статус</span>
                          <strong>
                            {network.currentSsid ? 'Подключено' : network.isCapabilityAvailable ? 'Не подключено' : network.connectionLabel}
                          </strong>
                        </p>
                      </article>

                      <p className="settings-network-notice" data-testid="settings-network-notice">
                        {network.isCapabilityAvailable && network.notice.length > 0
                          ? network.notice
                          : network.capabilityNotice}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="settings-network-empty">Выберите сеть слева.</p>
                      <p className="settings-network-notice" data-testid="settings-network-notice">
                        {network.isCapabilityAvailable && network.notice.length > 0
                          ? network.notice
                          : network.capabilityNotice}
                      </p>
                    </>
                  )}
                </section>
              </div>
            </div>
          ) : activeSettingsGroup === 'notifications' ? (
            <div className="settings-group-stack settings-group-stack-notifications">
              <header className="settings-group-head">
                <h3>Уведомления</h3>
                <p>Включение/отключение уведомлений и журнал последних событий.</p>
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
              <div className="settings-notification-list">
                {notifications.history.length === 0 ? <p>Событий в текущем сеансе пока нет.</p> : null}
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
          ) : activeSettingsGroup === 'cloud' ? (
            <div className="settings-group-stack">
              <header className="settings-group-head">
                <h3>Облако</h3>
                <p>AI-детекция спагетти и автоматическая отмена печати.</p>
              </header>
              <SettingsToggleRow
                label="AI контроль ошибок"
                checked={cloud.isAiMonitoringEnabled}
                onChange={cloud.onAiMonitoringToggle}
                testId="settings-cloud-ai-toggle"
                disabled={!cloud.isCapabilityAvailable || cloud.isBusy}
              />
              <article className="settings-description-card">
                <p><span>Управление</span><strong>{cloud.isConnected ? 'Доступно' : 'Недоступно'}</strong></p>
                <p><span>Сервис</span><strong>TreeD AI</strong></p>
                <p><span>Режим AI</span><strong>{cloud.isAiMonitoringEnabled ? 'Включен' : 'Выключен'}</strong></p>
              </article>
              <p className="settings-cloud-notice" role="status">{cloud.notice}</p>
            </div>
          ) : activeSettingsGroup === 'device' ? (
            <div className="settings-group-stack">
              <header className="settings-group-head">
                <h3>Об устройстве</h3>
                <p>Основная информация о контроллере и программной конфигурации.</p>
              </header>
              <article className="settings-description-card">
                {DEVICE_INFO_LINES.map(([label, value]) => (
                  <p key={label}><span>{label}</span><strong>{value}</strong></p>
                ))}
              </article>
            </div>
          ) : activeSettingsGroup === 'updates' ? (
            <div className="settings-group-stack settings-updates">
              <header className="settings-group-head">
                <h3>Проверка обновлений</h3>
                <p>Новые версии системы и интерфейса TreeD.</p>
              </header>
              <div className="settings-updates-versions" aria-live="polite">
                {updates.releaseResults.map((release) => (
                  <article key={release.id} className="settings-update-component" aria-label={release.label}>
                    <header>
                      <span className="settings-update-code">{release.id === 'printer-ui' ? 'UI' : 'CORE'}</span>
                      <h4>{release.label}</h4>
                    </header>
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
            <div className="settings-group-stack">
              <header className="settings-group-head">
                <h3>Язык</h3>
                <p>Локализация интерфейса и голосовых подсказок.</p>
              </header>
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
                <p>Отправка G-code и макросов через виртуальную клавиатуру.</p>
              </header>

              <div className="settings-console-quick">
                {CONSOLE_QUICK_COMMANDS.map((command, index) => (
                  <button
                    key={command}
                    type="button"
                    className="settings-console-chip"
                    onClick={() => console.onQuickCommandInsert(command)}
                    data-testid={`settings-console-quick-${index}`}
                  >
                    {command}
                  </button>
                ))}
              </div>

              <label className="settings-console-input-wrap">
                <span>Команда</span>
                <textarea
                  ref={console.inputRef}
                  className="settings-console-input"
                  value={console.commandValue}
                  onChange={console.onInputChange}
                  onFocus={console.onKeyboardOpen}
                  placeholder="Например: G28 или START_PRINT"
                  spellCheck={false}
                  data-testid="settings-console-input"
                />
              </label>

              <div className="settings-console-actions">
                <button
                  type="button"
                  className="settings-network-btn settings-network-btn-primary"
                  onClick={console.onSubmit}
                  data-testid="settings-console-send-button"
                >
                  Отправить
                </button>
                <button
                  type="button"
                  className="settings-network-btn"
                  onClick={console.onKeyboardOpen}
                  data-testid="settings-console-keyboard-open-button"
                >
                  Клавиатура
                </button>
              </div>

              <p className="settings-console-notice" data-testid="settings-console-notice">{console.notice}</p>

              <div className="settings-console-history">
                {console.history.length > 0 ? (
                  console.history.map((item) => (
                    <article className="settings-console-history-item" key={item.id}>
                      <p><strong>{item.command}</strong><span>{item.createdAt}</span></p>
                    </article>
                  ))
                ) : (
                  <p className="settings-network-empty">История команд пока пуста.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {updates.isConfigReviewOpen ? (
        <div className="system-reset-layer">
          <section ref={configReviewFocusRef} className="system-reset-dialog settings-config-review" role="dialog" aria-modal="true" aria-labelledby="config-review-title" aria-describedby="config-review-detail">
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
          <section ref={pausedUpdateFocusRef} className="system-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="paused-update-title" aria-describedby="paused-update-detail">
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
