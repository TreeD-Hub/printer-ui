import { useCallback, useEffect, useMemo, useState } from 'react'
import { dataMode } from '../../config'
import { createMockClient } from '../transport/mockClient'
import { createMoonrakerClient } from '../transport/moonrakerClient'
import type { PrinterSnapshot } from '../transport/types'

const LIVE_HTTP_FALLBACK_INTERVAL_MS = 30_000

const FALLBACK_SNAPSHOT: PrinterSnapshot = {
  source: dataMode,
  connection: 'offline',
  wifiSsid: 'Не подключено',
  ipAddress: '—',
  state: 'unknown',
  toolheadX: 0,
  toolheadY: 0,
  toolheadZ: 0,
  homedAxes: '',
  extruderTemp: 0,
  bedTemp: 0,
  modelFanPercent: 0,
  updatedAt: new Date(0).toISOString(),
  message: 'Ожидание данных...',
  hardware: {
    marker: 'treed-v2',
    profile: 'treed_v2_corexy_v1',
    host: 'Rock Pi / Armbian Debian 12',
    mainMcu: 'Octopus Pro CAN',
    toolheadMcu: 'EBB42 CAN',
    probe: 'Eddy Duo CAN',
    model: 'TreeD V2',
    revision: null,
  },
  capabilities: {
    print: false,
    motion: false,
    thermal: false,
    fan: false,
    filament: false,
    console: false,
    eddy: false,
    shaper: false,
    motionTest: false,
    power: false,
    network: false,
    cloud: false,
    updates: false,
    systemPower: false,
    camera: false,
    serviceCommands: false,
  },
  printJob: {
    filename: '',
    filePath: null,
    state: 'unknown',
    message: '',
    progress: 0,
    progressPercent: 0,
    totalDurationSec: 0,
    printDurationSec: 0,
    filamentUsedMm: 0,
    currentLayer: null,
    totalLayer: null,
    isPaused: false,
    isActive: false,
  },
  files: {
    type: 'unknown',
    path: null,
    progress: 0,
    isActive: false,
    filePosition: 0,
    fileSize: null,
  },
  toolhead: {
    rawX: 0,
    rawY: 0,
    rawZ: 0,
    rawE: 0,
    printOffsetX: 0,
    printOffsetY: 65,
    homedAxes: '',
    coordinateMode: 'raw',
  },
  geometry: {
    toolhead: { x: 0, y: 0, z: 0, e: 0 },
    gcode: { x: 0, y: 0, z: 0, e: 0 },
    homingOrigin: { x: 0, y: 0, z: 0, e: 0 },
    absoluteCoordinates: false,
    absoluteExtrude: false,
    speedFactor: 1,
    speed: 0,
    extrudeFactor: 1,
  },
  macros: {
    available: [],
    values: {},
  },
  printFiles: [],
  v2: {
    branch: 'treed-v2',
    profile: 'treed_v2_corexy_v1',
    eddy: {
      status: 'unknown',
      autosaveEnabled: false,
      autosavePending: false,
    },
  },
}

function mergeWebSocketSnapshot(previous: PrinterSnapshot, next: PrinterSnapshot): PrinterSnapshot {
  return {
    ...next,
    printFiles: next.printFiles.length > 0 ? next.printFiles : previous.printFiles,
  }
}

function getFailureConnection(previous: PrinterSnapshot): PrinterSnapshot['connection'] {
  if (previous.connection === 'shutdown') {
    return 'shutdown'
  }

  return previous.connection === 'offline' ? 'offline' : 'reconnecting'
}

export function usePrinterSnapshot(pollIntervalMs = 2_000) {
  const [snapshot, setSnapshot] = useState<PrinterSnapshot>(FALLBACK_SNAPSHOT)
  const [error, setError] = useState<string>('')

  const client = useMemo(() => {
    return dataMode === 'live' ? createMoonrakerClient() : createMockClient()
  }, [])

  const refresh = useCallback(async () => {
    try {
      const nextSnapshot = await client.fetchSnapshot()
      setSnapshot(nextSnapshot)
      setError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setSnapshot((prev) => ({
        ...prev,
        connection: getFailureConnection(prev),
        message: `Ошибка связи: ${message}`,
        updatedAt: new Date().toISOString(),
      }))
      setError(message)
    }
  }, [client])

  useEffect(() => {
    let isDisposed = false
    const fallbackIntervalMs = client.subscribe === undefined
      ? pollIntervalMs
      : Math.max(pollIntervalMs, LIVE_HTTP_FALLBACK_INTERVAL_MS)
    const subscription = client.subscribe?.({
      onSnapshot(nextSnapshot) {
        if (isDisposed) {
          return
        }

        setSnapshot((prev) => mergeWebSocketSnapshot(prev, nextSnapshot))
        setError('')
      },
      onConnectionChange(connection, message) {
        if (isDisposed) {
          return
        }

        setSnapshot((prev) => ({
          ...prev,
          connection,
          message: message ?? prev.message,
          updatedAt: new Date().toISOString(),
        }))
      },
      onError(message) {
        if (isDisposed) {
          return
        }

        setError(message)
      },
    })

    if (client.subscribe !== undefined) {
      setSnapshot((prev) => ({
        ...prev,
        connection: prev.connection === 'online' ? prev.connection : 'connecting',
        updatedAt: new Date().toISOString(),
      }))
    }

    const firstTick = window.setTimeout(() => {
      void refresh()
    }, 0)

    const timer = window.setInterval(() => {
      void refresh()
    }, fallbackIntervalMs)

    return () => {
      isDisposed = true
      subscription?.close()
      window.clearTimeout(firstTick)
      window.clearInterval(timer)
    }
  }, [client, pollIntervalMs, refresh])

  return {
    snapshot,
    error,
    refresh,
  }
}
