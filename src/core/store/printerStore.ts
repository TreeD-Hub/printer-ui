import { useMemo, useSyncExternalStore } from 'react'
import { runtimeMode } from '#runtime'
import { TREED_V2_COREXY_V1_LIMITS } from '@treed/printer-logic'
import type { PrinterSnapshot } from '../transport/types'

type PrinterStoreListener = () => void

export const FALLBACK_PRINTER_SNAPSHOT: PrinterSnapshot = {
  source: runtimeMode,
  revisions: {
    printerObjects: {
      eventtime: null,
      receivedAt: 0,
      source: runtimeMode === 'mock' ? 'mock' : 'http',
    },
    files: null,
  },
  transport: {
    state: 'connecting',
    message: null,
  },
  klippy: {
    state: 'disconnected',
    message: 'Запуск системы...',
  },
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
  uiContract: {
    status: 'legacy',
    expectedVersion: '1.0',
    contractVersion: null,
    profile: null,
    requiredMacros: [],
    missingMacros: [],
    message: 'Device contract еще не опубликован.',
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
  limits: TREED_V2_COREXY_V1_LIMITS,
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
  fileList: {
    state: 'unknown',
    message: null,
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
  thermalTargets: {
    nozzle: 0,
    bed: 0,
  },
  runtimeTune: {
    contractVersion: null,
    speedFactorPercent: 100,
    flowFactorPercent: 100,
    accelMmS2: 0,
    pressureAdvance: 0,
    retractLengthMm: 0,
    appliedBabystepMm: 0,
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
  const reconciledSnapshot = reconcilePrinterSnapshot(currentPrinterSnapshot, nextSnapshot)
  if (Object.is(currentPrinterSnapshot, reconciledSnapshot)) {
    return
  }

  currentPrinterSnapshot = reconciledSnapshot
  emitPrinterStoreChange()
}

export function reconcilePrinterSnapshot(
  previous: PrinterSnapshot,
  next: PrinterSnapshot,
): PrinterSnapshot {
  const previousEventtime = previous.revisions.printerObjects.eventtime
  const nextEventtime = next.revisions.printerObjects.eventtime
  const hasStalePrinterObjects = (
    previous.transport.state === 'online' &&
    previousEventtime !== null &&
    nextEventtime !== null &&
    nextEventtime < previousEventtime
  )

  if (!hasStalePrinterObjects) {
    return next
  }

  const previousFilesRevision = previous.revisions.files
  const nextFilesRevision = next.revisions.files
  const shouldApplyFiles = (
    nextFilesRevision !== null &&
    (previousFilesRevision === null || nextFilesRevision.receivedAt >= previousFilesRevision.receivedAt)
  )

  if (!shouldApplyFiles) {
    return previous
  }

  return {
    ...previous,
    printFiles: next.printFiles,
    fileList: next.fileList,
    revisions: {
      ...previous.revisions,
      files: nextFilesRevision,
    },
  }
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
