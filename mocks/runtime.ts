import type { CommandClient, CommandResult, ExecuteCommandArgs } from '../src/core/commands/types'
import type { PrinterCommandId } from '@treed/printer-logic'
import type { PrinterSnapshot, PrinterSource, TransportClient } from '../src/core/transport/types'

export const runtimeMode: PrinterSource = 'mock'

let mockCommandFailure: { command: PrinterCommandId; message: string } | null = null

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
    case 'turnOffHeaters':
      return 'Mock: heaters off'
    case 'setFanPercent':
      return `Mock: fan set to ${args.percent}%`
    case 'loadFilament':
      return 'Mock: load filament sent'
    case 'unloadFilament':
      return 'Mock: unload filament sent'
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
      return 'Mock: shutdown host is unsupported'
    default:
      return 'Mock: command executed'
  }
}

export function setMockCommandFailure(command: PrinterCommandId, message: string): void {
  mockCommandFailure = { command, message }
}

export function clearMockCommandFailure(): void {
  mockCommandFailure = null
}

function createMockSnapshot(): PrinterSnapshot {
  return {
    source: 'mock',
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
      return createMockSnapshot()
    },
  }
}

export function createCommandClient(): CommandClient {
  return {
    async execute(args: ExecuteCommandArgs): Promise<CommandResult> {
      await wait(220)

      if (mockCommandFailure?.command === args.command) {
        return {
          command: args.command,
          ok: false,
          kind: 'unsupported',
          message: mockCommandFailure.message,
          at: nowIso(),
        }
      }

      if (args.command === 'shutdownHost') {
        return {
          command: args.command,
          ok: false,
          kind: 'unsupported',
          message: 'Mock: shutdown host is unsupported',
          at: nowIso(),
        }
      }

      return {
        command: args.command,
        ok: true,
        message: buildMockCommandMessage(args),
        at: nowIso(),
      }
    },
  }
}
