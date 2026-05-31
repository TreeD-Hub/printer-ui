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

type MoonrakerResponse<T> = {
  result?: T
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
  fileMetadata?: Record<string, MoonrakerPrintFileMetadata>
}

type MoonrakerFileListItem = {
  path?: string
  filename?: string
  modified?: number
  size?: number
}

export const MOONRAKER_RUNTIME_OBJECTS_QUERY = `/printer/objects/query?${MOONRAKER_RUNTIME_OBJECTS
  .map((objectName) => encodeURIComponent(objectName))
  .join('&')}`

async function fetchMoonraker<T>(path: string): Promise<T> {
  const response = await fetch(`${moonrakerUrl}${path}`)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const payload = (await response.json()) as MoonrakerResponse<T>

  if (!payload.result) {
    throw new Error('Moonraker result is missing')
  }

  return payload.result
}

function getMoonrakerFilePath(item: MoonrakerFileListItem): string {
  return item.path ?? item.filename ?? ''
}

async function fetchPrintFileWithMetadata(item: MoonrakerFileListItem): Promise<MoonrakerPrintFileInput> {
  const path = getMoonrakerFilePath(item)

  if (!path.toLowerCase().endsWith('.gcode')) {
    return item
  }

  try {
    const metadata = await fetchMoonraker<MoonrakerPrintFileMetadata>(
      `/server/files/metadata?filename=${encodeURIComponent(path)}`,
    )

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

async function fetchPrintFiles(): Promise<MoonrakerPrintFileInput[]> {
  const items = await fetchMoonraker<MoonrakerFileListItem[]>('/server/files/list?root=gcodes')

  return Promise.all(items.map(fetchPrintFileWithMetadata))
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
    },
  )
}

export function createMoonrakerClient(): TransportClient {
  return {
    async fetchSnapshot(): Promise<PrinterSnapshot> {
      const [objects, printFiles] = await Promise.all([
        fetchMoonraker<MoonrakerObjectsQueryPayload>(MOONRAKER_RUNTIME_OBJECTS_QUERY),
        fetchPrintFiles(),
      ])

      return normalizeMoonrakerRuntimeSnapshot(objects, { moonrakerUrl, source: 'live', printFiles })
    },
    subscribe(handlers) {
      return subscribeToMoonrakerStatus(handlers, { moonrakerUrl })
    },
  }
}
