import { moonrakerUrl } from '../config'

export type SystemHealth = 'ok' | 'warning' | 'error'
export type SystemLoadState = 'loading' | 'ready' | 'partial' | 'unavailable'

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

type FetchSystemStatusOptions = {
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  signal?: AbortSignal
  nowIso?: string
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

type MoonrakerEnvelope<T> = {
  result?: T
  error?: {
    message?: string
  }
}

type SettledEndpoint<T> = {
  label: string
  result: PromiseSettledResult<T>
}

const DEFAULT_TIMEOUT_MS = 6_000
const DIAGNOSTIC_OBJECT_PREFIXES = ['mcu', 'canbus_stats '] as const
const SERVICE_PRIORITY = ['klipper', 'moonraker', 'crowsnest', 'nginx', 'NetworkManager'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function asNumber(value: unknown): number | null {
  const numericValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function asNonNegativeNumber(value: unknown): number | null {
  const numericValue = asNumber(value)
  return numericValue === null ? null : Math.max(0, numericValue)
}

function clampPercent(value: number | null): number | null {
  return value === null ? null : Math.min(100, Math.max(0, value))
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = asString(value)
    if (normalized !== null) {
      return normalized
    }
  }

  return null
}

function readStringArray(value: unknown): string[] {
  return asArray(value)
    .map(asString)
    .filter((item): item is string => item !== null)
}

function readMessageArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => {
      if (typeof item === 'string') {
        return asString(item)
      }

      return firstString(asRecord(item).message, asRecord(item).name)
    })
    .filter((item): item is string => item !== null)
}

function formatDistribution(distribution: Record<string, unknown>): string | null {
  const prettyName = firstString(distribution.pretty_name, distribution.description)
  if (prettyName !== null) {
    return prettyName
  }

  const name = firstString(distribution.name, distribution.id)
  const version = firstString(distribution.version, distribution.version_id)
  const codeName = firstString(distribution.codename, distribution.version_codename)
  const parts = [name, version, codeName === null ? null : `(${codeName})`].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

function formatStorage(sdInfo: Record<string, unknown>): string | null {
  const manufacturer = firstString(sdInfo.manufacturer, sdInfo.oem_id)
  const product = firstString(sdInfo.product_name, sdInfo.product)
  const capacity = asNonNegativeNumber(sdInfo.capacity)
  const capacityLabel = capacity === null
    ? null
    : capacity > 1024 ** 3
      ? `${(capacity / 1024 ** 3).toFixed(1)} GB`
      : `${(capacity / 1024 ** 2).toFixed(0)} MB`
  const parts = [manufacturer, product, capacityLabel].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

function normalizeThrottledFlags(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim().length > 0 ? [value.trim()] : []
  }

  if (Array.isArray(value)) {
    return readStringArray(value)
  }

  const record = asRecord(value)
  const flags = readStringArray(record.flags)
  const enabledFlags = Object.entries(record)
    .filter(([key, item]) => key !== 'flags' && key !== 'bits' && item === true)
    .map(([key]) => key)
  const bits = asNonNegativeNumber(record.bits)

  return [
    ...flags,
    ...enabledFlags,
    ...(bits !== null && bits > 0 ? [`Код троттлинга: ${bits}`] : []),
  ]
}

function normalizeHost(systemInfoInput: unknown, processStatsInput: unknown, printerInfoInput: unknown): SystemHostStatus {
  const systemInfoRoot = asRecord(systemInfoInput)
  const systemInfo = asRecord(systemInfoRoot.system_info ?? systemInfoRoot)
  const cpuInfo = asRecord(systemInfo.cpu_info)
  const distribution = asRecord(systemInfo.distribution)
  const processStats = asRecord(processStatsInput)
  const systemCpuUsage = asRecord(processStats.system_cpu_usage)
  const systemMemory = asRecord(processStats.system_memory)
  const printerInfo = asRecord(printerInfoInput)
  const printerCpuInfo = asRecord(printerInfo.cpu_info)

  const memoryTotalKb = firstNumber(systemMemory.total, cpuInfo.total_memory)
  const memoryAvailableKb = asNonNegativeNumber(systemMemory.available)
  const memoryUsedKb = firstNumber(
    systemMemory.used,
    memoryTotalKb !== null && memoryAvailableKb !== null ? memoryTotalKb - memoryAvailableKb : null,
  )

  return {
    hostname: firstString(printerInfo.hostname, systemInfo.hostname),
    model: firstString(cpuInfo.model, cpuInfo.hardware_desc, cpuInfo.cpu_desc, printerCpuInfo.model),
    cpuDescription: firstString(cpuInfo.cpu_desc, cpuInfo.processor, printerCpuInfo.processor),
    architecture: firstString(cpuInfo.processor, printerCpuInfo.processor, cpuInfo.bits),
    cpuCount: asNonNegativeNumber(cpuInfo.cpu_count),
    operatingSystem: formatDistribution(distribution),
    cpuUsagePercent: clampPercent(firstNumber(systemCpuUsage.cpu, processStats.cpu_usage)),
    cpuTemperatureC: asNumber(processStats.cpu_temp),
    memoryTotalBytes: memoryTotalKb === null ? null : memoryTotalKb * 1024,
    memoryUsedBytes: memoryUsedKb === null ? null : Math.max(0, memoryUsedKb) * 1024,
    uptimeSec: asNonNegativeNumber(processStats.system_uptime),
    storage: formatStorage(asRecord(systemInfo.sd_info)),
    throttledFlags: normalizeThrottledFlags(processStats.throttled),
  }
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const normalized = asNumber(value)
    if (normalized !== null) {
      return normalized
    }
  }

  return null
}

function normalizeSoftware(serverInfoInput: unknown, printerInfoInput: unknown): SystemSoftwareStatus {
  const serverInfo = asRecord(serverInfoInput)
  const printerInfo = asRecord(printerInfoInput)
  const apiVersion = asArray(serverInfo.api_version)
    .map(asNumber)
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
    failedComponents: readStringArray(serverInfo.failed_components),
    warnings: readMessageArray(serverInfo.warnings),
  }
}

function normalizeMcuLabel(objectName: string): string {
  return objectName === 'mcu' ? 'Основной MCU' : objectName.slice('mcu '.length)
}

function normalizeMcus(objectStatusInput: unknown): SystemMcuStatus[] {
  const status = asRecord(asRecord(objectStatusInput).status ?? objectStatusInput)

  return Object.entries(status)
    .filter(([objectName]) => objectName === 'mcu' || objectName.startsWith('mcu '))
    .map(([objectName, value]) => {
      const mcu = asRecord(value)
      const constants = asRecord(mcu.mcu_constants)
      const lastStats = asRecord(mcu.last_stats)
      const awakeRatio = asNumber(lastStats.mcu_awake)
      const taskAverageSec = asNumber(lastStats.mcu_task_avg)

      return {
        objectName,
        label: normalizeMcuLabel(objectName),
        version: asString(mcu.mcu_version),
        build: asString(mcu.mcu_build_versions),
        architecture: firstString(constants.MCU, constants.ARCHITECTURE, constants.MCU_TYPE),
        clockFrequencyHz: firstNumber(constants.CLOCK_FREQ, lastStats.freq),
        awakePercent: clampPercent(awakeRatio === null ? null : awakeRatio * 100),
        taskAverageMs: taskAverageSec === null ? null : taskAverageSec * 1000,
        retransmits: asNonNegativeNumber(lastStats.retransmit_seq),
        invalidBytes: asNonNegativeNumber(lastStats.bytes_invalid),
      }
    })
    .sort((left, right) => left.objectName === 'mcu' ? -1 : right.objectName === 'mcu' ? 1 : left.label.localeCompare(right.label))
}

function normalizeCanDevices(objectStatusInput: unknown): SystemCanDeviceStatus[] {
  const status = asRecord(asRecord(objectStatusInput).status ?? objectStatusInput)

  return Object.entries(status)
    .filter(([objectName]) => objectName.startsWith('canbus_stats '))
    .map(([objectName, value]) => {
      const canStatus = asRecord(value)
      return {
        objectName,
        label: objectName.slice('canbus_stats '.length),
        busState: asString(canStatus.bus_state),
        rxErrors: asNonNegativeNumber(canStatus.rx_error),
        txErrors: asNonNegativeNumber(canStatus.tx_error),
        retries: asNonNegativeNumber(canStatus.tx_retries),
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label))
}

function normalizeCanInterfaces(systemInfoInput: unknown): SystemCanInterfaceStatus[] {
  const systemInfoRoot = asRecord(systemInfoInput)
  const systemInfo = asRecord(systemInfoRoot.system_info ?? systemInfoRoot)
  const canbus = asRecord(systemInfo.canbus)

  return Object.entries(canbus)
    .map(([name, value]) => {
      const details = asRecord(value)
      return {
        name,
        bitrate: asNonNegativeNumber(details.bitrate),
        txQueueLength: asNonNegativeNumber(details.tx_queue_len),
        driver: asString(details.driver),
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

function normalizeNetworks(systemInfoInput: unknown, processStatsInput: unknown): SystemNetworkStatus[] {
  const systemInfoRoot = asRecord(systemInfoInput)
  const systemInfo = asRecord(systemInfoRoot.system_info ?? systemInfoRoot)
  const networkInfo = asRecord(systemInfo.network)
  const networkStats = asRecord(asRecord(processStatsInput).network)

  return Object.entries(networkInfo)
    .map(([name, value]) => {
      const details = asRecord(value)
      const addresses = asArray(details.ip_addresses).map(asRecord)
      const stats = asRecord(networkStats[name])
      const ipv4 = addresses.find((item) => {
        const family = firstString(item.family, item.address_family)?.toLowerCase()
        return family === 'ipv4' || family === 'inet' || asString(item.address)?.includes('.') === true
      })
      const ipv6 = addresses.find((item) => {
        const family = firstString(item.family, item.address_family)?.toLowerCase()
        return family === 'ipv6' || family === 'inet6' || asString(item.address)?.includes(':') === true
      })

      return {
        name,
        ipv4: asString(ipv4?.address),
        ipv6: asString(ipv6?.address),
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
  return index === -1 ? SERVICE_PRIORITY.length : index
}

function normalizeServices(systemInfoInput: unknown): SystemServiceStatus[] {
  const systemInfoRoot = asRecord(systemInfoInput)
  const systemInfo = asRecord(systemInfoRoot.system_info ?? systemInfoRoot)
  const serviceState = asRecord(systemInfo.service_state)
  const availableServices = readStringArray(systemInfo.available_services)
  const serviceNames = availableServices.length > 0 ? availableServices : Object.keys(serviceState)

  return serviceNames
    .map((name) => {
      const details = asRecord(serviceState[name])
      const activeState = asString(details.active_state)
      const subState = asString(details.sub_state)
      const healthy = activeState === null
        ? false
        : activeState.toLowerCase() === 'active' && (subState === null || subState.toLowerCase() === 'running')

      return { name, activeState, subState, healthy }
    })
    .filter((item) => servicePriority(item.name) < SERVICE_PRIORITY.length || item.activeState !== null)
    .sort((left, right) => servicePriority(left.name) - servicePriority(right.name) || left.name.localeCompare(right.name))
    .slice(0, 8)
}

function isCanDeviceHealthy(device: SystemCanDeviceStatus): boolean {
  const busState = device.busState?.toLowerCase()
  return (busState === null || busState === 'active')
    && (device.rxErrors ?? 0) === 0
    && (device.txErrors ?? 0) === 0
}

function isKlippyError(state: string | null): boolean {
  const normalized = state?.toLowerCase()
  return normalized === 'error' || normalized === 'shutdown' || normalized === 'disconnected'
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
  const hasAnyData = [
    host.hostname,
    host.model,
    host.operatingSystem,
    software.klipperVersion,
    software.moonrakerVersion,
  ].some((value) => value !== null) || mcus.length > 0 || services.length > 0
  const loadState: SystemLoadState = !hasAnyData
    ? 'unavailable'
    : errors.length > 0
      ? 'partial'
      : 'ready'
  const hasHardFailure = loadState === 'unavailable'
    || isKlippyError(software.klippyState)
    || software.failedComponents.length > 0
  const hasWarning = loadState === 'partial'
    || software.warnings.length > 0
    || host.throttledFlags.length > 0
    || services.some((service) => !service.healthy)
    || canDevices.some((device) => !isCanDeviceHealthy(device))

  return {
    loadState,
    health: hasHardFailure ? 'error' : hasWarning ? 'warning' : 'ok',
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function fetchMoonrakerResult<T>(
  path: string,
  baseUrl: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
  const abortHandler = () => controller.abort()
  externalSignal?.addEventListener('abort', abortHandler, { once: true })

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
    if (isAbortError(error)) {
      throw new Error(externalSignal?.aborted === true ? 'Запрос отменен' : `Таймаут ${timeoutMs} мс`)
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortHandler)
  }
}

function readSettled<T>(endpoint: SettledEndpoint<T>, errors: string[]): T | undefined {
  if (endpoint.result.status === 'fulfilled') {
    return endpoint.result.value
  }

  const message = endpoint.result.reason instanceof Error
    ? endpoint.result.reason.message
    : String(endpoint.result.reason)
  errors.push(`${endpoint.label}: ${message}`)
  return undefined
}

function getDiagnosticObjectNames(objectListInput: unknown): string[] {
  const objects = readStringArray(asRecord(objectListInput).objects)
  return objects.filter((objectName) =>
    DIAGNOSTIC_OBJECT_PREFIXES.some((prefix) => objectName === prefix || objectName.startsWith(prefix)),
  )
}

export async function fetchMoonrakerSystemStatus(
  options: FetchSystemStatusOptions = {},
): Promise<MoonrakerSystemStatus> {
  const baseUrl = options.baseUrl ?? moonrakerUrl
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const request = <T,>(path: string) => fetchMoonrakerResult<T>(
    path,
    baseUrl,
    fetchImpl,
    timeoutMs,
    options.signal,
  )

  const [systemInfoResult, processStatsResult, serverInfoResult, printerInfoResult, objectListResult] = await Promise.allSettled([
    request<unknown>('/machine/system_info'),
    request<unknown>('/machine/proc_stats'),
    request<unknown>('/server/info'),
    request<unknown>('/printer/info'),
    request<unknown>('/printer/objects/list'),
  ])
  const errors: string[] = []
  const systemInfo = readSettled({ label: 'Система', result: systemInfoResult }, errors)
  const processStats = readSettled({ label: 'Процессы', result: processStatsResult }, errors)
  const serverInfo = readSettled({ label: 'Moonraker', result: serverInfoResult }, errors)
  const printerInfo = readSettled({ label: 'Klipper', result: printerInfoResult }, errors)
  const objectList = readSettled({ label: 'Объекты Klipper', result: objectListResult }, errors)
  const diagnosticObjectNames = getDiagnosticObjectNames(objectList)
  let objectStatus: unknown

  if (diagnosticObjectNames.length > 0) {
    const query = diagnosticObjectNames.map((name) => encodeURIComponent(name)).join('&')
    const objectStatusResult = await Promise.allSettled([
      request<unknown>(`/printer/objects/query?${query}`),
    ])
    objectStatus = readSettled({ label: 'MCU/CAN', result: objectStatusResult[0] }, errors)
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
