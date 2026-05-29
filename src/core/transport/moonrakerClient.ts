import { moonrakerUrl } from '../../config'
import type { PrinterSnapshot, TransportClient } from './types'

type MoonrakerResponse<T> = {
  result?: T
}

type PrinterInfoResult = {
  state?: string
}

type ObjectsQueryResult = {
  status?: {
    toolhead?: {
      position?: [number, number, number]
      homed_axes?: string
    }
    extruder?: {
      temperature?: number
    }
    heater_bed?: {
      temperature?: number
    }
    fan?: {
      speed?: number
    }
    print_stats?: {
      state?: string
    }
  }
}

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

export function createMoonrakerClient(): TransportClient {
  return {
    async fetchSnapshot(): Promise<PrinterSnapshot> {
      const endpointHost = (() => {
        try {
          return new URL(moonrakerUrl).hostname || 'unknown'
        } catch {
          return 'unknown'
        }
      })()
      const [info, objects] = await Promise.all([
        fetchMoonraker<PrinterInfoResult>('/printer/info'),
        fetchMoonraker<ObjectsQueryResult>(
          '/printer/objects/query?toolhead&extruder&heater_bed&fan&print_stats',
        ),
      ])

      const state = objects.status?.print_stats?.state ?? info.state ?? 'unknown'
      const toolheadPosition = objects.status?.toolhead?.position ?? [0, 0, 0]

      return {
        source: 'live',
        connection: 'online',
        wifiSsid: 'Moonraker Network',
        ipAddress: endpointHost,
        state,
        toolheadX: Number(toolheadPosition[0] ?? 0),
        toolheadY: Number(toolheadPosition[1] ?? 0),
        toolheadZ: Number(toolheadPosition[2] ?? 0),
        homedAxes: objects.status?.toolhead?.homed_axes ?? '',
        extruderTemp: Number(objects.status?.extruder?.temperature ?? 0),
        bedTemp: Number(objects.status?.heater_bed?.temperature ?? 0),
        modelFanPercent: Math.max(0, Math.min(100, Number(objects.status?.fan?.speed ?? 0) * 100)),
        updatedAt: new Date().toISOString(),
        message: `Moonraker: ${moonrakerUrl}`,
      }
    },
  }
}
