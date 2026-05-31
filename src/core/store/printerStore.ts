import { useMemo, useSyncExternalStore } from 'react'
import { dataMode } from '../../config'
import type { PrinterSnapshot } from '../transport/types'

type PrinterStoreListener = () => void

export const FALLBACK_PRINTER_SNAPSHOT: PrinterSnapshot = {
  source: dataMode,
  connection: 'connecting',
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
  message: 'Запуск системы...',
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

let currentPrinterSnapshot = FALLBACK_PRINTER_SNAPSHOT
const listeners = new Set<PrinterStoreListener>()

function emitPrinterStoreChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function getPrinterSnapshot(): PrinterSnapshot {
  return currentPrinterSnapshot
}

export function setPrinterSnapshot(nextSnapshot: PrinterSnapshot): void {
  if (Object.is(currentPrinterSnapshot, nextSnapshot)) {
    return
  }

  currentPrinterSnapshot = nextSnapshot
  emitPrinterStoreChange()
}

export function updatePrinterSnapshot(updater: (previous: PrinterSnapshot) => PrinterSnapshot): void {
  setPrinterSnapshot(updater(currentPrinterSnapshot))
}

export function subscribePrinterStore(listener: PrinterStoreListener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function usePrinterStoreSelector<T>(
  selector: (snapshot: PrinterSnapshot) => T,
  isEqual: (left: T, right: T) => boolean = Object.is,
): T {
  const getSelectedSnapshot = useMemo(() => {
    let lastSnapshot = getPrinterSnapshot()
    let lastSelection = selector(lastSnapshot)

    return () => {
      const nextSnapshot = getPrinterSnapshot()
      if (Object.is(nextSnapshot, lastSnapshot)) {
        return lastSelection
      }

      const nextSelection = selector(nextSnapshot)
      lastSnapshot = nextSnapshot

      if (isEqual(lastSelection, nextSelection)) {
        return lastSelection
      }

      lastSelection = nextSelection
      return nextSelection
    }
  }, [isEqual, selector])

  return useSyncExternalStore(subscribePrinterStore, getSelectedSnapshot, getSelectedSnapshot)
}
