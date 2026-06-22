import { moonrakerUrl } from '../../config'
import {
  normalizeMoonrakerRuntimeSnapshot,
  type MoonrakerObjectsQueryPayload,
  type MoonrakerPrintFileInput,
  type MoonrakerPrintFileMetadata,
} from './moonrakerNormalizer'
import { subscribeToMoonrakerStatus } from './moonrakerWebSocketClient'
import { MOONRAKER_RUNTIME_OBJECTS } from './moonrakerRuntimeObjects'
import type { PrinterSnapshot, TransportClient } from './types'
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
  metadataFileLimit?: number
}

type MoonrakerFetchContext = Required<MoonrakerClientOptions> & {
  metadataCache: Map<string, MoonrakerPrintFileMetadata>
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

const DEFAULT_FETCH_TIMEOUT_MS = 8_000
const DEFAULT_METADATA_CONCURRENCY = 4
const DEFAULT_METADATA_FILE_LIMIT = 24

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

export const MOONRAKER_RUNTIME_OBJECTS_QUERY = `/printer/objects/query?${MOONRAKER_RUNTIME_OBJECTS
  .map((objectName) => encodeURIComponent(objectName))
  .join('&')}`

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

function getMetadataCacheKey(path: string, item: MoonrakerFileListItem): string {
  return `${path}|${item.modified ?? 'unknown'}|${item.size ?? 'unknown'}`
}

function clearFileMetadataCache(path: string, context: MoonrakerFetchContext): void {
  const prefix = `${path}|`
  for (const key of context.metadataCache.keys()) {
    if (key.startsWith(prefix)) {
      context.metadataCache.delete(key)
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
): Promise<MoonrakerPrintFileInput> {
  const path = getMoonrakerFilePath(item)

  if (!path.toLowerCase().endsWith('.gcode')) {
    return item
  }

  if (!shouldFetchMetadata) {
    return {
      ...item,
      path,
    }
  }

  const cacheKey = getMetadataCacheKey(path, item)
  const cachedMetadata = context.metadataCache.get(cacheKey)
  if (cachedMetadata !== undefined) {
    return {
      ...item,
      path,
      metadata: cachedMetadata,
    }
  }

  try {
    const metadata = await fetchMoonraker<MoonrakerPrintFileMetadata>(
      `/server/files/metadata?filename=${encodeURIComponent(path)}`,
      context,
    )
    context.metadataCache.set(cacheKey, metadata)

    return {
      ...item,
      path,
      metadata,
    }
  } catch {
    return {
      ...item,
      path,
    }
  }
}

async function fetchPrintFiles(context: MoonrakerFetchContext): Promise<MoonrakerPrintFileInput[]> {
  const items = await fetchMoonraker<MoonrakerFileListItem[]>('/server/files/list?root=gcodes', context)
  let metadataFileBudget = Math.max(0, context.metadataFileLimit)
  const plannedItems = items.map((item) => {
    const path = getMoonrakerFilePath(item)
    const shouldFetchMetadata = path.toLowerCase().endsWith('.gcode') && metadataFileBudget > 0
    if (shouldFetchMetadata) {
      metadataFileBudget -= 1
    }

    return {
      item,
      shouldFetchMetadata,
    }
  })

  return mapWithConcurrency(
    plannedItems,
    context.metadataConcurrency,
    ({ item, shouldFetchMetadata }) => fetchPrintFileWithMetadata(item, context, shouldFetchMetadata),
  )
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
    },
  )
}

export function createMoonrakerClient(options: MoonrakerClientOptions = {}): TransportClient {
  const context: MoonrakerFetchContext = {
    moonrakerUrl: options.moonrakerUrl ?? moonrakerUrl,
    fetchImpl: options.fetchImpl ?? fetch.bind(globalThis),
    fetchTimeoutMs: options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
    metadataConcurrency: options.metadataConcurrency ?? DEFAULT_METADATA_CONCURRENCY,
    metadataFileLimit: options.metadataFileLimit ?? DEFAULT_METADATA_FILE_LIMIT,
    metadataCache: new Map(),
  }

  return {
    async fetchSnapshot(): Promise<PrinterSnapshot> {
      const [objects, printFilesResult] = await Promise.all([
        fetchMoonraker<MoonrakerObjectsQueryPayload>(MOONRAKER_RUNTIME_OBJECTS_QUERY, context),
        fetchPrintFilesBestEffort(context),
      ])

      return normalizeMoonrakerRuntimeSnapshot(objects, {
        moonrakerUrl: context.moonrakerUrl,
        source: 'live',
        printFiles: printFilesResult.files,
        printFilesError: printFilesResult.error,
      })
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
    },
    subscribe(handlers) {
      return subscribeToMoonrakerStatus(handlers, { moonrakerUrl: context.moonrakerUrl })
    },
  }
}
