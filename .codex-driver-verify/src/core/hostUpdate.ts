import { moonrakerUrl } from '../config'

type HostUpdateReleaseStatus = 'unknown' | 'latest' | 'available' | 'error' | 'mock'
export type HostUpdateTargetId = 'printer-ui' | 'printer-core'

export type HostUpdateReleaseResult = {
  id: string
  label: string
  currentVersion: string
  latestTag: string | null
  latestVersion: string | null
  status: HostUpdateReleaseStatus
  message: string
  canApply?: boolean
}

export type HostUpdateStatus = {
  available: boolean
  busy: boolean
  canApply: boolean
  message: string
  targetId: HostUpdateTargetId | null
  targetTag: string | null
  logPath: string | null
  releaseResults: HostUpdateReleaseResult[]
}

export type HostUpdateApplyArgs = {
  targetId: HostUpdateTargetId
  targetTag?: string | null
}

export type HostUpdateClient = {
  getStatus: () => Promise<HostUpdateStatus>
  check: () => Promise<HostUpdateStatus>
  apply: (args: HostUpdateApplyArgs) => Promise<HostUpdateStatus>
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
  'printer-ui': 'TreeD Printer UI',
  'printer-core': 'TreeD Printer Core',
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

  return {
    available: record.available === true,
    busy: record.busy === true,
    canApply: record.canApply === true,
    message: readString(record.message, 'Update status ready.'),
    targetId: readTargetId(record.targetId),
    targetTag: readNullableString(record.targetTag),
    logPath: readNullableString(record.logPath),
    releaseResults,
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.trim().length === 0) {
    return null
  }

  return JSON.parse(text) as unknown
}

function readMoonrakerErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const message = 'message' in body ? body.message : undefined
    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }

  return fallback
}

async function requestHostUpdateStatus(
  path: string,
  init: RequestInit,
  options: Required<MoonrakerHostUpdateClientOptions>,
  timeoutMs: number,
): Promise<HostUpdateStatus> {
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
      throw new MoonrakerHostUpdateError(
        readMoonrakerErrorMessage(body, `Moonraker update endpoint failed with HTTP ${response.status}`),
        response.status,
      )
    }

    return normalizeHostUpdateStatus(body)
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

export function isMoonrakerHostUpdateEndpointUnavailable(error: unknown): boolean {
  return (
    error instanceof MoonrakerHostUpdateError &&
    (error.status === 404 || error.status === 501)
  )
}

export function createMoonrakerHostUpdateClient(
  options: MoonrakerHostUpdateClientOptions = {},
): HostUpdateClient {
  const clientOptions = {
    moonrakerUrl: options.moonrakerUrl ?? moonrakerUrl,
    fetchImpl: options.fetchImpl ?? fetch.bind(globalThis),
  }

  return {
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
      return requestHostUpdateStatus(
        '/server/treed/update/apply',
        {
          body: JSON.stringify({ targetId: args.targetId, targetTag: args.targetTag ?? null }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
        clientOptions,
        HOST_UPDATE_APPLY_TIMEOUT_MS,
      )
    },
  }
}
