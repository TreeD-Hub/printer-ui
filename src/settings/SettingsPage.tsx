import type { ChangeEvent, RefObject } from 'react'
import {
  SettingsInfoCard,
  SettingsSelectField,
  SettingsSidebarMenu,
  SettingsToggleRow,
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
import type { UpdateReleaseResult, UpdateReleaseStatus } from './updateReleaseClient'

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
    notice: string
    onConnectionToggle: () => void
    onAiMonitoringToggle: (checked: boolean) => void
  }
  updates: {
    releaseResults: UpdateReleaseResult[]
    isCheckingUpdates: boolean
    isApplyingUpdate: boolean
    canApplySystemUpdate: boolean
    isCapabilityAvailable: boolean
    notice: string
    onCheckUpdates: () => void
    onApplySystemUpdate: () => void
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

function updateReleaseStatusLabel(status: UpdateReleaseStatus): string {
  if (status === 'available') {
    return 'Доступно'
  }

  if (status === 'latest') {
    return 'Актуально'
  }

  if (status === 'error') {
    return 'Ошибка'
  }

  if (status === 'mock') {
    return 'Mock'
  }

  return 'Нет данных'
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
                label="Уведомления"
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
                <p>Подключение сервиса для AI-контроля ошибок и удалённого мониторинга.</p>
              </header>
              <div className="settings-cloud-actions">
                <button
                  type="button"
                  className="settings-network-btn settings-network-btn-primary"
                  onClick={cloud.onConnectionToggle}
                  data-testid="settings-cloud-connect-toggle"
                  disabled={!cloud.isCapabilityAvailable}
                >
                  {cloud.isConnected ? 'Отключить облако' : 'Подключить облако'}
                </button>
              </div>
              <SettingsToggleRow
                label="AI контроль ошибок"
                checked={cloud.isAiMonitoringEnabled}
                onChange={cloud.onAiMonitoringToggle}
                testId="settings-cloud-ai-toggle"
                disabled={!cloud.isCapabilityAvailable}
              />
              <article className="settings-description-card">
                <p><span>Статус</span><strong>{cloud.isConnected ? 'Подключено' : 'Не подключено'}</strong></p>
                <p><span>Сервис</span><strong>TreeD Cloud Guard</strong></p>
                <p><span>Режим AI</span><strong>{cloud.isAiMonitoringEnabled ? 'Включен' : 'Выключен'}</strong></p>
              </article>
              <p className="settings-cloud-notice">{cloud.notice}</p>
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
            <div className="settings-group-stack">
              <header className="settings-group-head">
                <h3>Обновления</h3>
                <p>Проверка актуальности версии и доступных обновлений.</p>
              </header>
              <article className="settings-description-card">
                {updates.releaseResults.map((release) => (
                  <p key={release.id}>
                    <span>{release.label}</span>
                    <strong>
                      {release.currentVersion} / {release.latestVersion ?? release.latestTag ?? 'Нет данных'}
                    </strong>
                  </p>
                ))}
                {updates.releaseResults.map((release) => (
                  <p key={`${release.id}-status`}>
                    <span>{release.label} статус</span>
                    <strong>{updateReleaseStatusLabel(release.status)}</strong>
                  </p>
                ))}
              </article>
              <div className="settings-cloud-actions">
                <button
                  type="button"
                  className="settings-network-btn settings-network-btn-primary"
                  onClick={updates.onCheckUpdates}
                  data-testid="settings-check-updates-button"
                  disabled={updates.isCheckingUpdates || !updates.isCapabilityAvailable}
                >
                  {updates.isCheckingUpdates ? 'Проверка...' : 'Проверить обновления'}
                </button>
                <button
                  type="button"
                  className="settings-network-btn"
                  onClick={updates.onApplySystemUpdate}
                  data-testid="settings-apply-system-update-button"
                  disabled={
                    updates.isCheckingUpdates ||
                    updates.isApplyingUpdate ||
                    !updates.canApplySystemUpdate
                  }
                >
                  {updates.isApplyingUpdate ? 'Запуск...' : 'Обновить систему'}
                </button>
              </div>
              <p className="settings-cloud-notice">{updates.notice}</p>
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
    </section>
  )
}
