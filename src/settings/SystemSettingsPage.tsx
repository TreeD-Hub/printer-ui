import type { CSSProperties, ReactNode } from 'react'
import { SettingsSidebarMenu } from '../ui'
import { SETTINGS_GROUP_OPTIONS } from './config'
import type { SettingsPageProps } from './SettingsPage'
import {
  summarizeMoonrakerSystemStatus,
  type MoonrakerSystemStatus,
  type SystemCanDeviceStatus,
  type SystemHealth,
  type SystemMcuStatus,
  type SystemNetworkStatus,
  type SystemServiceStatus,
} from './systemStatus'
import type { MoonrakerSystemStatusController } from './useMoonrakerSystemStatus'
import './systemSettings.css'

type SystemSettingsPageProps = Pick<
  SettingsPageProps,
  'activeSettingsGroup' | 'onSettingsGroupChange' | 'system'
> & {
  systemStatus: MoonrakerSystemStatusController
}

type SystemCardProps = {
  title: string
  subtitle?: string | null
  status?: string
  tone?: SystemHealth | 'muted'
  gaugePercent?: number | null
  children: ReactNode
  className?: string
}

type MetricRowProps = {
  label: string
  value: string
  title?: string
}

function formatNumber(value: number | null, digits = 0): string {
  return value === null ? '—' : value.toLocaleString('ru-RU', { maximumFractionDigits: digits })
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${formatNumber(value, 1)}%`
}

function formatTemperature(value: number | null): string {
  return value === null ? '—' : `${formatNumber(value, 1)} °C`
}

function formatBytes(value: number | null): string {
  if (value === null) {
    return '—'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let amount = Math.max(0, value)
  let unitIndex = 0
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024
    unitIndex += 1
  }

  const digits = unitIndex <= 1 || amount >= 100 ? 0 : 1
  return `${amount.toLocaleString('ru-RU', { maximumFractionDigits: digits })} ${units[unitIndex]}`
}

function formatRate(value: number | null): string {
  return value === null ? '—' : `${formatBytes(value)}/с`
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) {
    return '—'
  }

  const totalMinutes = Math.max(0, Math.floor(seconds / 60))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    return `${days} д ${hours} ч`
  }
  if (hours > 0) {
    return `${hours} ч ${minutes} мин`
  }
  return `${minutes} мин`
}

function formatFrequency(value: number | null): string {
  if (value === null) {
    return '—'
  }

  if (value >= 1_000_000) {
    return `${formatNumber(value / 1_000_000, 1)} MHz`
  }
  if (value >= 1_000) {
    return `${formatNumber(value / 1_000, 1)} kHz`
  }
  return `${formatNumber(value)} Hz`
}

function formatUpdatedAt(value: string | null): string {
  if (value === null) {
    return 'Нет актуальных данных'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Время обновления неизвестно'
    : `Обновлено ${date.toLocaleTimeString('ru-RU')}`
}

function formatMemoryUsage(usedBytes: number | null, totalBytes: number | null): string {
  if (usedBytes === null || totalBytes === null || totalBytes <= 0) {
    return '—'
  }

  return `${formatBytes(usedBytes)} / ${formatBytes(totalBytes)}`
}

function getMemoryPercent(usedBytes: number | null, totalBytes: number | null): number | null {
  if (usedBytes === null || totalBytes === null || totalBytes <= 0) {
    return null
  }

  return Math.min(100, Math.max(0, (usedBytes / totalBytes) * 100))
}

function getKlippyTone(state: string | null): SystemHealth | 'muted' {
  const normalized = state?.toLowerCase()
  if (normalized === 'ready') {
    return 'ok'
  }
  if (normalized === 'startup') {
    return 'warning'
  }
  if (normalized === 'error' || normalized === 'shutdown' || normalized === 'disconnected') {
    return 'error'
  }
  return 'muted'
}

function getCanTone(device: SystemCanDeviceStatus): SystemHealth {
  const state = device.busState?.toLowerCase()
  const hasErrors = (device.rxErrors ?? 0) > 0 || (device.txErrors ?? 0) > 0
  if (state === 'off' || state === 'passive') {
    return 'error'
  }
  if (state === 'warn' || hasErrors) {
    return 'warning'
  }
  return 'ok'
}

function getServiceStatus(service: SystemServiceStatus): string {
  const values = [service.activeState, service.subState].filter(Boolean)
  return values.length > 0 ? values.join(' / ') : 'Нет данных'
}

function MetricRow({ label, value, title }: MetricRowProps) {
  return (
    <div className="system-metric-row">
      <dt>{label}</dt>
      <dd title={title ?? value}>{value}</dd>
    </div>
  )
}

function SystemCard({
  title,
  subtitle,
  status,
  tone = 'muted',
  gaugePercent,
  children,
  className = '',
}: SystemCardProps) {
  const normalizedGauge = gaugePercent === null || gaugePercent === undefined
    ? null
    : Math.min(100, Math.max(0, gaugePercent))

  return (
    <article className={`system-status-card ${className}`.trim()}>
      <div className="system-status-card-head">
        <div className="system-status-card-title">
          <strong>{title}</strong>
          {subtitle ? <span title={subtitle}>{subtitle}</span> : null}
        </div>
        {status ? <span className={`system-status-badge is-${tone}`}>{status}</span> : null}
      </div>
      <div className="system-status-card-body">
        <dl className="system-metric-list">{children}</dl>
        {normalizedGauge !== null ? (
          <div
            className="system-status-gauge"
            style={{ '--system-gauge-load': `${normalizedGauge}%` } as CSSProperties}
            aria-label={`Нагрузка ${Math.round(normalizedGauge)} процентов`}
          >
            <span>{Math.round(normalizedGauge)}</span>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function McuCard({ mcu }: { mcu: SystemMcuStatus }) {
  return (
    <SystemCard
      title={mcu.label}
      subtitle={mcu.architecture ?? mcu.objectName}
      status="Подключен"
      tone="ok"
      gaugePercent={mcu.awakePercent}
    >
      <MetricRow label="Прошивка" value={mcu.version ?? '—'} />
      <MetricRow label="Частота" value={formatFrequency(mcu.clockFrequencyHz)} />
      <MetricRow label="Средняя задача" value={mcu.taskAverageMs === null ? '—' : `${formatNumber(mcu.taskAverageMs, 3)} мс`} />
      <MetricRow label="Повторы / мусор" value={`${formatNumber(mcu.retransmits)} / ${formatNumber(mcu.invalidBytes)}`} />
      {mcu.build ? <MetricRow label="Сборка" value={mcu.build} title={mcu.build} /> : null}
    </SystemCard>
  )
}

function CanDeviceRow({ device }: { device: SystemCanDeviceStatus }) {
  const tone = getCanTone(device)
  return (
    <div className="system-compact-item">
      <div>
        <strong>{device.label}</strong>
        <span>RX {formatNumber(device.rxErrors)} · TX {formatNumber(device.txErrors)} · retry {formatNumber(device.retries)}</span>
      </div>
      <span className={`system-status-badge is-${tone}`}>{device.busState ?? 'unknown'}</span>
    </div>
  )
}

function NetworkRow({ network }: { network: SystemNetworkStatus }) {
  return (
    <div className="system-compact-item">
      <div>
        <strong>{network.name}</strong>
        <span>{network.ipv4 ?? network.ipv6 ?? 'IP не назначен'}</span>
      </div>
      <span className="system-compact-value">↓ {formatRate(network.rxBytesPerSec)} · ↑ {formatRate(network.txBytesPerSec)}</span>
    </div>
  )
}

function ServiceRow({ service }: { service: SystemServiceStatus }) {
  return (
    <div className="system-compact-item">
      <div>
        <strong>{service.name}</strong>
        <span>{getServiceStatus(service)}</span>
      </div>
      <span className={`system-status-dot ${service.healthy ? 'is-ok' : 'is-error'}`} aria-hidden="true" />
    </div>
  )
}

function collectWarnings(status: MoonrakerSystemStatus): string[] {
  return [
    ...status.software.failedComponents.map((component) => `Компонент Moonraker не запущен: ${component}`),
    ...status.software.warnings,
    ...status.host.throttledFlags.map((flag) => `Host: ${flag}`),
    ...status.errors,
  ]
}

export function SystemSettingsPage({
  activeSettingsGroup,
  onSettingsGroupChange,
  system,
  systemStatus,
}: SystemSettingsPageProps) {
  const { status, isRefreshing, refresh } = systemStatus
  const memoryPercent = getMemoryPercent(status.host.memoryUsedBytes, status.host.memoryTotalBytes)
  const warnings = collectWarnings(status)
  const stateSummary = summarizeMoonrakerSystemStatus(status)
  const canInterfaceSummary = status.canInterfaces.length === 0
    ? 'CAN-интерфейсы не обнаружены'
    : status.canInterfaces
      .map((item) => `${item.name}: ${item.bitrate === null ? '—' : `${formatNumber(item.bitrate / 1_000)} kbit/s`}`)
      .join(' · ')

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

        <div className="settings-content-shell system-settings-content">
          <div className="system-settings-stack">
            <header className="system-settings-head">
              <div>
                <h3>Система</h3>
                <p>Реальное состояние хоста, Klipper, Moonraker, MCU и интерфейсов.</p>
              </div>
              <div className="system-settings-head-actions">
                <div className="system-settings-state">
                  <span className={`system-status-badge is-${stateSummary.tone}`}>{stateSummary.label}</span>
                  <small>{formatUpdatedAt(status.updatedAt)}</small>
                </div>
                <button
                  type="button"
                  className="settings-network-btn system-refresh-button"
                  onClick={refresh}
                  disabled={isRefreshing}
                  data-testid="settings-system-refresh"
                >
                  {isRefreshing ? 'Обновление…' : 'Обновить'}
                </button>
              </div>
            </header>

            <div className="system-settings-grid is-primary">
              <SystemCard
                title={status.host.hostname ?? 'Host'}
                subtitle={status.host.model ?? status.host.cpuDescription}
                status={formatPercent(status.host.cpuUsagePercent)}
                tone={status.host.throttledFlags.length > 0 ? 'warning' : 'ok'}
                gaugePercent={status.host.cpuUsagePercent}
              >
                <MetricRow label="ОС" value={status.host.operatingSystem ?? '—'} />
                <MetricRow label="CPU" value={status.host.cpuDescription ?? status.host.architecture ?? '—'} />
                <MetricRow label="Ядра" value={formatNumber(status.host.cpuCount)} />
                <MetricRow label="Память" value={formatMemoryUsage(status.host.memoryUsedBytes, status.host.memoryTotalBytes)} />
                <MetricRow label="Температура" value={formatTemperature(status.host.cpuTemperatureC)} />
                <MetricRow label="Uptime" value={formatUptime(status.host.uptimeSec)} />
                {status.host.storage ? <MetricRow label="Накопитель" value={status.host.storage} /> : null}
              </SystemCard>

              <SystemCard
                title="Klipper / Moonraker"
                subtitle={status.software.stateMessage}
                status={status.software.klippyState ?? 'unknown'}
                tone={getKlippyTone(status.software.klippyState)}
                gaugePercent={memoryPercent}
              >
                <MetricRow label="Klipper" value={status.software.klipperVersion ?? '—'} />
                <MetricRow label="Moonraker" value={status.software.moonrakerVersion ?? '—'} />
                <MetricRow label="API" value={status.software.moonrakerApiVersion ?? '—'} />
                <MetricRow label="UI contract" value={system.contractStatus} />
                <MetricRow label="Runtime" value={system.runtimeStatus} />
              </SystemCard>
            </div>

            <section className="system-settings-section">
              <div className="system-settings-section-head">
                <h4>Контроллеры</h4>
                <span>{status.mcus.length} MCU</span>
              </div>
              {status.mcus.length > 0 ? (
                <div className="system-settings-grid is-mcu">
                  {status.mcus.map((mcu) => <McuCard key={mcu.objectName} mcu={mcu} />)}
                </div>
              ) : (
                <p className="system-settings-empty">
                  MCU не обнаружены. Данные появятся после подключения Klipper и публикации объектов `mcu`.
                </p>
              )}
            </section>

            <div className="system-settings-grid is-secondary">
              <section className="system-compact-card">
                <div className="system-settings-section-head">
                  <h4>CAN</h4>
                  <span>{canInterfaceSummary}</span>
                </div>
                <div className="system-compact-list">
                  {status.canDevices.length > 0
                    ? status.canDevices.map((device) => <CanDeviceRow key={device.objectName} device={device} />)
                    : <p className="system-settings-empty">Статистика CAN-устройств недоступна.</p>}
                </div>
              </section>

              <section className="system-compact-card">
                <div className="system-settings-section-head">
                  <h4>Сеть</h4>
                  <span>{status.networks.length} интерфейсов</span>
                </div>
                <div className="system-compact-list">
                  {status.networks.length > 0
                    ? status.networks.map((network) => <NetworkRow key={network.name} network={network} />)
                    : <p className="system-settings-empty">Сетевые интерфейсы не обнаружены.</p>}
                </div>
              </section>

              <section className="system-compact-card">
                <div className="system-settings-section-head">
                  <h4>Сервисы</h4>
                  <span>{status.services.filter((service) => service.healthy).length}/{status.services.length}</span>
                </div>
                <div className="system-compact-list">
                  {status.services.length > 0
                    ? status.services.map((service) => <ServiceRow key={service.name} service={service} />)
                    : <p className="system-settings-empty">Состояние systemd-сервисов недоступно.</p>}
                </div>
              </section>
            </div>

            {warnings.length > 0 ? (
              <section className="system-alert-card" role="status">
                <div className="system-settings-section-head">
                  <h4>Предупреждения</h4>
                  <span>{warnings.length}</span>
                </div>
                <ul>
                  {warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
                </ul>
              </section>
            ) : null}

            <div className="system-settings-footer">
              <div>
                <strong>Диагностика</strong>
                <span>Экспортирует текущий snapshot UI и runtime для разбора неисправностей.</span>
              </div>
              <button
                type="button"
                className="settings-network-btn"
                onClick={system.onExportDiagnostics}
              >
                Экспорт диагностики
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
