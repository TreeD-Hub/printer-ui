import { moonrakerUrl } from '../../config'
import {
  normalizeMoonrakerRuntimeSnapshot,
  type MoonrakerObjectsQueryPayload,
  type MoonrakerPrintFileInput,
  type MoonrakerPrintFileMetadata,
} from './moonrakerNormalizer'
import { subscribeToMoonrakerStatus } from './moonrakerWebSocketClient'
import { MOONRAKER_RUNTIME_OBJECTS } from './moonrakerRuntimeObjects'
import type {
  FilamentSensorSnapshot,
  PrinterEddyStateSnapshot,
  PrinterExcludeObjectSnapshot,
  PrinterMotionStateSnapshot,
  PrinterPrintFilesMetadataSnapshot,
  PrinterPrintFilesStateSnapshot,
  PrinterPrintJobStateSnapshot,
  PrinterSnapshot,
  PrinterUsageSnapshot,
  TransportClient,
} from './types'
import { normalizePrinterFilePath } from '@treed/printer-logic'

type MoonrakerResponse<T> = {
  result?: T
  error?: {
    message?: string
  }
}

type MoonrakerTransportErrorKind = 'http' | 'timeout' | 'invalid-result'

type MoonrakerClientOptions = {
  moonrakerUrl?: string
  fetchImpl?: typeof fetch
  fetchTimeoutMs?: number
  metadataConcurrency?: number
}

type MoonrakerFetchContext = Required<MoonrakerClientOptions> & {
  metadataCache: Map<string, MoonrakerPrintFileMetadata>
  metadataInFlight: Map<string, Promise<MoonrakerPrintFileMetadata>>
  invalidatedMetadataRequests: WeakSet<Promise<MoonrakerPrintFileMetadata>>
  fileIdentityCache: Map<string, MoonrakerFileListItem>
  usageCache: PrinterUsageSnapshot | null
  usageExpiresAtMs: number
}

type NormalizeMoonrakerSnapshotInput = {
  source?: 'mock' | 'live'
  moonrakerUrl?: string
  nowIso?: string
  info?: {
    state?: string
  }
  objects?: MoonrakerObjectsQueryPayload
  files?: MoonrakerPrintFileInput[]
  filesError?: string | null
  fileMetadata?: Record<string, MoonrakerPrintFileMetadata>
  usage?: PrinterUsageSnapshot
}

type PrintFilesFetchResult = {
  files: MoonrakerPrintFileInput[]
  error: string | null
}

type MoonrakerFileListItem = {
  path?: string
  filename?: string
  modified?: number
  size?: number
}

type MoonrakerHistoryTotalsResponse = {
  job_totals?: {
    total_jobs?: number
    total_time?: number
    total_print_time?: number
    total_filament_used?: number
    longest_job?: number
    longest_print?: number
  }
}

const DEFAULT_FETCH_TIMEOUT_MS = 8_000
const DEFAULT_METADATA_CONCURRENCY = 4
const DEFAULT_USAGE_CACHE_TTL_MS = 5 * 60 * 1000

export class MoonrakerTransportError extends Error {
  readonly kind: MoonrakerTransportErrorKind
  readonly status?: number

  constructor(kind: MoonrakerTransportErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'MoonrakerTransportError'
    this.kind = kind
    this.status = status
  }
}

function buildMoonrakerObjectsQuery(objectNames: readonly string[]): string {
  return `/printer/objects/query?${objectNames
    .map((objectName) => encodeURIComponent(objectName))
    .join('&')}`
}

export const MOONRAKER_RUNTIME_OBJECTS_QUERY = buildMoonrakerObjectsQuery(MOONRAKER_RUNTIME_OBJECTS)

const MOONRAKER_FILAMENT_SENSOR_OBJECTS = [
  'filament_switch_sensor filament_switch',
  'filament_motion_sensor filament_motion',
  'gcode_macro FILAMENT_SENSOR_STATUS',
  'gcode_macro _FILAMENT_SENSOR_SENSITIVITY_STATE',
] as const

const MOONRAKER_EDDY_STATE_OBJECTS = [
  'webhooks',
  'toolhead',
  'save_variables',
  'gcode_macro _TREED_EDDY_Z_OFFSET_AUTOSAVE_STATE',
] as const

const MOONRAKER_PRINT_JOB_OBJECTS = [
  'webhooks',
  'print_stats',
  'virtual_sdcard',
  'display_status',
  'pause_resume',
  'exclude_object',
] as const

const MOONRAKER_MOTION_STATE_OBJECTS = [
  'webhooks',
  'toolhead',
  'gcode_move',
  'gcode_macro _TREED_GEOMETRY_CFG',
] as const

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function parseMoonrakerError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as MoonrakerResponse<unknown>
    if (payload.error?.message) {
      return payload.error.message
    }
  } catch {
    // Fall back to HTTP status below.
  }

  return `HTTP ${response.status}`
}

async function fetchMoonraker<T>(
  path: string,
  context: MoonrakerFetchContext,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController()
  let didTimeout = false
  const timeoutId = window.setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, context.fetchTimeoutMs)
  let response: Response

  try {
    response = await context.fetchImpl(`${context.moonrakerUrl}${path}`, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (didTimeout || isAbortError(error)) {
      throw new MoonrakerTransportError('timeout', `Moonraker request timed out after ${context.fetchTimeoutMs}ms`)
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }

  if (!response.ok) {
    throw new MoonrakerTransportError('http', await parseMoonrakerError(response), response.status)
  }

  const payload = (await response.json()) as MoonrakerResponse<T>

  if (payload.result === undefined) {
    throw new MoonrakerTransportError('invalid-result', 'Moonraker result is missing')
  }

  return payload.result
}

function getMoonrakerFilePath(item: MoonrakerFileListItem): string {
  return item.path ?? item.filename ?? ''
}

function toNullableNonNegativeNumber(value: unknown): number | null {
  const numericValue = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : null
}

function createUnavailableUsageSnapshot(message: string): PrinterUsageSnapshot {
  return {
    totalPrintTimeSec: null,
    totalJobTimeSec: null,
    totalJobs: null,
    totalFilamentUsedMm: null,
    longestPrintSec: null,
    updatedAt: null,
    state: 'unavailable',
    message,
  }
}

function normalizeHistoryTotals(result: MoonrakerHistoryTotalsResponse, updatedAt: string): PrinterUsageSnapshot {
  const totals = result.job_totals

  return {
    totalPrintTimeSec: toNullableNonNegativeNumber(totals?.total_print_time),
    totalJobTimeSec: toNullableNonNegativeNumber(totals?.total_time),
    totalJobs: toNullableNonNegativeNumber(totals?.total_jobs),
    totalFilamentUsedMm: toNullableNonNegativeNumber(totals?.total_filament_used),
    longestPrintSec: toNullableNonNegativeNumber(totals?.longest_print),
    updatedAt,
    state: 'ready',
    message: null,
  }
}

function getMetadataCacheKey(path: string, item: MoonrakerFileListItem): string {
  return `${path}|${item.modified ?? 'unknown'}|${item.size ?? 'unknown'}`
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function clearFileMetadataCache(path: string, context: MoonrakerFetchContext): void {
  const prefix = `${path}|`
  for (const key of context.metadataCache.keys()) {
    if (key.startsWith(prefix)) {
      context.metadataCache.delete(key)
    }
  }

  for (const [key, request] of context.metadataInFlight) {
    if (key.startsWith(prefix)) {
      context.invalidatedMetadataRequests.add(request)
      context.metadataInFlight.delete(key)
    }
  }
}

function sortFileListByModifiedDesc(items: MoonrakerFileListItem[]): MoonrakerFileListItem[] {
  return [...items].sort((left, right) => {
    const leftModified = typeof left.modified === 'number' && Number.isFinite(left.modified) ? left.modified : 0
    const rightModified = typeof right.modified === 'number' && Number.isFinite(right.modified) ? right.modified : 0

    return rightModified - leftModified
  })
}

function syncFileListItems(items: readonly MoonrakerFileListItem[], context: MoonrakerFetchContext): void {
  const nextItems = new Map<string, MoonrakerFileListItem>()
  const validMetadataKeys = new Set<string>()

  for (const item of items) {
    const path = normalizePrinterFilePath(getMoonrakerFilePath(item))
    if (path.length === 0) {
      continue
    }

    const normalizedItem = {
      ...item,
      path,
    }
    nextItems.set(path, normalizedItem)
    validMetadataKeys.add(getMetadataCacheKey(path, normalizedItem))
  }

  context.fileIdentityCache.clear()
  for (const [path, item] of nextItems) {
    context.fileIdentityCache.set(path, item)
  }

  for (const key of context.metadataCache.keys()) {
    if (!validMetadataKeys.has(key)) {
      context.metadataCache.delete(key)
    }
  }

  for (const [key, request] of context.metadataInFlight) {
    if (!validMetadataKeys.has(key)) {
      context.invalidatedMetadataRequests.add(request)
      context.metadataInFlight.delete(key)
    }
  }
}

async function loadPrintFileMetadata(
  item: MoonrakerFileListItem,
  context: MoonrakerFetchContext,
): Promise<MoonrakerPrintFileInput | null> {
  const path = normalizePrinterFilePath(getMoonrakerFilePath(item))
  const cacheKey = getMetadataCacheKey(path, item)
  const cachedMetadata = context.metadataCache.get(cacheKey)
  if (cachedMetadata !== undefined) {
    return {
      ...item,
      path,
      metadata: cachedMetadata,
      metadataStatus: 'ready',
    }
  }

  let metadataPromise = context.metadataInFlight.get(cacheKey)
  if (metadataPromise === undefined) {
    metadataPromise = fetchMoonraker<MoonrakerPrintFileMetadata>(
      `/server/files/metadata?filename=${encodeURIComponent(path)}`,
      context,
    )
    context.metadataInFlight.set(cacheKey, metadataPromise)
  }

  try {
    const metadata = await metadataPromise
    if (context.invalidatedMetadataRequests.has(metadataPromise)) {
      return null
    }

    const currentItem = context.fileIdentityCache.get(path)
    if (currentItem !== undefined && getMetadataCacheKey(path, currentItem) === cacheKey) {
      context.metadataCache.set(cacheKey, metadata)
    }

    return {
      ...item,
      path,
      metadata,
      metadataStatus: 'ready',
    }
  } catch (error) {
    const message = getErrorMessage(error)
    console.warn(`[treed-runtime] metadata unavailable for ${path}: ${message}`)
    return {
      ...item,
      path,
      metadataStatus: 'error',
      metadataError: message,
    }
  } finally {
    if (context.metadataInFlight.get(cacheKey) === metadataPromise) {
      context.metadataInFlight.delete(cacheKey)
    }
  }
}

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length)
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(limit, items.length))
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      const item = items[currentIndex]
      if (item !== undefined) {
        results[currentIndex] = await mapper(item)
      }
    }
  })

  await Promise.all(workers)

  return results
}

async function fetchPrintFileWithMetadata(
  item: MoonrakerFileListItem,
  context: MoonrakerFetchContext,
  shouldFetchMetadata = true,
): Promise<MoonrakerPrintFileInput | null> {
  const path = getMoonrakerFilePath(item)

  if (!path.toLowerCase().endsWith('.gcode')) {
    return item
  }

  if (!shouldFetchMetadata) {
    return {
      ...item,
      path,
      metadataStatus: 'idle',
    }
  }

  return loadPrintFileMetadata(item, context)
}

async function fetchPrintFiles(context: MoonrakerFetchContext): Promise<MoonrakerPrintFileInput[]> {
  const items = await fetchMoonraker<MoonrakerFileListItem[]>('/server/files/list?root=gcodes', context)
  const sortedItems = sortFileListByModifiedDesc(items)
  syncFileListItems(sortedItems, context)

  return sortedItems.map((item) => {
    const path = getMoonrakerFilePath(item)
    return path.toLowerCase().endsWith('.gcode')
      ? { ...item, path, metadataStatus: 'idle' }
      : item
  })
}

async function fetchPrintFileMetadataState(
  paths: string[],
  context: MoonrakerFetchContext,
): Promise<PrinterPrintFilesMetadataSnapshot> {
  const seenPaths = new Set<string>()
  const items: MoonrakerFileListItem[] = []
  for (const rawPath of paths) {
    const path = normalizePrinterFilePath(rawPath)
    if (path.length === 0 || seenPaths.has(path)) {
      continue
    }

    const item = context.fileIdentityCache.get(path)
    if (item === undefined) {
      continue
    }

    seenPaths.add(path)
    items.push(item)
  }

  const loadedFiles = await mapWithConcurrency(
    items,
    context.metadataConcurrency,
    (item) => fetchPrintFileWithMetadata(item, context, true),
  )
  const files = loadedFiles.filter((item): item is MoonrakerPrintFileInput => {
    if (item === null) {
      return false
    }

    const currentItem = context.fileIdentityCache.get(item.path ?? '')
    return currentItem !== undefined
      && getMetadataCacheKey(item.path ?? '', currentItem) === getMetadataCacheKey(item.path ?? '', item)
  })
  const snapshot = normalizeMoonrakerRuntimeSnapshot({ status: {} }, {
    moonrakerUrl: context.moonrakerUrl,
    source: 'live',
    printFiles: files,
  })

  return {
    printFiles: snapshot.printFiles,
    revisions: snapshot.revisions,
  }
}

async function fetchPrintFilesBestEffort(context: MoonrakerFetchContext): Promise<PrintFilesFetchResult> {
  try {
    return { files: await fetchPrintFiles(context), error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[treed-runtime] file list unavailable', message)
    return { files: [], error: message }
  }
}

async function fetchHistoryTotalsBestEffort(
  context: MoonrakerFetchContext,
  forceRefresh = false,
): Promise<PrinterUsageSnapshot> {
  const nowMs = Date.now()
  if (!forceRefresh && context.usageCache !== null && nowMs < context.usageExpiresAtMs) {
    return context.usageCache
  }

  try {
    const result = await fetchMoonraker<MoonrakerHistoryTotalsResponse>('/server/history/totals', context)
    const usage = normalizeHistoryTotals(result, new Date(nowMs).toISOString())
    context.usageCache = usage
    context.usageExpiresAtMs = nowMs + DEFAULT_USAGE_CACHE_TTL_MS
    return usage
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[treed-runtime] history totals unavailable', message)
    return context.usageCache ?? createUnavailableUsageSnapshot(message)
  }
}

async function fetchObjectsSnapshot(
  context: MoonrakerFetchContext,
  objectNames: readonly string[],
): Promise<PrinterSnapshot> {
  const objects = await fetchMoonraker<MoonrakerObjectsQueryPayload>(
    buildMoonrakerObjectsQuery(objectNames),
    context,
  )

  return normalizeMoonrakerRuntimeSnapshot(objects, {
    moonrakerUrl: context.moonrakerUrl,
    source: 'live',
  })
}

export function normalizeMoonrakerSnapshot(input: NormalizeMoonrakerSnapshotInput): PrinterSnapshot {
  const status = input.objects?.status ?? {}
  const files = (input.files ?? []).map((file) => {
    const path = getMoonrakerFilePath(file)

    return {
      ...file,
      path,
      metadata: file.metadata ?? input.fileMetadata?.[path],
    }
  })

  return normalizeMoonrakerRuntimeSnapshot(
    {
      ...input.objects,
      status: {
        ...status,
        webhooks: {
          state: input.objects?.status?.webhooks?.state ?? input.info?.state,
          state_message: input.objects?.status?.webhooks?.state_message,
        },
      },
    },
    {
      source: input.source ?? 'live',
      moonrakerUrl: input.moonrakerUrl,
      nowIso: input.nowIso,
      printFiles: files,
      printFilesError: input.filesError,
      usage: input.usage,
    },
  )
}

export function createMoonrakerClient(options: MoonrakerClientOptions = {}): TransportClient {
  const context: MoonrakerFetchContext = {
    moonrakerUrl: options.moonrakerUrl ?? moonrakerUrl,
    fetchImpl: options.fetchImpl ?? fetch.bind(globalThis),
    fetchTimeoutMs: options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
    metadataConcurrency: options.metadataConcurrency ?? DEFAULT_METADATA_CONCURRENCY,
    metadataCache: new Map(),
    metadataInFlight: new Map(),
    invalidatedMetadataRequests: new WeakSet(),
    fileIdentityCache: new Map(),
    usageCache: null,
    usageExpiresAtMs: 0,
  }

  return {
    async fetchSnapshot(): Promise<PrinterSnapshot> {
      const [objects, printFilesResult, usage] = await Promise.all([
        fetchMoonraker<MoonrakerObjectsQueryPayload>(MOONRAKER_RUNTIME_OBJECTS_QUERY, context),
        fetchPrintFilesBestEffort(context),
        fetchHistoryTotalsBestEffort(context),
      ])

      return normalizeMoonrakerRuntimeSnapshot(objects, {
        moonrakerUrl: context.moonrakerUrl,
        source: 'live',
        printFiles: printFilesResult.files,
        printFilesError: printFilesResult.error,
        usage,
      })
    },
    async fetchRuntimeSnapshot(): Promise<PrinterSnapshot> {
      return fetchObjectsSnapshot(context, MOONRAKER_RUNTIME_OBJECTS)
    },
    async fetchUsage(): Promise<PrinterUsageSnapshot> {
      return fetchHistoryTotalsBestEffort(context, true)
    },
    async fetchFilamentSensor(): Promise<FilamentSensorSnapshot> {
      const snapshot = await fetchObjectsSnapshot(context, MOONRAKER_FILAMENT_SENSOR_OBJECTS)

      return snapshot.filamentSensor
    },
    async fetchEddyState(): Promise<PrinterEddyStateSnapshot> {
      const snapshot = await fetchObjectsSnapshot(context, MOONRAKER_EDDY_STATE_OBJECTS)

      return {
        autosaveEnabled: snapshot.v2.eddy.autosaveEnabled,
        autosavePending: snapshot.v2.eddy.autosavePending,
        calibration: snapshot.v2.eddy.calibration,
      }
    },
    async fetchExcludeObjects(): Promise<PrinterExcludeObjectSnapshot> {
      const snapshot = await fetchObjectsSnapshot(context, MOONRAKER_PRINT_JOB_OBJECTS)

      return snapshot.excludeObjects
    },
    async fetchPrintJobState(): Promise<PrinterPrintJobStateSnapshot> {
      const snapshot = await fetchObjectsSnapshot(context, MOONRAKER_PRINT_JOB_OBJECTS)

      return {
        excludeObjects: snapshot.excludeObjects,
        files: snapshot.files,
        message: snapshot.message,
        printJob: snapshot.printJob,
        state: snapshot.state,
        updatedAt: snapshot.updatedAt,
      }
    },
    async fetchPrintFilesState(): Promise<PrinterPrintFilesStateSnapshot> {
      const printFilesResult = await fetchPrintFilesBestEffort(context)
      const snapshot = normalizeMoonrakerRuntimeSnapshot({ status: {} }, {
        moonrakerUrl: context.moonrakerUrl,
        source: 'live',
        printFiles: printFilesResult.files,
        printFilesError: printFilesResult.error,
      })

      return {
        fileList: snapshot.fileList,
        printFiles: snapshot.printFiles,
        revisions: snapshot.revisions,
      }
    },
    async fetchPrintFileMetadata(paths: string[]): Promise<PrinterPrintFilesMetadataSnapshot> {
      return fetchPrintFileMetadataState(paths, context)
    },
    async fetchMotionState(): Promise<PrinterMotionStateSnapshot> {
      const snapshot = await fetchObjectsSnapshot(context, MOONRAKER_MOTION_STATE_OBJECTS)

      return {
        eddyStatus: snapshot.v2.eddy.status,
        geometry: snapshot.geometry,
        homedAxes: snapshot.homedAxes,
        message: snapshot.message,
        state: snapshot.state,
        toolhead: snapshot.toolhead,
        toolheadX: snapshot.toolheadX,
        toolheadY: snapshot.toolheadY,
        toolheadZ: snapshot.toolheadZ,
        updatedAt: snapshot.updatedAt,
      }
    },
    async deletePrintFile(path: string): Promise<void> {
      const normalizedPath = normalizePrinterFilePath(path)
      if (!normalizedPath.toLowerCase().endsWith('.gcode')) {
        throw new Error('Удалять через UI можно только G-code файлы.')
      }

      const encodedPath = normalizedPath.split('/').map(encodeURIComponent).join('/')
      await fetchMoonraker<unknown>(`/server/files/gcodes/${encodedPath}`, context, {
        method: 'DELETE',
      })
      clearFileMetadataCache(normalizedPath, context)
      context.fileIdentityCache.delete(normalizedPath)
    },
    subscribe(handlers) {
      return subscribeToMoonrakerStatus(handlers, { moonrakerUrl: context.moonrakerUrl })
    },
  }
}
