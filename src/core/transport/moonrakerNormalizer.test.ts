import { describe, expect, it } from 'vitest'
import {
  normalizeMoonrakerRuntimeSnapshot,
  normalizeMoonrakerPrintFiles,
  type MoonrakerObjectsQueryPayload,
} from './moonrakerNormalizer'

function buildPayload(status: NonNullable<MoonrakerObjectsQueryPayload['status']>): MoonrakerObjectsQueryPayload {
  return {
    eventtime: 123.456,
    status,
  }
}

describe('normalizeMoonrakerRuntimeSnapshot', () => {
  it('normalizes Moonraker file list and metadata into V2 print cards', () => {
    const files = normalizeMoonrakerPrintFiles([
      {
        path: 'jobs/benchy.gcode',
        modified: 1710000000,
        size: 24_576,
        metadata: {
          estimated_time: 3720,
          filament_total: 8150,
          filament_name: 'PETG-CF',
        },
      },
      {
        path: 'calibration/readme.txt',
        modified: 1710000500,
        size: 1024,
      },
    ])

    expect(files).toEqual([
      {
        id: 'file-jobs-benchy-gcode',
        path: 'jobs/benchy.gcode',
        name: 'benchy.gcode',
        directory: 'jobs',
        printTime: '1 ч 02 мин',
        weight: '8 г',
        material: 'PETG-CF',
        addedAt: '2024-03-09T16:00:00.000Z',
      },
    ])
  })

  it('normalizes a ready payload into a V2 runtime snapshot', () => {
    const snapshot = normalizeMoonrakerRuntimeSnapshot(
      buildPayload({
        toolhead: {
          position: [120.5, 95.25, 12.4, 0],
          homed_axes: 'xyz',
          max_accel: 12000,
        },
        gcode_move: {
          speed_factor: 0.85,
          speed: 180,
          extrude_factor: 0.98,
          absolute_coordinates: true,
          absolute_extrude: false,
          homing_origin: [1, 2, 3, 4],
          position: [120.5, 95.25, 12.4, 0],
          gcode_position: [119.5, 94.5, 12.4, 0],
        },
        print_stats: {
          filename: 'jobs/benchy.gcode',
          total_duration: 1800,
          print_duration: 900,
          filament_used: 512.4,
          state: 'printing',
          message: 'Printing benchy',
          info: {
            current_layer: 24,
            total_layer: 96,
          },
        },
        virtual_sdcard: {
          file_path: '/gcodes/jobs/benchy.gcode',
          progress: 0.48,
          is_active: true,
          file_position: 153600,
          file_size: 320000,
        },
        extruder: {
          temperature: 214.7,
          target: 220,
          pressure_advance: 0.075,
        },
        heater_bed: {
          temperature: 59.9,
          target: 60,
        },
        fan: {
          speed: 0.76,
        },
        firmware_retraction: {
          retract_length: 0.9,
        },
        display_status: {
          message: 'Layer 24/96',
          progress: 0.5,
        },
        pause_resume: {
          is_paused: false,
        },
        webhooks: {
          state: 'ready',
          state_message: 'Printer is ready',
        },
        'gcode_macro _TREED_PROFILE': {
          model: 'TreeD V2 Pro',
          revision: 'rev-b',
          enabled: true,
          gcode: 'M117 profile',
        },
        'gcode_macro _TREED_SERVICE_COMMANDS': {
          enabled: true,
        },
        'gcode_macro _TREED_CLOUD': {
          enabled: false,
        },
        'gcode_macro _TREED_UI_TUNE_STATE': {
          contract_version: '1.0',
          applied_babystep: -0.025,
        },
      }),
      { moonrakerUrl: 'http://192.168.0.42:7125' },
    )

    expect(snapshot.source).toBe('live')
    expect(snapshot.connection).toBe('online')
    expect(snapshot.hardware).toEqual({
      marker: 'treed-v2',
      profile: 'treed_v2_corexy_v1',
      host: 'Rock Pi / Armbian Debian 12',
      mainMcu: 'Octopus Pro CAN',
      toolheadMcu: 'EBB42 CAN',
      probe: 'Eddy Duo CAN',
      model: 'TreeD V2 Pro',
      revision: 'rev-b',
    })
    expect(snapshot.capabilities).toEqual({
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
    })
    expect(snapshot.state).toBe('printing')
    expect(snapshot.message).toBe('Printing benchy')
    expect(snapshot.toolheadX).toBe(120.5)
    expect(snapshot.toolheadY).toBe(95.25)
    expect(snapshot.toolheadZ).toBe(12.4)
    expect(snapshot.homedAxes).toBe('xyz')
    expect(snapshot.extruderTemp).toBe(214.7)
    expect(snapshot.bedTemp).toBe(59.9)
    expect(snapshot.modelFanPercent).toBe(76)
    expect(snapshot.ipAddress).toBe('192.168.0.42')
    expect(snapshot.printJob).toEqual({
      filename: 'jobs/benchy.gcode',
      filePath: '/gcodes/jobs/benchy.gcode',
      state: 'printing',
      message: 'Printing benchy',
      progress: 0.5,
      progressPercent: 50,
      totalDurationSec: 1800,
      printDurationSec: 900,
      filamentUsedMm: 512.4,
      currentLayer: 24,
      totalLayer: 96,
      isPaused: false,
      isActive: true,
    })
    expect(snapshot.files).toEqual({
      type: 'virtual_sdcard',
      path: '/gcodes/jobs/benchy.gcode',
      progress: 0.48,
      isActive: true,
      filePosition: 153600,
      fileSize: 320000,
    })
    expect(snapshot.geometry).toEqual({
      toolhead: { x: 120.5, y: 95.25, z: 12.4, e: 0 },
      gcode: { x: 119.5, y: 94.5, z: 12.4, e: 0 },
      homingOrigin: { x: 1, y: 2, z: 3, e: 4 },
      absoluteCoordinates: true,
      absoluteExtrude: false,
      speedFactor: 0.85,
      speed: 180,
      extrudeFactor: 0.98,
    })
    expect(snapshot.thermalTargets).toEqual({
      nozzle: 220,
      bed: 60,
    })
    expect(snapshot.runtimeTune).toEqual({
      contractVersion: '1.0',
      speedFactorPercent: 85,
      flowFactorPercent: 98,
      accelMmS2: 12000,
      pressureAdvance: 0.075,
      retractLengthMm: 0.9,
      appliedBabystepMm: -0.025,
    })
    expect(snapshot.macros.available).toContain('_TREED_PROFILE')
    expect(snapshot.macros.available).toContain('_TREED_SERVICE_COMMANDS')
    expect(snapshot.macros.values._TREED_PROFILE.model).toBe('TreeD V2 Pro')
    expect(snapshot.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('maps shutdown and offline payloads to the expected connection state', () => {
    const shutdownSnapshot = normalizeMoonrakerRuntimeSnapshot(
      buildPayload({
        webhooks: {
          state: 'shutdown',
          state_message: 'Klipper is shutting down',
        },
      }),
    )

    const offlineSnapshot = normalizeMoonrakerRuntimeSnapshot(
      buildPayload({
        webhooks: {
          state: 'error',
          state_message: 'Klippy disconnected',
        },
      }),
    )

    expect(shutdownSnapshot.connection).toBe('shutdown')
    expect(shutdownSnapshot.state).toBe('shutdown')
    expect(shutdownSnapshot.message).toBe('Klipper is shutting down')
    expect(offlineSnapshot.connection).toBe('offline')
    expect(offlineSnapshot.state).toBe('error')
    expect(offlineSnapshot.message).toBe('Klippy disconnected')
  })

  it('keeps macro state and service capability empty when TREED macros are absent', () => {
    const snapshot = normalizeMoonrakerRuntimeSnapshot(
      buildPayload({
        toolhead: {
          position: [10, 20, 30, 0],
          homed_axes: '',
        },
        gcode_move: {
          position: [10, 20, 30, 0],
          gcode_position: [10, 20, 30, 0],
          homing_origin: [0, 0, 0, 0],
        },
        webhooks: {
          state: 'ready',
          state_message: 'Ready',
        },
      }),
    )

    expect(snapshot.connection).toBe('online')
    expect(snapshot.hardware.profile).toBe('treed_v2_corexy_v1')
    expect(snapshot.hardware.marker).toBe('treed-v2')
    expect(snapshot.hardware.model).toBe('TreeD V2')
    expect(snapshot.capabilities.serviceCommands).toBe(false)
    expect(snapshot.capabilities.cloud).toBe(false)
    expect(snapshot.capabilities.network).toBe(false)
    expect(snapshot.capabilities.console).toBe(true)
    expect(snapshot.macros.available).toEqual([])
    expect(snapshot.macros.values).toEqual({})
  })

  it('normalizes numeric and string V2 macro capability flags', () => {
    const snapshot = normalizeMoonrakerRuntimeSnapshot(
      buildPayload({
        webhooks: {
          state: 'ready',
          state_message: 'Ready',
        },
        'gcode_macro _TREED_SERVICE_COMMANDS': {
          enabled: 0,
        },
        'gcode_macro _TREED_CAMERA': {
          enabled: 1,
        },
        'gcode_macro _TREED_CLOUD': {
          active: 'false',
        },
        'gcode_macro _TREED_UPDATES': {
          enabled: 'enabled',
        },
      }),
    )

    expect(snapshot.capabilities.serviceCommands).toBe(false)
    expect(snapshot.capabilities.camera).toBe(true)
    expect(snapshot.capabilities.cloud).toBe(false)
    expect(snapshot.capabilities.updates).toBe(true)
  })

  it('defaults the V2 hardware marker and runtime fields from a minimal ready payload', () => {
    const snapshot = normalizeMoonrakerRuntimeSnapshot(
      buildPayload({
        webhooks: {
          state: 'ready',
          state_message: 'Ready',
        },
      }),
    )

    expect(snapshot.hardware).toEqual({
      marker: 'treed-v2',
      profile: 'treed_v2_corexy_v1',
      host: 'Rock Pi / Armbian Debian 12',
      mainMcu: 'Octopus Pro CAN',
      toolheadMcu: 'EBB42 CAN',
      probe: 'Eddy Duo CAN',
      model: 'TreeD V2',
      revision: null,
    })
    expect(snapshot.connection).toBe('online')
    expect(snapshot.files).toEqual({
      type: 'unknown',
      path: null,
      progress: 0,
      isActive: false,
      filePosition: 0,
      fileSize: null,
    })
    expect(snapshot.geometry).toEqual({
      toolhead: { x: 0, y: 0, z: 0, e: 0 },
      gcode: { x: 0, y: 0, z: 0, e: 0 },
      homingOrigin: { x: 0, y: 0, z: 0, e: 0 },
      absoluteCoordinates: false,
      absoluteExtrude: false,
      speedFactor: 1,
      speed: 0,
      extrudeFactor: 1,
    })
    expect(snapshot.thermalTargets).toEqual({
      nozzle: 0,
      bed: 0,
    })
    expect(snapshot.runtimeTune).toEqual({
      contractVersion: null,
      speedFactorPercent: 100,
      flowFactorPercent: 100,
      accelMmS2: 0,
      pressureAdvance: 0,
      retractLengthMm: 0,
      appliedBabystepMm: 0,
    })
    expect(snapshot.printJob).toEqual({
      filename: '',
      filePath: null,
      state: 'ready',
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
    })
  })
})
