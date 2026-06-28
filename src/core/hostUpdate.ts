import { moonrakerUrl } from '../config'

type HostUpdateReleaseStatus = 'unknown' | 'latest' | 'available' | 'error' | 'mock'
export type HostUpdateTargetId = 'treed-shell' | 'treed-mainshellos'

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

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function readTargetId(value: unknown): HostUpdateTargetId | null {
  return value === 'treed-shell' || value === 'treed-mainshellos' ? value : null
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
    id,
    label,
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
): Promise<HostUpdateStatus> {
  const response = await options.fetchImpl(`${options.moonrakerUrl}${path}`, init)
  const body = await readJsonResponse(response)

  if (!response.ok) {
    throw new MoonrakerHostUpdateError(
      readMoonrakerErrorMessage(body, `Moonraker update endpoint failed with HTTP ${response.status}`),
      response.status,
    )
  }

  return normalizeHostUpdateStatus(body)
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
      return requestHostUpdateStatus('/server/treed/update/status', { method: 'GET' }, clientOptions)
    },
    check() {
      return requestHostUpdateStatus('/server/treed/update/check', { method: 'POST' }, clientOptions)
    },
    apply(args) {
      return requestHostUpdateStatus('/server/treed/update/apply', {
        body: JSON.stringify({ targetId: args.targetId, targetTag: args.targetTag ?? null }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }, clientOptions)
    },
  }
}
