import { moonrakerUrl } from '../config'

const MAINTENANCE_NAMESPACE = 'printer_ui'
const MAINTENANCE_KEY = 'maintenance'
const MAINTENANCE_SCHEMA_VERSION = 1
const MAX_MAINTENANCE_RECORDS = 50
const DEFAULT_TIMEOUT_MS = 6_000
const DUPLICATE_RUNTIME_TOLERANCE_SEC = 1
const DUPLICATE_TIME_WINDOW_MS = 10 * 60 * 1000

type MoonrakerEnvelope<T> = {
  result?: T
  error?: { message?: string }
}

type MoonrakerDatabaseListResult = {
  namespaces?: unknown
}

type MoonrakerDatabaseItemResult = {
  namespace?: unknown
  key?: unknown
  value?: unknown
}

type MaintenanceRepositoryOptions = {
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  now?: () => Date
}

export type MaintenanceRecord = {
  id: string
  completedAt: string
  runtimeSec: number
}

export type MaintenanceLedger = {
  schemaVersion: 1
  records: MaintenanceRecord[]
}

export type MaintenanceRepository = {
  load: () => Promise<MaintenanceLedger>
  complete: (runtimeSec: number, completedAt?: string) => Promise<MaintenanceLedger>
}

class MaintenanceRepositoryError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'MaintenanceRepositoryError'
    this.status = status
  }
}

function emptyLedger(): MaintenanceLedger {
  return {
    schemaVersion: MAINTENANCE_SCHEMA_VERSION,
    records: [],
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function nonNegativeNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null
}

function normalizeMaintenanceRecord(value: unknown): MaintenanceRecord | null {
  const source = record(value)
  const id = typeof source.id === 'string' ? source.id.trim() : ''
  const completedAt = typeof source.completedAt === 'string' ? source.completedAt.trim() : ''
  const runtimeSec = nonNegativeNumber(source.runtimeSec)

  if (id.length === 0 || completedAt.length === 0 || runtimeSec === null || !Number.isFinite(Date.parse(completedAt))) {
    return null
  }

  return { id, completedAt, runtimeSec }
}

export function normalizeMaintenanceLedger(value: unknown): MaintenanceLedger {
  if (value === undefined || value === null) {
    return emptyLedger()
  }

  const source = record(value)
  if (source.schemaVersion !== MAINTENANCE_SCHEMA_VERSION) {
    throw new Error('Неподдерживаемая версия данных технического обслуживания.')
  }

  if (!Array.isArray(source.records)) {
    throw new Error('История технического обслуживания повреждена.')
  }

  const uniqueRecords = new Map<string, MaintenanceRecord>()
  for (const item of source.records) {
    const normalized = normalizeMaintenanceRecord(item)
    if (normalized !== null && !uniqueRecords.has(normalized.id)) {
      uniqueRecords.set(normalized.id, normalized)
    }
  }

  const records = [...uniqueRecords.values()]
    .sort((left, right) => (
      Date.parse(right.completedAt) - Date.parse(left.completedAt)
      || right.runtimeSec - left.runtimeSec
    ))
    .slice(0, MAX_MAINTENANCE_RECORDS)

  return {
    schemaVersion: MAINTENANCE_SCHEMA_VERSION,
    records,
  }
}

function isMissingItemError(error: unknown): boolean {
  if (!(error instanceof MaintenanceRepositoryError)) {
    return false
  }

  return error.status === 404 || /not found|does not exist|unknown key|no such key/i.test(error.message)
}

async function readEnvelope<T>(response: Response): Promise<MoonrakerEnvelope<T>> {
  try {
    return await response.json() as MoonrakerEnvelope<T>
  } catch {
    return {}
  }
}

async function requestMoonraker<T>(
  path: string,
  options: Required<Pick<MaintenanceRepositoryOptions, 'baseUrl' | 'fetchImpl' | 'timeoutMs'>>,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), options.timeoutMs)

  try {
    const response = await options.fetchImpl(`${options.baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
    })
    const payload = await readEnvelope<T>(response)

    if (!response.ok) {
      throw new MaintenanceRepositoryError(payload.error?.message ?? `HTTP ${response.status}`, response.status)
    }
    if (payload.error?.message) {
      throw new MaintenanceRepositoryError(payload.error.message, response.status)
    }
    if (payload.result === undefined) {
      throw new MaintenanceRepositoryError('Moonraker result отсутствует.', response.status)
    }

    return payload.result
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new MaintenanceRepositoryError(`Таймаут ${options.timeoutMs} мс.`)
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

function createRecordId(runtimeSec: number, completedAt: string): string {
  return `maintenance-${Math.round(runtimeSec * 1000)}-${Date.parse(completedAt)}`
}

function isDuplicateCompletion(record: MaintenanceRecord | undefined, runtimeSec: number, completedAt: string): boolean {
  if (record === undefined || Math.abs(record.runtimeSec - runtimeSec) > DUPLICATE_RUNTIME_TOLERANCE_SEC) {
    return false
  }

  return Math.abs(Date.parse(record.completedAt) - Date.parse(completedAt)) <= DUPLICATE_TIME_WINDOW_MS
}

export function createMemoryMaintenanceRepository(initialLedger: MaintenanceLedger = emptyLedger()): MaintenanceRepository {
  let ledger = normalizeMaintenanceLedger(initialLedger)

  return {
    async load() {
      return structuredClone(ledger)
    },
    async complete(runtimeSec, completedAt = new Date().toISOString()) {
      const latestRecord = ledger.records[0]
      if (!isDuplicateCompletion(latestRecord, runtimeSec, completedAt)) {
        ledger = normalizeMaintenanceLedger({
          schemaVersion: MAINTENANCE_SCHEMA_VERSION,
          records: [
            {
              id: createRecordId(runtimeSec, completedAt),
              completedAt,
              runtimeSec,
            },
            ...ledger.records,
          ],
        })
      }
      return structuredClone(ledger)
    },
  }
}

export function createMoonrakerMaintenanceRepository(
  repositoryOptions: MaintenanceRepositoryOptions = {},
): MaintenanceRepository {
  const options = {
    baseUrl: repositoryOptions.baseUrl ?? moonrakerUrl,
    fetchImpl: repositoryOptions.fetchImpl ?? fetch.bind(globalThis),
    timeoutMs: repositoryOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  }
  const now = repositoryOptions.now ?? (() => new Date())

  async function load(): Promise<MaintenanceLedger> {
    const listResult = await requestMoonraker<MoonrakerDatabaseListResult>(
      '/server/database/list',
      options,
    )
    const namespaces = Array.isArray(listResult.namespaces)
      ? listResult.namespaces.filter((item): item is string => typeof item === 'string')
      : []

    if (!namespaces.includes(MAINTENANCE_NAMESPACE)) {
      return emptyLedger()
    }

    try {
      const item = await requestMoonraker<MoonrakerDatabaseItemResult>(
        `/server/database/item?namespace=${encodeURIComponent(MAINTENANCE_NAMESPACE)}&key=${encodeURIComponent(MAINTENANCE_KEY)}`,
        options,
      )
      return normalizeMaintenanceLedger(item.value)
    } catch (error) {
      if (isMissingItemError(error)) {
        return emptyLedger()
      }
      throw error
    }
  }

  return {
    load,
    async complete(runtimeSec, completedAt = now().toISOString()) {
      if (!Number.isFinite(runtimeSec) || runtimeSec < 0) {
        throw new Error('Пробег для технического обслуживания некорректен.')
      }
      if (!Number.isFinite(Date.parse(completedAt))) {
        throw new Error('Дата технического обслуживания некорректна.')
      }

      const currentLedger = await load()
      if (isDuplicateCompletion(currentLedger.records[0], runtimeSec, completedAt)) {
        return currentLedger
      }

      const nextLedger = normalizeMaintenanceLedger({
        schemaVersion: MAINTENANCE_SCHEMA_VERSION,
        records: [
          {
            id: createRecordId(runtimeSec, completedAt),
            completedAt,
            runtimeSec,
          },
          ...currentLedger.records,
        ],
      })
      const savedItem = await requestMoonraker<MoonrakerDatabaseItemResult>(
        '/server/database/item',
        options,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            namespace: MAINTENANCE_NAMESPACE,
            key: MAINTENANCE_KEY,
            value: nextLedger,
          }),
        },
      )

      return normalizeMaintenanceLedger(savedItem.value)
    },
  }
}
