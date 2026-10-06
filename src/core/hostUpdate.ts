import { moonrakerUrl } from '../config'

type HostUpdateReleaseStatus = 'unknown' | 'latest' | 'available' | 'error' | 'mock'
export type HostUpdateTargetId = 'printer-ui' | 'printer-core'
export type HostUpdateOperationStatus =
  | 'queued' | 'running' | 'validating' | 'downloading' | 'installing' | 'restarting'
  | 'verifying' | 'rolling_back' | 'complete' | 'applied' | 'error' | 'rolled_back' | 'rejected' | 'busy'
export type HostUpdateOperationPhase =
  | 'queued' | 'validating' | 'downloading' | 'installing' | 'restarting'
  | 'verifying' | 'rolling_back' | 'complete' | 'unknown'

export type HostUpdateOperation = {
  operationId: string | null
  requestId: string | null
  status: HostUpdateOperationStatus
  phase: HostUpdateOperationPhase
  progress: number | null
  resultCode: string | null
  message: string
  targetId: HostUpdateTargetId | null
  targetTag: string | null
  startedAt: string | null
  updatedAt: string | null
  finishedAt: string | null
}

export type HostUpdateReleaseResult = {
  id: string
  label: string
  currentVersion: string
  latestTag: string | null
  latestVersion: string | null
  status: HostUpdateReleaseStatus
  message: string
  canApply?: boolean
  capability?: { supported: boolean; reasonCode: string | null; reason: string | null }
}

export type HostConfigConflict = { path: string; sha256: string }

export type HostUpdateStatus = {
  available: boolean
  supportsCombinedUpdate?: boolean
  supportsConfigReset?: boolean
  configConflicts?: HostConfigConflict[]
  busy: boolean
  canApply: boolean
  canResetOverrides?: boolean
  message: string
  targetId: HostUpdateTargetId | null
  targetTag: string | null
  logPath: string | null
  releaseResults: HostUpdateReleaseResult[]
  operation?: HostUpdateOperation | null
  latestOperation?: HostUpdateOperation | null
  history?: HostUpdateOperation[]
}

export type HostUpdateApplyArgs = {
  targetId: HostUpdateTargetId
  targetTag?: string | null
  uiTargetTag?: string
  requestId?: string
  cancelPausedPrint?: boolean
  resetConfigs?: HostConfigConflict[]
}

export type HostUpdateClient = {
  getStatus: () => Promise<HostUpdateStatus>
  check: () => Promise<HostUpdateStatus>
  apply: (args: HostUpdateApplyArgs) => Promise<HostUpdateStatus>
  resetOverrides?: () => Promise<HostSettingsResetResult>
}

export type HostSettingsResetResult = {
  reset: boolean
  restartRequired: boolean
  backupPath: string | null
  message: string
}

export class MoonrakerHostUpdateError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MoonrakerHostUpdateError'
    this.status = status
  }
}

type MoonrakerHostUpdateClientOptions = {
  moonrakerUrl?: string
  fetchImpl?: typeof fetch
}

const HOST_UPDATE_STATUS_TIMEOUT_MS = 30_000
const HOST_UPDATE_CHECK_TIMEOUT_MS = 30_000
const HOST_UPDATE_APPLY_TIMEOUT_MS = 10_000
const HOST_UPDATE_TARGET_ALIASES: Record<string, HostUpdateTargetId> = {
  'printer-ui': 'printer-ui',
  'treed-shell': 'printer-ui',
  'printer-core': 'printer-core',
  'treed-mainshellos': 'printer-core',
}
const HOST_UPDATE_TARGET_LABELS: Record<HostUpdateTargetId, string> = {
  'printer-ui': 'Интерфейс TreeD',
  'printer-core': 'Система TreeD',
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function readTargetId(value: unknown): HostUpdateTargetId | null {
  if (typeof value !== 'string') {
    return null
  }

  return HOST_UPDATE_TARGET_ALIASES[value] ?? null
}

function normalizeReleaseId(value: string): string {
  return HOST_UPDATE_TARGET_ALIASES[value] ?? value
}

function normalizeReleaseLabel(id: string, label: string): string {
  const targetId = readTargetId(id)
  return targetId === null ? label : HOST_UPDATE_TARGET_LABELS[targetId]
}

function normalizeReleaseResult(value: unknown): HostUpdateReleaseResult | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const record = value as Record<string, unknown>
  const id = readString(record.id, '')
  const label = readString(record.label, '')
  const currentVersion = readString(record.currentVersion, 'unknown')
  const status = record.status

  if (!id || !label || (
    status !== 'unknown' &&
    status !== 'latest' &&
    status !== 'available' &&
    status !== 'error' &&
    status !== 'mock'
  )) {
    return null
  }

  return {
    id: normalizeReleaseId(id),
    label: normalizeReleaseLabel(id, label),
    currentVersion,
    latestTag: readNullableString(record.latestTag),
    latestVersion: readNullableString(record.latestVersion),
    status,
    message: readString(record.message, 'Нет данных.'),
    canApply: record.canApply === true,
    capability: typeof record.capability === 'object' && record.capability !== null
      ? {
          supported: (record.capability as Record<string, unknown>).supported === true,
          reasonCode: readNullableString((record.capability as Record<string, unknown>).reasonCode),
          reason: readNullableString((record.capability as Record<string, unknown>).reason),
        }
      : undefined,
  }
}

function normalizeHostUpdateStatus(value: unknown): HostUpdateStatus {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Moonraker update endpoint returned invalid status.')
  }

  const record = value as Record<string, unknown>
  const releaseResults = Array.isArray(record.releaseResults)
    ? record.releaseResults.map(normalizeReleaseResult).filter((item): item is HostUpdateReleaseResult => item !== null)
    : []
  const operation = normalizeHostUpdateOperation(record.operation) ?? normalizeHostUpdateOperation(record)
  const latestOperation = normalizeHostUpdateOperation(record.latestOperation)
  const history = Array.isArray(record.history)
    ? record.history.map(normalizeHostUpdateOperation).filter((item): item is HostUpdateOperation => item !== null)
    : []
  const operationIsActive = operation !== null && !['applied', 'error', 'rolled_back', 'rejected'].includes(operation.status)

  return {
    available: record.available === true,
    supportsCombinedUpdate: record.supportsCombinedUpdate === true,
    supportsConfigReset: record.supportsConfigReset === true,
    configConflicts: Array.isArray(record.configConflicts) ? record.configConflicts.filter(
      (row): row is HostConfigConflict => typeof row === 'object' && row !== null &&
        typeof row.path === 'string' && typeof row.sha256 === 'string' && /^[0-9a-f]{64}$/.test(row.sha256),
    ) : [],
    busy: record.busy === true || operationIsActive,
    canApply: record.canApply === true,
    canResetOverrides: record.canResetOverrides === true,
    message: readString(record.message, 'Состояние обновлений получено.'),
    targetId: readTargetId(record.targetId) ?? operation?.targetId ?? null,
    targetTag: readNullableString(record.targetTag) ?? operation?.targetTag ?? null,
    logPath: readNullableString(record.logPath),
    releaseResults,
    operation,
    latestOperation,
    history,
  }
}

function normalizeHostUpdateOperation(value: unknown): HostUpdateOperation | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const status = record.status
  const phase = record.phase
  const validStatuses: HostUpdateOperationStatus[] = [
    'queued', 'running', 'validating', 'downloading', 'installing', 'restarting',
    'verifying', 'rolling_back', 'complete', 'applied', 'error', 'rolled_back', 'rejected', 'busy',
  ]
  const validPhases: HostUpdateOperationPhase[] = ['queued', 'validating', 'downloading', 'installing', 'restarting', 'verifying', 'rolling_back', 'complete', 'unknown']
  if (typeof status !== 'string' || !validStatuses.includes(status as HostUpdateOperationStatus)) return null
  const numericProgress = typeof record.progress === 'number' && Number.isFinite(record.progress)
    ? Math.max(0, Math.min(100, record.progress))
    : null
  return {
    operationId: readNullableString(record.operationId),
    requestId: readNullableString(record.requestId),
    status: status as HostUpdateOperationStatus,
    phase: typeof phase === 'string' && validPhases.includes(phase as HostUpdateOperationPhase)
      ? phase as HostUpdateOperationPhase
      : 'unknown',
    progress: numericProgress,
    resultCode: readNullableString(record.resultCode),
    message: readString(record.message, 'Состояние операции получено.'),
    targetId: readTargetId(record.targetId),
    targetTag: readNullableString(record.targetTag),
    startedAt: readNullableString(record.startedAt),
    updatedAt: readNullableString(record.updatedAt),
    finishedAt: readNullableString(record.finishedAt),
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.trim().length === 0) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    if (response.ok) throw error
    return null
  }
}

function readMoonrakerErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const error = 'error' in body && typeof body.error === 'object' && body.error !== null
      ? body.error
      : body
    const message = 'message' in error ? error.message : undefined
    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }

  return fallback
}

async function requestHostUpdateJson(
  path: string,
  init: RequestInit,
  options: Required<MoonrakerHostUpdateClientOptions>,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController()
  let didTimeout = false
  const timeoutId = setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await options.fetchImpl(`${options.moonrakerUrl}${path}`, {
      ...init,
      signal: controller.signal,
    })
    const body = await readJsonResponse(response)

    if (!response.ok) {
      const fallback = response.status === 403
        ? 'Нет доступа к системным функциям принтера (HTTP 403). Проверьте настройку подключения интерфейса.'
        : `Moonraker update endpoint failed with HTTP ${response.status}`
      throw new MoonrakerHostUpdateError(
        readMoonrakerErrorMessage(body, fallback),
        response.status,
      )
    }

    return body
  } catch (error) {
    if (didTimeout || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new MoonrakerHostUpdateError(
        `Moonraker update endpoint timed out after ${timeoutMs}ms`,
        408,
      )
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function requestHostUpdateStatus(
  path: string,
  init: RequestInit,
  options: Required<MoonrakerHostUpdateClientOptions>,
  timeoutMs: number,
): Promise<HostUpdateStatus> {
  return normalizeHostUpdateStatus(await requestHostUpdateJson(path, init, options, timeoutMs))
}

export function isHostUpdateRequestRejected(error: unknown): boolean {
  return error instanceof MoonrakerHostUpdateError &&
    error.status >= 400 && error.status < 500 && error.status !== 408
}

export function isMoonrakerHostUpdateEndpointUnavailable(error: unknown): boolean {
  return (
    error instanceof MoonrakerHostUpdateError &&
    (error.status === 404 || error.status === 501)
  )
}

export function getHostUpdateErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof MoonrakerHostUpdateError) {
    if (error.status === 403) return error.message
    if (error.status === 408) return 'Служба обновлений не ответила вовремя. Проверяем состояние операции.'
    if (error.status === 409) return error.message
    if (error.status >= 500) return 'Служба обновлений сообщила об ошибке. Повторите попытку позже.'
    if (error.status === 404 || error.status === 501) return 'Служба обновлений недоступна на этом принтере.'
  }
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return 'Нет связи со службой обновлений. Проверьте соединение с принтером.'
  }
  return fallback
}

export function createMoonrakerHostUpdateClient(
  options: MoonrakerHostUpdateClientOptions = {},
): HostUpdateClient {
  const clientOptions = {
    moonrakerUrl: options.moonrakerUrl ?? moonrakerUrl,
    fetchImpl: options.fetchImpl ?? fetch.bind(globalThis),
  }

  return {
    async resetOverrides() {
      const body = await requestHostUpdateJson(
        '/server/treed/settings/reset',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) },
        clientOptions,
        HOST_UPDATE_STATUS_TIMEOUT_MS,
      )
      if (typeof body !== 'object' || body === null || !('reset' in body) || body.reset !== true) {
        throw new Error('Служба не подтвердила сброс настроек.')
      }
      const record = body as Record<string, unknown>
      return {
        reset: true,
        restartRequired: record.restartRequired !== false,
        backupPath: readNullableString(record.backupPath),
        message: readString(record.message, 'Настройки сброшены. Перезапустите Klipper для применения.'),
      }
    },
    getStatus() {
      return requestHostUpdateStatus(
        '/server/treed/update/status',
        { method: 'GET' },
        clientOptions,
        HOST_UPDATE_STATUS_TIMEOUT_MS,
      )
    },
    check() {
      return requestHostUpdateStatus(
        '/server/treed/update/check',
        { method: 'POST' },
        clientOptions,
        HOST_UPDATE_CHECK_TIMEOUT_MS,
      )
    },
    apply(args) {
      const requestId = args.requestId ?? globalThis.crypto.randomUUID()
      return requestHostUpdateStatus(
        '/server/treed/update/apply',
        {
          body: JSON.stringify({ requestId, targetId: args.targetId, targetTag: args.targetTag ?? null,
            ...(args.uiTargetTag ? { uiTargetTag: args.uiTargetTag } : {}),
            ...(args.resetConfigs?.length ? { resetConfigs: args.resetConfigs } : {}),
            ...(args.cancelPausedPrint ? { cancelPausedPrint: true } : {}) }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
        clientOptions,
        HOST_UPDATE_APPLY_TIMEOUT_MS,
      )
    },
  }
}
