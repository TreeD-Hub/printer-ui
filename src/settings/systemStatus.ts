import { moonrakerUrl } from '../config'

export type SystemHealth = 'ok' | 'warning' | 'error'
export type SystemLoadState = 'loading' | 'ready' | 'partial' | 'unavailable'
export type SystemStatusTone = SystemHealth | 'muted'

export type SystemStatusSummary = {
  label: string
  tone: SystemStatusTone
  notice: string
}

export type SystemHostStatus = {
  hostname: string | null
  model: string | null
  cpuDescription: string | null
  architecture: string | null
  cpuCount: number | null
  operatingSystem: string | null
  cpuUsagePercent: number | null
  cpuTemperatureC: number | null
  memoryTotalBytes: number | null
  memoryUsedBytes: number | null
  uptimeSec: number | null
  storage: string | null
  throttledFlags: string[]
}

export type SystemSoftwareStatus = {
  klipperVersion: string | null
  moonrakerVersion: string | null
  moonrakerApiVersion: string | null
  klippyState: string | null
  stateMessage: string | null
  failedComponents: string[]
  warnings: string[]
}

export type SystemMcuStatus = {
  objectName: string
  label: string
  version: string | null
  build: string | null
  architecture: string | null
  clockFrequencyHz: number | null
  awakePercent: number | null
  taskAverageMs: number | null
  retransmits: number | null
  invalidBytes: number | null
}

export type SystemCanDeviceStatus = {
  objectName: string
  label: string
  busState: string | null
  rxErrors: number | null
  txErrors: number | null
  retries: number | null
}

export type SystemCanInterfaceStatus = {
  name: string
  bitrate: number | null
  txQueueLength: number | null
  driver: string | null
}

export type SystemNetworkStatus = {
  name: string
  ipv4: string | null
  ipv6: string | null
  rxBytesPerSec: number | null
  txBytesPerSec: number | null
}

export type SystemServiceStatus = {
  name: string
  activeState: string | null
  subState: string | null
  healthy: boolean
}

export type MoonrakerSystemStatus = {
  loadState: SystemLoadState
  health: SystemHealth
  updatedAt: string | null
  host: SystemHostStatus
  software: SystemSoftwareStatus
  mcus: SystemMcuStatus[]
  canDevices: SystemCanDeviceStatus[]
  canInterfaces: SystemCanInterfaceStatus[]
  networks: SystemNetworkStatus[]
  services: SystemServiceStatus[]
  errors: string[]
}

type NormalizeSystemStatusInput = {
  systemInfo?: unknown
  processStats?: unknown
  serverInfo?: unknown
  printerInfo?: unknown
  objectStatus?: unknown
  errors?: string[]
  updatedAt?: string
}

type FetchSystemStatusOptions = {
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  signal?: AbortSignal
  nowIso?: string
}

type MoonrakerEnvelope<T> = {
  result?: T
  error?: { message?: string }
}

type RecordValue = Record<string, unknown>

const DEFAULT_TIMEOUT_MS = 6_000
const SERVICE_PRIORITY = ['klipper', 'moonraker', 'crowsnest', 'nginx', 'NetworkManager'] as const

function record(value: unknown): RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function nonNegative(value: unknown): number | null {
  const numeric = numberValue(value)
  return numeric === null ? null : Math.max(0, numeric)
}

function percent(value: number | null): number | null {
  return value === null ? null : Math.min(100, Math.max(0, value))
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = stringValue(value)
    if (normalized !== null) {
      return normalized
    }
  }
  return null
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const normalized = numberValue(value)
    if (normalized !== null) {
      return normalized
    }
  }
  return null
}

function stringArray(value: unknown): string[] {
  return array(value)
    .map(stringValue)
    .filter((item): item is string => item !== null)
}

function messageArray(value: unknown): string[] {
  return array(value)
    .map((item) => typeof item === 'string'
      ? stringValue(item)
      : firstString(record(item).message, record(item).name))
    .filter((item): item is string => item !== null)
}

function formatDistribution(value: unknown): string | null {
  const distribution = record(value)
  const prettyName = firstString(distribution.pretty_name, distribution.description)
  if (prettyName !== null) {
    return prettyName
  }
  const name = firstString(distribution.name, distribution.id)
  const version = firstString(distribution.version, distribution.version_id)
  const codeName = firstString(distribution.codename, distribution.version_codename)
  const parts = [name, version, codeName === null ? null : `(${codeName})`]
    .filter((item): item is string => item !== null)
  return parts.length > 0 ? parts.join(' ') : null
}

function formatStorage(value: unknown): string | null {
  const storage = record(value)
  const manufacturer = firstString(storage.manufacturer, storage.oem_id)
  const product = firstString(storage.product_name, storage.product)
  const capacity = nonNegative(storage.capacity)
  const capacityLabel = capacity === null
    ? null
    : capacity >= 1024 ** 3
      ? `${(capacity / 1024 ** 3).toFixed(1)} GB`
      : `${(capacity / 1024 ** 2).toFixed(0)} MB`
  const parts = [manufacturer, product, capacityLabel]
    .filter((item): item is string => item !== null)
  return parts.length > 0 ? parts.join(' · ') : null
}

function throttledFlags(value: unknown): string[] {
  if (typeof value === 'string') {
    return stringValue(value) === null ? [] : [value.trim()]
  }
  if (Array.isArray(value)) {
    return stringArray(value)
  }
  const source = record(value)
  const bits = nonNegative(source.bits)
  return [
    ...stringArray(source.flags),
    ...Object.entries(source)
      .filter(([key, item]) => key !== 'bits' && key !== 'flags' && item === true)
      .map(([key]) => key),
    ...(bits !== null && bits > 0 ? [`Код троттлинга: ${bits}`] : []),
  ]
}

function normalizeHost(systemInfoInput: unknown, processStatsInput: unknown, printerInfoInput: unknown): SystemHostStatus {
  const systemInfoRoot = record(systemInfoInput)
  const systemInfo = record(systemInfoRoot.system_info ?? systemInfoRoot)
  const cpuInfo = record(systemInfo.cpu_info)
  const processStats = record(processStatsInput)
  const systemMemory = record(processStats.system_memory)
  const systemCpuUsage = record(processStats.system_cpu_usage)
  const printerInfo = record(printerInfoInput)
  const printerCpuInfo = record(printerInfo.cpu_info)
  const memoryTotalKb = firstNumber(systemMemory.total, cpuInfo.total_memory)
  const memoryAvailableKb = nonNegative(systemMemory.available)
  const memoryUsedKb = firstNumber(
    systemMemory.used,
    memoryTotalKb !== null && memoryAvailableKb !== null
      ? memoryTotalKb - memoryAvailableKb
      : null,
  )
  const processor = firstString(cpuInfo.processor, printerCpuInfo.processor)
  const bits = nonNegative(cpuInfo.bits)

  return {
    hostname: firstString(printerInfo.hostname, systemInfo.hostname),
    model: firstString(cpuInfo.model, cpuInfo.hardware_desc, cpuInfo.cpu_desc, printerCpuInfo.model),
    cpuDescription: firstString(cpuInfo.cpu_desc, processor),
    architecture: processor ?? (bits === null ? null : `${bits}-bit`),
    cpuCount: nonNegative(cpuInfo.cpu_count),
    operatingSystem: formatDistribution(systemInfo.distribution),
    cpuUsagePercent: percent(firstNumber(systemCpuUsage.cpu, processStats.cpu_usage)),
    cpuTemperatureC: numberValue(processStats.cpu_temp),
    memoryTotalBytes: memoryTotalKb === null ? null : Math.max(0, memoryTotalKb) * 1024,
    memoryUsedBytes: memoryUsedKb === null ? null : Math.max(0, memoryUsedKb) * 1024,
    uptimeSec: nonNegative(processStats.system_uptime),
    storage: formatStorage(systemInfo.sd_info),
    throttledFlags: throttledFlags(processStats.throttled),
  }
}

function normalizeSoftware(serverInfoInput: unknown, printerInfoInput: unknown): SystemSoftwareStatus {
  const serverInfo = record(serverInfoInput)
  const printerInfo = record(printerInfoInput)
  const apiVersion = array(serverInfo.api_version)
    .map(numberValue)
    .filter((item): item is number => item !== null)

  return {
    klipperVersion: firstString(printerInfo.software_version, printerInfo.klipper_version),
    moonrakerVersion: firstString(serverInfo.moonraker_version, serverInfo.software_version),
    moonrakerApiVersion: firstString(
      serverInfo.api_version_string,
      apiVersion.length > 0 ? apiVersion.join('.') : null,
    ),
    klippyState: firstString(serverInfo.klippy_state, printerInfo.state),
    stateMessage: firstString(printerInfo.state_message, serverInfo.klippy_message),
    failedComponents: stringArray(serverInfo.failed_components),
    warnings: messageArray(serverInfo.warnings),
  }
}

function normalizeMcus(objectStatusInput: unknown): SystemMcuStatus[] {
  const status = record(record(objectStatusInput).status ?? objectStatusInput)
  return Object.entries(status)
    .filter(([name]) => name === 'mcu' || name.startsWith('mcu '))
    .map(([objectName, value]) => {
      const mcu = record(value)
      const constants = record(mcu.mcu_constants)
      const stats = record(mcu.last_stats)
      const awakeRatio = numberValue(stats.mcu_awake)
      const taskAverageSec = numberValue(stats.mcu_task_avg)
      return {
        objectName,
        label: objectName === 'mcu' ? 'Основной MCU' : objectName.slice(4),
        version: stringValue(mcu.mcu_version),
        build: stringValue(mcu.mcu_build_versions),
        architecture: firstString(constants.MCU, constants.ARCHITECTURE, constants.MCU_TYPE),
        clockFrequencyHz: firstNumber(constants.CLOCK_FREQ, stats.freq),
        awakePercent: percent(awakeRatio === null ? null : awakeRatio * 100),
        taskAverageMs: taskAverageSec === null ? null : taskAverageSec * 1000,
        retransmits: nonNegative(stats.retransmit_seq),
        invalidBytes: nonNegative(stats.bytes_invalid),
      }
    })
    .sort((left, right) => left.objectName === 'mcu'
      ? -1
      : right.objectName === 'mcu'
        ? 1
        : left.label.localeCompare(right.label))
}

function normalizeCanDevices(objectStatusInput: unknown): SystemCanDeviceStatus[] {
  const status = record(record(objectStatusInput).status ?? objectStatusInput)
  return Object.entries(status)
    .filter(([name]) => name.startsWith('canbus_stats '))
    .map(([objectName, value]) => {
      const stats = record(value)
      return {
        objectName,
        label: objectName.slice('canbus_stats '.length),
        busState: stringValue(stats.bus_state),
        rxErrors: nonNegative(stats.rx_error),
        txErrors: nonNegative(stats.tx_error),
        retries: nonNegative(stats.tx_retries),
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label))
}

function normalizeCanInterfaces(systemInfoInput: unknown): SystemCanInterfaceStatus[] {
  const root = record(systemInfoInput)
  const systemInfo = record(root.system_info ?? root)
  return Object.entries(record(systemInfo.canbus))
    .map(([name, value]) => {
      const details = record(value)
      return {
        name,
        bitrate: nonNegative(details.bitrate),
        txQueueLength: nonNegative(details.tx_queue_len),
        driver: stringValue(details.driver),
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

function normalizeNetworks(systemInfoInput: unknown, processStatsInput: unknown): SystemNetworkStatus[] {
  const root = record(systemInfoInput)
  const systemInfo = record(root.system_info ?? root)
  const networkStats = record(record(processStatsInput).network)
  return Object.entries(record(systemInfo.network))
    .map(([name, value]) => {
      const details = record(value)
      const addresses = array(details.ip_addresses).map(record)
      const stats = record(networkStats[name])
      const ipv4 = addresses.find((item) => {
        const family = firstString(item.family, item.address_family)?.toLowerCase()
        return family === 'ipv4' || family === 'inet' || stringValue(item.address)?.includes('.') === true
      })
      const ipv6 = addresses.find((item) => {
        const family = firstString(item.family, item.address_family)?.toLowerCase()
        return family === 'ipv6' || family === 'inet6' || stringValue(item.address)?.includes(':') === true
      })
      return {
        name,
        ipv4: stringValue(ipv4?.address),
        ipv6: stringValue(ipv6?.address),
        rxBytesPerSec: firstNumber(stats.rx_bandwidth, stats.rx_bytes_sec),
        txBytesPerSec: firstNumber(stats.tx_bandwidth, stats.tx_bytes_sec),
      }
    })
    .filter((item) => item.ipv4 !== null || item.ipv6 !== null || item.rxBytesPerSec !== null || item.txBytesPerSec !== null)
    .sort((left, right) => left.name.localeCompare(right.name))
}

function servicePriority(name: string): number {
  const normalizedName = name.toLowerCase()
  const index = SERVICE_PRIORITY.findIndex((item) => item.toLowerCase() === normalizedName)
  return index < 0 ? SERVICE_PRIORITY.length : index
}

function normalizeServices(systemInfoInput: unknown): SystemServiceStatus[] {
  const root = record(systemInfoInput)
  const systemInfo = record(root.system_info ?? root)
  const states = record(systemInfo.service_state)
  const available = stringArray(systemInfo.available_services)
  const names = available.length > 0 ? available : Object.keys(states)

  return names
    .map((name) => {
      const state = record(states[name])
      const activeState = stringValue(state.active_state)
      const subState = stringValue(state.sub_state)
      const normalizedSubState = subState?.toLowerCase()
      return {
        name,
        activeState,
        subState,
        healthy: activeState?.toLowerCase() === 'active'
          && normalizedSubState !== 'failed'
          && normalizedSubState !== 'dead',
      }
    })
    .filter((item) => servicePriority(item.name) < SERVICE_PRIORITY.length || item.activeState !== null)
    .sort((left, right) => servicePriority(left.name) - servicePriority(right.name) || left.name.localeCompare(right.name))
    .slice(0, 8)
}

export function isSystemCanDeviceHealthy(device: SystemCanDeviceStatus): boolean {
  const state = device.busState?.toLowerCase()
  return (state === null || state === 'active')
    && (device.rxErrors ?? 0) === 0
    && (device.txErrors ?? 0) === 0
}

function klippyFailed(state: string | null): boolean {
  return ['error', 'shutdown', 'disconnected'].includes(state?.toLowerCase() ?? '')
}

export function normalizeMoonrakerSystemStatus(input: NormalizeSystemStatusInput): MoonrakerSystemStatus {
  const errors = input.errors ?? []
  const host = normalizeHost(input.systemInfo, input.processStats, input.printerInfo)
  const software = normalizeSoftware(input.serverInfo, input.printerInfo)
  const mcus = normalizeMcus(input.objectStatus)
  const canDevices = normalizeCanDevices(input.objectStatus)
  const canInterfaces = normalizeCanInterfaces(input.systemInfo)
  const networks = normalizeNetworks(input.systemInfo, input.processStats)
  const services = normalizeServices(input.systemInfo)
  const hasAnyData = [host.hostname, host.model, host.operatingSystem, software.klipperVersion, software.moonrakerVersion]
    .some((value) => value !== null) || mcus.length > 0 || services.length > 0
  const loadState: SystemLoadState = !hasAnyData ? 'unavailable' : errors.length > 0 ? 'partial' : 'ready'
  const hardFailure = loadState === 'unavailable'
    || klippyFailed(software.klippyState)
    || software.failedComponents.length > 0
  const warning = loadState === 'partial'
    || software.warnings.length > 0
    || host.throttledFlags.length > 0
    || services.some((service) => !service.healthy)
    || canDevices.some((device) => !isSystemCanDeviceHealthy(device))

  return {
    loadState,
    health: hardFailure ? 'error' : warning ? 'warning' : 'ok',
    updatedAt: hasAnyData ? input.updatedAt ?? new Date().toISOString() : null,
    host,
    software,
    mcus,
    canDevices,
    canInterfaces,
    networks,
    services,
    errors,
  }
}

export function summarizeMoonrakerSystemStatus(status: MoonrakerSystemStatus): SystemStatusSummary {
  if (status.loadState === 'loading') {
    return {
      label: 'Загрузка',
      tone: 'muted',
      notice: 'Диагностика системы загружается.',
    }
  }

  if (status.loadState === 'unavailable') {
    return {
      label: 'Нет данных',
      tone: 'error',
      notice: status.errors[0] ?? 'Системная диагностика Moonraker недоступна.',
    }
  }

  const failedComponent = status.software.failedComponents[0]
  const unhealthyService = status.services.find((service) => !service.healthy)
  const unhealthyCanDevice = status.canDevices.find((device) => !isSystemCanDeviceHealthy(device))
  const issueNotice = klippyFailed(status.software.klippyState)
    ? status.software.stateMessage ?? `Klipper: ${status.software.klippyState}`
    : failedComponent !== undefined
      ? `Компонент Moonraker не запущен: ${failedComponent}.`
      : status.errors[0]
        ?? status.software.warnings[0]
        ?? (status.host.throttledFlags[0] === undefined ? undefined : `Host: ${status.host.throttledFlags[0]}.`)
        ?? (unhealthyService === undefined
          ? undefined
          : `Сервис ${unhealthyService.name}: ${[unhealthyService.activeState, unhealthyService.subState].filter(Boolean).join(' / ') || 'нет данных'}.`)
        ?? (unhealthyCanDevice === undefined
          ? undefined
          : `CAN ${unhealthyCanDevice.label}: ${unhealthyCanDevice.busState ?? 'ошибки обмена'}.`)

  if (status.health === 'error') {
    return {
      label: 'Ошибка',
      tone: 'error',
      notice: issueNotice ?? 'Runtime сообщает о критической ошибке.',
    }
  }

  if (status.health === 'warning') {
    return {
      label: 'Внимание',
      tone: 'warning',
      notice: issueNotice ?? 'Runtime сообщает о предупреждении.',
    }
  }

  return {
    label: 'В норме',
    tone: 'ok',
    notice: 'Доступные runtime-данные без предупреждений.',
  }
}

export function createLoadingMoonrakerSystemStatus(): MoonrakerSystemStatus {
  return {
    loadState: 'loading',
    health: 'ok',
    updatedAt: null,
    host: {
      hostname: null,
      model: null,
      cpuDescription: null,
      architecture: null,
      cpuCount: null,
      operatingSystem: null,
      cpuUsagePercent: null,
      cpuTemperatureC: null,
      memoryTotalBytes: null,
      memoryUsedBytes: null,
      uptimeSec: null,
      storage: null,
      throttledFlags: [],
    },
    software: {
      klipperVersion: null,
      moonrakerVersion: null,
      moonrakerApiVersion: null,
      klippyState: null,
      stateMessage: null,
      failedComponents: [],
      warnings: [],
    },
    mcus: [],
    canDevices: [],
    canInterfaces: [],
    networks: [],
    services: [],
    errors: [],
  }
}

function abortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function fetchResult<T>(
  path: string,
  baseUrl: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
  const onExternalAbort = () => controller.abort()
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const response = await fetchImpl(`${baseUrl}${path}`, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const payload = (await response.json()) as MoonrakerEnvelope<T>
    if (payload.error?.message) {
      throw new Error(payload.error.message)
    }
    if (payload.result === undefined) {
      throw new Error('Moonraker result отсутствует')
    }
    return payload.result
  } catch (error) {
    if (abortError(error)) {
      throw new Error(externalSignal?.aborted === true ? 'Запрос отменен' : `Таймаут ${timeoutMs} мс`)
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}

function settledValue<T>(label: string, result: PromiseSettledResult<T>, errors: string[]): T | undefined {
  if (result.status === 'fulfilled') {
    return result.value
  }
  const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
  errors.push(`${label}: ${message}`)
  return undefined
}

function diagnosticObjectNames(objectListInput: unknown): string[] {
  return stringArray(record(objectListInput).objects)
    .filter((name) => name === 'mcu' || name.startsWith('mcu ') || name.startsWith('canbus_stats '))
}

export async function fetchMoonrakerSystemStatus(
  options: FetchSystemStatusOptions = {},
): Promise<MoonrakerSystemStatus> {
  const baseUrl = options.baseUrl ?? moonrakerUrl
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const request = <T,>(path: string) => fetchResult<T>(
    path,
    baseUrl,
    fetchImpl,
    timeoutMs,
    options.signal,
  )
  const results = await Promise.allSettled([
    request<unknown>('/machine/system_info'),
    request<unknown>('/machine/proc_stats'),
    request<unknown>('/server/info'),
    request<unknown>('/printer/info'),
    request<unknown>('/printer/objects/list'),
  ])
  const errors: string[] = []
  const systemInfo = settledValue('Система', results[0], errors)
  const processStats = settledValue('Процессы', results[1], errors)
  const serverInfo = settledValue('Moonraker', results[2], errors)
  const printerInfo = settledValue('Klipper', results[3], errors)
  const objectList = settledValue('Объекты Klipper', results[4], errors)
  const objectNames = diagnosticObjectNames(objectList)
  let objectStatus: unknown

  if (objectNames.length > 0) {
    try {
      const query = objectNames.map(encodeURIComponent).join('&')
      objectStatus = await request<unknown>(`/printer/objects/query?${query}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`MCU/CAN: ${message}`)
    }
  }

  return normalizeMoonrakerSystemStatus({
    systemInfo,
    processStats,
    serverInfo,
    printerInfo,
    objectStatus,
    errors,
    updatedAt: options.nowIso ?? new Date().toISOString(),
  })
}
