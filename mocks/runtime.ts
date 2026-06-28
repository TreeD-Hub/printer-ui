import type { CommandClient, CommandResult, ExecuteCommandArgs } from '../src/core/commands/types'
import {
  createUnavailableHostNetworkStatus,
  type HostNetworkClient,
  type HostNetworkStatus,
} from '../src/core/hostNetwork'
import type { HostUpdateClient, HostUpdateStatus } from '../src/core/hostUpdate'
import { TREED_V2_COREXY_V1_LIMITS, type PrinterCommandId } from '@treed/printer-logic'
import type { PrinterSnapshot, PrinterSource, TransportClient } from '../src/core/transport/types'

export const runtimeMode: PrinterSource = 'mock'

let mockCommandFailure: { command: PrinterCommandId; message: string } | null = null
let mockCommandOperations: ExecuteCommandArgs[] = []
let mockTransportSnapshot: PrinterSnapshot | null = null
let mockNetworkStatus = createUnavailableHostNetworkStatus('Host network bridge недоступен.')
let mockNetworkOperations: string[] = []

const mockUpdateStatus: HostUpdateStatus = {
  available: true,
  busy: false,
  canApply: false,
  message: 'Mock: GitHub Releases не проверяются.',
  targetId: null,
  targetTag: null,
  logPath: null,
  releaseResults: [
    {
      id: 'treed-shell',
      label: 'TreeD Shell UI',
      currentVersion: '0.1.0',
      latestTag: null,
      latestVersion: '0.1.0',
      status: 'mock',
      message: 'Mock: GitHub Releases не проверяются.',
      canApply: false,
    },
    {
      id: 'treed-mainshellos',
      label: 'TreeD MainShell OS',
      currentVersion: '0.1.0',
      latestTag: null,
      latestVersion: '0.1.0',
      status: 'mock',
      message: 'Mock: GitHub Releases не проверяются.',
      canApply: false,
    },
  ],
}

function nowIso(): string {
  return new Date().toISOString()
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs)
  })
}

function buildMockCommandMessage(args: ExecuteCommandArgs): string {
  switch (args.command) {
    case 'start':
      return `Mock: print start for ${args.filename}`
    case 'pause':
      return 'Mock: print paused'
    case 'resume':
      return 'Mock: print resumed'
    case 'cancel':
      return 'Mock: print canceled'
    case 'emergencyStop':
      return 'Mock: emergency stop triggered'
    case 'home':
    case 'homeAll':
      return 'Mock: G28 sent'
    case 'homeX':
      return 'Mock: G28 X sent'
    case 'homeY':
      return 'Mock: G28 Y sent'
    case 'homeXY':
      return 'Mock: G28 X Y sent'
    case 'homeZ':
      return 'Mock: _TREED_EDDY_HOME_Z sent'
    case 'moveAxis':
      return `Mock: move ${args.axis}${args.distanceMm} sent`
    case 'setNozzleTarget':
      return `Mock: nozzle target set to ${args.targetCelsius}C`
    case 'setBedTarget':
      return `Mock: bed target set to ${args.targetCelsius}C`
    case 'setHeatingTargets':
      return `Mock: heating targets set to nozzle ${args.nozzleCelsius}C, bed ${args.bedCelsius}C`
    case 'turnOffHeaters':
      return 'Mock: heaters off'
    case 'setFanPercent':
      return `Mock: fan set to ${args.percent}%`
    case 'setPrintSpeedFactorPercent':
      return `Mock: print speed factor set to ${args.percent}%`
    case 'setPrintFlowFactorPercent':
      return `Mock: print flow factor set to ${args.percent}%`
    case 'setPrintAccel':
      return `Mock: print accel set to ${args.accelMmS2}`
    case 'setPressureAdvance':
      return `Mock: pressure advance set to ${args.advance}`
    case 'setRetractionLength':
      return `Mock: retract length set to ${args.retractLengthMm}`
    case 'adjustZOffset':
      return `Mock: Z-offset adjusted by ${args.deltaMm}`
    case 'loadFilament':
      return `Mock: load filament ${args.lengthMm ?? 100}mm sent`
    case 'unloadFilament':
      return `Mock: unload filament ${args.lengthMm ?? 100}mm sent`
    case 'zParkZeroEddy':
      return 'Mock: TREED_Z_PARK_ZERO_EDDY sent'
    case 'shaperCalibrateLight':
      return 'Mock: shaper calibrate light sent'
    case 'shaperCalibrateFull':
      return 'Mock: shaper calibrate full sent'
    case 'xyMotionTest':
      return 'Mock: xy motion test sent'
    case 'consoleGcode':
      return 'Mock: console G-code sent'
    case 'rebootHost':
      return 'Mock: host reboot requested'
    case 'restartKlipper':
      return 'Mock: Klipper restart requested'
    case 'firmwareRestart':
      return 'Mock: firmware restart requested'
    case 'restartMoonraker':
      return 'Mock: Moonraker restart requested'
    case 'shutdownHost':
      return 'Mock: host shutdown requested'
    default:
      return 'Mock: command executed'
  }
}

function updateMockSnapshot(mutator: (snapshot: PrinterSnapshot) => void): void {
  const snapshot = mockTransportSnapshot === null
    ? createMockSnapshot()
    : structuredClone(mockTransportSnapshot)

  mutator(snapshot)
  snapshot.updatedAt = nowIso()
  snapshot.revisions.printerObjects.receivedAt = Date.now()
  mockTransportSnapshot = snapshot
}

function applyMockCommandEffect(args: ExecuteCommandArgs): void {
  switch (args.command) {
    case 'setNozzleTarget':
      updateMockSnapshot((snapshot) => {
        snapshot.thermalTargets.nozzle = args.targetCelsius
      })
      return
    case 'setBedTarget':
      updateMockSnapshot((snapshot) => {
        snapshot.thermalTargets.bed = args.targetCelsius
      })
      return
    case 'setHeatingTargets':
      updateMockSnapshot((snapshot) => {
        snapshot.thermalTargets.nozzle = args.nozzleCelsius
        snapshot.thermalTargets.bed = args.bedCelsius
      })
      return
    case 'turnOffHeaters':
      updateMockSnapshot((snapshot) => {
        snapshot.thermalTargets.nozzle = 0
        snapshot.thermalTargets.bed = 0
      })
      return
    default:
      return
  }
}

export function setMockCommandFailure(command: PrinterCommandId, message: string): void {
  mockCommandFailure = { command, message }
}

export function clearMockCommandFailure(): void {
  mockCommandFailure = null
  mockCommandOperations = []
}

export function getMockCommandOperations(): ExecuteCommandArgs[] {
  return mockCommandOperations.map((operation) => ({ ...operation }))
}

export function setMockTransportSnapshot(snapshot: PrinterSnapshot | null): void {
  mockTransportSnapshot = snapshot === null ? null : structuredClone(snapshot)
}

export function clearMockTransportSnapshot(): void {
  mockTransportSnapshot = null
}

function cloneHostNetworkStatus(status: HostNetworkStatus): HostNetworkStatus {
  return {
    ...status,
    networks: status.networks.map((network) => ({ ...network })),
  }
}

export function setMockNetworkStatus(status: HostNetworkStatus): void {
  mockNetworkStatus = cloneHostNetworkStatus(status)
}

export function getMockNetworkOperations(): string[] {
  return [...mockNetworkOperations]
}

export function clearMockNetworkRuntime(): void {
  mockNetworkStatus = createUnavailableHostNetworkStatus('Host network bridge недоступен.')
  mockNetworkOperations = []
}

export function createMockSnapshot(): PrinterSnapshot {
  return {
    source: 'mock',
    revisions: {
      printerObjects: {
        eventtime: null,
        receivedAt: Date.now(),
        source: 'mock',
      },
      files: {
        eventtime: null,
        receivedAt: Date.now(),
        source: 'mock',
      },
    },
    transport: {
      state: 'online',
      message: null,
    },
    klippy: {
      state: 'ready',
      message: 'TreeD V2 runtime mock',
    },
    connection: 'online',
    wifiSsid: 'TreeD-Lab',
    ipAddress: '192.168.0.21',
    state: 'ready',
    toolheadX: 125,
    toolheadY: 125,
    toolheadZ: 12.4,
    homedAxes: 'xyz',
    extruderTemp: 215,
    bedTemp: 58,
    modelFanPercent: 78,
    updatedAt: nowIso(),
    message: 'TreeD V2 runtime mock',
    hardware: {
      marker: 'treed-v2',
      profile: 'treed_v2_corexy_v1',
      host: 'Rock Pi / Armbian Debian 12',
      mainMcu: 'Octopus Pro CAN',
      toolheadMcu: 'EBB42 CAN',
      probe: 'Eddy Duo CAN',
      model: 'TreeD V2',
      revision: 'mock',
    },
    uiContract: {
      status: 'compatible',
      expectedVersion: '1.0',
      contractVersion: '1.0',
      profile: 'treed_v2_corexy_v1',
      requiredMacros: [],
      missingMacros: [],
      message: null,
    },
    capabilities: {
      print: true,
      motion: true,
      thermal: true,
      fan: true,
      filament: true,
      console: true,
      eddy: true,
      shaper: true,
      motionTest: true,
      power: false,
      network: false,
      cloud: false,
      updates: false,
      systemPower: false,
      camera: false,
      serviceCommands: true,
    },
    limits: TREED_V2_COREXY_V1_LIMITS,
    printJob: {
      filename: '',
      filePath: null,
      state: 'ready',
      message: 'Ready for local mock print',
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
      type: 'virtual_sdcard',
      path: null,
      progress: 0,
      isActive: false,
      filePosition: 0,
      fileSize: null,
    },
    toolhead: {
      rawX: 125,
      rawY: 125,
      rawZ: 12.4,
      rawE: 0,
      printOffsetX: 0,
      printOffsetY: 65,
      homedAxes: 'xyz',
      coordinateMode: 'raw',
    },
    geometry: {
      toolhead: { x: 125, y: 125, z: 12.4, e: 0 },
      gcode: { x: 125, y: 125, z: 12.4, e: 0 },
      homingOrigin: { x: 0, y: 0, z: 0, e: 0 },
      absoluteCoordinates: true,
      absoluteExtrude: false,
      speedFactor: 1,
      speed: 0,
      extrudeFactor: 1,
    },
    thermalTargets: {
      nozzle: 220,
      bed: 60,
    },
    runtimeTune: {
      contractVersion: '1.0',
      speedFactorPercent: 100,
      flowFactorPercent: 100,
      accelMmS2: 6000,
      pressureAdvance: 0.08,
      retractLengthMm: 0.8,
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
        status: 'ready',
        autosaveEnabled: true,
        autosavePending: false,
      },
    },
  }
}

export function createTransportClient(): TransportClient {
  return {
    async fetchSnapshot(): Promise<PrinterSnapshot> {
      return mockTransportSnapshot === null ? createMockSnapshot() : structuredClone(mockTransportSnapshot)
    },
    async deletePrintFile(path: string): Promise<void> {
      if (mockTransportSnapshot !== null) {
        mockTransportSnapshot.printFiles = mockTransportSnapshot.printFiles.filter((item) => item.path !== path)
      }
    },
  }
}

export function createCommandClient(): CommandClient {
  return {
    async execute(args: ExecuteCommandArgs): Promise<CommandResult> {
      await wait(220)
      mockCommandOperations.push(args)

      if (mockCommandFailure?.command === args.command) {
        return {
          command: args.command,
          ok: false,
          kind: 'unsupported',
          message: mockCommandFailure.message,
          at: nowIso(),
        }
      }

      applyMockCommandEffect(args)

      return {
        command: args.command,
        ok: true,
        status: 'confirmed',
        message: buildMockCommandMessage(args),
        at: nowIso(),
      }
    },
  }
}

export function createHostNetworkClient(): HostNetworkClient {
  return {
    async getStatus() {
      return cloneHostNetworkStatus(mockNetworkStatus)
    },
    async scan() {
      mockNetworkOperations.push('scan')
      return cloneHostNetworkStatus(mockNetworkStatus)
    },
    async connect({ ssid }) {
      mockNetworkOperations.push(`connect:${ssid}`)
      mockNetworkStatus = {
        ...mockNetworkStatus,
        ssid,
        networks: mockNetworkStatus.networks.map((network) => ({
          ...network,
          connected: network.ssid === ssid,
          saved: network.ssid === ssid ? true : network.saved,
        })),
        message: `Mock: connected to ${ssid}`,
      }
      return cloneHostNetworkStatus(mockNetworkStatus)
    },
    async forget({ ssid }) {
      mockNetworkOperations.push(`forget:${ssid}`)
      mockNetworkStatus = {
        ...mockNetworkStatus,
        ssid: mockNetworkStatus.ssid === ssid ? null : mockNetworkStatus.ssid,
        networks: mockNetworkStatus.networks.map((network) => (
          network.ssid === ssid
            ? { ...network, connected: false, saved: false }
            : network
        )),
        message: `Mock: forgot ${ssid}`,
      }
      return cloneHostNetworkStatus(mockNetworkStatus)
    },
  }
}

function cloneMockUpdateStatus(status: HostUpdateStatus): HostUpdateStatus {
  return {
    ...status,
    releaseResults: status.releaseResults.map((release) => ({ ...release })),
  }
}

export function createHostUpdateClient(): HostUpdateClient {
  return {
    getStatus: () => Promise.resolve(cloneMockUpdateStatus(mockUpdateStatus)),
    check: () => Promise.resolve(cloneMockUpdateStatus(mockUpdateStatus)),
    apply: () => Promise.resolve({
      ...cloneMockUpdateStatus(mockUpdateStatus),
      message: 'Mock: системное обновление не запускается.',
    }),
  }
}
