import { describe, expect, it } from 'vitest'
import {
  normalizeMoonrakerRuntimeSnapshot,
  normalizeMoonrakerPrintFiles,
  type MoonrakerObjectsQueryPayload,
} from './moonrakerNormalizer'
import { MOONRAKER_RUNTIME_OBJECTS } from './moonrakerRuntimeObjects'

function buildPayload(status: NonNullable<MoonrakerObjectsQueryPayload['status']>): MoonrakerObjectsQueryPayload {
  return {
    eventtime: 123.456,
    status,
  }
}

describe('normalizeMoonrakerRuntimeSnapshot', () => {
  it('normalizes both filament sensor channels and selected settings', () => {
    const snapshot = normalizeMoonrakerRuntimeSnapshot(buildPayload({
      webhooks: { state: 'ready' },
      'gcode_macro _TREED_UI_CONTRACT': {
        contract_version: '1.0',
        profile: 'treed_v2_corexy_v1',
        capability_filament_sensor_control: 1,
        capability_filament_encoder_sensitivity: 1,
        required_macros: '',
      },
      'gcode_macro FILAMENT_SENSOR_STATUS': { mode: 'motion' },
      'gcode_macro _FILAMENT_SENSOR_SENSITIVITY_STATE': { sensitivity: 'high' },
      'filament_switch_sensor filament_switch': { enabled: true, filament_detected: false },
      'filament_motion_sensor filament_motion': { enabled: true, filament_detected: true },
    }))

    expect(MOONRAKER_RUNTIME_OBJECTS).toEqual(expect.arrayContaining([
      'filament_switch_sensor filament_switch',
      'filament_motion_sensor filament_motion',
      'gcode_macro FILAMENT_SENSOR_STATUS',
      'gcode_macro _FILAMENT_SENSOR_SENSITIVITY_STATE',
    ]))
    expect(snapshot.filamentSensor).toEqual({
      supported: true,
      motionSupported: true,
      mode: 'motion',
      sensitivity: 'high',
      filamentDetected: false,
      switchEnabled: true,
      motionEnabled: true,
      message: null,
    })
    expect(snapshot.capabilities.filamentSensorControl).toBe(true)
    expect(snapshot.capabilities.filamentEncoderSensitivity).toBe(true)
  })

  it('keeps presence control available when the motion channel is absent', () => {
    const snapshot = normalizeMoonrakerRuntimeSnapshot(buildPayload({
      webhooks: { state: 'ready' },
      'gcode_macro _TREED_UI_CONTRACT': {
        contract_version: '1.0',
        profile: 'treed_v2_corexy_v1',
        capability_filament_sensor_control: 1,
        capability_filament_encoder_sensitivity: 1,
        required_macros: '',
      },
      'gcode_macro FILAMENT_SENSOR_STATUS': { mode: 'presence' },
      'filament_switch_sensor filament_switch': { enabled: true, filament_detected: true },
    }))

    expect(snapshot.filamentSensor).toMatchObject({
      supported: true,
      motionSupported: false,
      mode: 'presence',
      message: 'Канал движения датчика недоступен.',
    })
    expect(snapshot.capabilities.filamentSensorControl).toBe(true)
    expect(snapshot.capabilities.filamentEncoderSensitivity).toBe(false)
  })

  it('uses a compatible device contract for limits and capabilities', () => {
    const snapshot = normalizeMoonrakerRuntimeSnapshot(buildPayload({
      webhooks: { state: 'ready' },
      'gcode_macro _TREED_UI_CONTRACT': {
        contract_version: '1.0',
        profile: 'treed_v2_corexy_v1',
        model: 'TreeD V2 Contract',
        revision: '2',
        nozzle_max_c: 275,
        bed_max_c: 115,
        axis_x_min: 0,
        axis_x_max: 240,
        axis_y_min: 1,
        axis_y_max: 241,
        axis_z_min: -2,
        axis_z_max: 250,
        capability_print: 1,
        capability_motion: 1,
        capability_thermal: 1,
        capability_fan: 1,
        capability_filament: 1,
        capability_console: 1,
        capability_eddy: 1,
        capability_shaper: 1,
        capability_motion_test: 1,
        capability_network: 1,
        capability_camera: 1,
        capability_system_power: 1,
        capability_service_commands: 1,
        required_macros: 'TREED_UI_MOVE_AXIS',
      },
      'gcode_macro TREED_UI_MOVE_AXIS': {},
      'gcode_macro _TREED_SYSTEM_POWER': { enabled: 1 },
      'gcode_macro _TREED_SERVICE_COMMANDS': { enabled: 1 },
      'gcode_macro _TREED_CAMERA': {
        enabled: 1,
        resolution: '1920x1080',
        format: 'MJPEG',
        encoder: 'HW',
        target_fps: 30,
        max_fps: 30,
        stream_url: '/webcam/?action=stream',
        snapshot_url: '/webcam/?action=snapshot',
      },
      'gcode_macro _TREED_CAM_STATE': { enabled: 1 },
    }))

    expect(snapshot.uiContract).toMatchObject({
      status: 'compatible',
      contractVersion: '1.0',
      profile: 'treed_v2_corexy_v1',
      missingMacros: [],
    })
    expect(snapshot.hardware).toMatchObject({ model: 'TreeD V2 Contract', revision: '2' })
    expect(snapshot.limits).toEqual({
      nozzleMaxC: 275,
      bedMaxC: 115,
      axis: {
        X: { min: 0, max: 240 },
        Y: { min: 1, max: 241 },
        Z: { min: -2, max: 250 },
      },
    })
    expect(snapshot.capabilities).toMatchObject({
      motion: true,
      network: true,
      systemPower: true,
      serviceCommands: true,
    })
    expect(snapshot.camera).toEqual({
      supported: true,
      active: true,
      resolution: '1920x1080',
      format: 'MJPEG',
      encoder: 'HW',
      targetFps: 30,
      maxFps: 30,
      streamUrl: '/webcam/?action=stream',
      snapshotUrl: '/webcam/?action=snapshot',
    })
  })

  it('fails closed for an explicitly incompatible device contract', () => {
    const snapshot = normalizeMoonrakerRuntimeSnapshot(buildPayload({
      webhooks: { state: 'ready' },
      'gcode_macro _TREED_UI_CONTRACT': {
        contract_version: '2.0',
        profile: 'treed_v2_corexy_v1',
        capability_print: 1,
        required_macros: 'TREED_UI_MOVE_AXIS',
      },
    }))

    expect(snapshot.uiContract.status).toBe('incompatible')
    expect(snapshot.uiContract.message).toContain('версия 2.0')
    expect(snapshot.uiContract.missingMacros).toEqual(['TREED_UI_MOVE_AXIS'])
    expect(snapshot.capabilities.print).toBe(false)
    expect(snapshot.capabilities.motion).toBe(false)
  })

  it('uses _TREED_CAMERA as the compatible runtime camera switch', () => {
    const snapshot = normalizeMoonrakerRuntimeSnapshot(buildPayload({
      webhooks: { state: 'ready' },
      'gcode_macro _TREED_UI_CONTRACT': {
        contract_version: '1.0',
        profile: 'treed_v2_corexy_v1',
        capability_camera: 1,
        required_macros: '_TREED_CAMERA',
      },
      'gcode_macro _TREED_CAMERA': {
        enabled: 0,
        target_fps: 30,
      },
    }))

    expect(snapshot.capabilities.camera).toBe(false)
    expect(snapshot.camera).toMatchObject({
      supported: false,
      active: false,
      targetFps: 30,
    })
  })

  it('normalizes persisted Eddy calibration workflow state from save_variables', () => {
    const snapshot = normalizeMoonrakerRuntimeSnapshot(buildPayload({
      webhooks: { state: 'ready' },
      save_variables: {
        variables: {
          treed_eddy_active_step: 'temperature',
          treed_eddy_operator_prompt: 'restart',
          treed_eddy_drive_current_done: 1,
          treed_eddy_primary_done: 1,
          treed_eddy_temperature_done: 0,
          treed_eddy_z0_done: 0,
          treed_eddy_screws_done: 0,
          treed_eddy_mesh_done: 0,
          treed_eddy_required_done: 0,
        },
      },
    }))

    expect(snapshot.v2.eddy.calibration).toEqual({
      activeStep: 'temperature',
      operatorPrompt: 'restart',
      driveCurrentDone: true,
      primaryDone: true,
      temperatureDone: false,
      z0Done: false,
      screwsDone: false,
      meshDone: false,
      requiredDone: false,
    })
  })

  it('normalizes Moonraker file list and metadata into V2 print cards', () => {
    const files = normalizeMoonrakerPrintFiles(
      [
        {
          path: 'jobs/benchy.gcode',
          modified: 1710000000,
          size: 24_576,
          metadata: {
            estimated_time: 3720,
            filament_total: 8150,
            filament_weight_total: 23.4,
            filament_name: 'PETG-CF',
            thumbnails: [
              {
                width: 48,
                height: 48,
                relative_path: 'jobs/.thumbs/benchy-48x48.png',
              },
              {
                width: 300,
                height: 300,
                relative_path: 'jobs/.thumbs/benchy-300x300.png',
              },
              {
                width: 512,
                height: 512,
                relative_path: 'jobs/.thumbs/benchy-512x512.png',
              },
            ],
          },
        },
        {
          path: 'calibration/readme.txt',
          modified: 1710000500,
          size: 1024,
        },
      ],
      { moonrakerUrl: 'http://127.0.0.1:7125' },
    )

    expect(files).toEqual([
      {
        id: 'file-jobs-benchy-gcode',
        path: 'jobs/benchy.gcode',
        name: 'benchy.gcode',
        directory: 'jobs',
        printTime: '1 ч 02 мин',
        weight: '23 г',
        material: 'PETG-CF',
        addedAt: '2024-03-09T16:00:00.000Z',
        preview: {
          small: {
            src: 'http://127.0.0.1:7125/server/files/gcodes/jobs/.thumbs/benchy-48x48.png',
            width: 48,
            height: 48,
            format: 'png',
          },
          large: {
            src: 'http://127.0.0.1:7125/server/files/gcodes/jobs/.thumbs/benchy-300x300.png',
            width: 300,
            height: 300,
            format: 'png',
          },
        },
      },
    ])
  })

  it('keeps missing metadata values empty and exposes metadata state', () => {
    const files = normalizeMoonrakerPrintFiles([
      {
        path: 'jobs/no-time.gcode',
        modified: 1710000000,
        size: 24_576,
      },
      {
        path: 'jobs/loading.gcode',
        modified: 1710000100,
        size: 24_576,
        metadataStatus: 'loading',
      },
    ])

    expect(files[0]).toEqual(expect.objectContaining({
      path: 'jobs/no-time.gcode',
      printTime: '—',
      weight: '—',
      material: '—',
      metadataStatus: 'idle',
    }))
    expect(files[1]).toEqual(expect.objectContaining({
      path: 'jobs/loading.gcode',
      metadataStatus: 'loading',
    }))
  })

  it('resolves nested thumbnail paths relative to the G-code directory', () => {
    const files = normalizeMoonrakerPrintFiles(
      [
        {
          path: 'jobs/benchy.gcode',
          modified: 1710000000,
          size: 24_576,
          metadata: {
            thumbnails: [
              {
                width: 48,
                height: 48,
                filename: '.thumbs/benchy-48x48.png',
              },
            ],
            thumbnail_path: '.thumbs/benchy-300x300.png',
          },
        },
      ],
      { moonrakerUrl: 'http://127.0.0.1:7125' },
    )

    expect(files[0]?.preview).toEqual({
      small: {
        src: 'http://127.0.0.1:7125/server/files/gcodes/jobs/.thumbs/benchy-48x48.png',
        width: 48,
        height: 48,
        format: 'png',
      },
      large: {
        src: 'http://127.0.0.1:7125/server/files/gcodes/jobs/.thumbs/benchy-300x300.png',
        width: 300,
        height: 300,
        format: 'png',
      },
    })
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
        'output_pin chamber_light': {
          value: 1,
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
        exclude_object: {
          current_object: 'part_2',
          excluded_objects: ['part_4', 'unknown_part'],
          objects: [
            {
              name: 'part_1',
              center: [40, 40],
              polygon: [[20, 20], [60, 20], [60, 60], [20, 60]],
            },
            {
              name: 'part_2',
              center: [105, 40],
              polygon: [[85, 20], [125, 20], [125, 60], [85, 60]],
            },
            {
              name: 'part_3',
              center: ['bad', 40],
              polygon: [[150, 20], [190, Number.NaN], [190, 60]],
            },
            {
              name: 'part_4',
              center: [40, 105],
            },
            {
              name: 'part_1',
              center: [999, 999],
            },
            {
              name: '',
              center: [10, 10],
            },
          ],
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
        'gcode_macro LIGHT_ON': {},
        'gcode_macro LIGHT_OFF': {},
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
      lighting: true,
      filament: true,
      filamentSensorControl: false,
      filamentEncoderSensitivity: false,
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
    expect(snapshot.toolhead.printOffsetY).toBe(0)
    expect(snapshot.extruderTemp).toBe(214.7)
    expect(snapshot.bedTemp).toBe(59.9)
    expect(snapshot.modelFanPercent).toBe(76)
    expect(snapshot.mainLightEnabled).toBe(true)
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
    expect(snapshot.excludeObjects).toEqual({
      supported: true,
      state: 'ready',
      objects: [
        {
          name: 'part_1',
          displayName: 'part 1',
          center: { x: 40, y: 40 },
          polygon: [{ x: 20, y: 20 }, { x: 60, y: 20 }, { x: 60, y: 60 }, { x: 20, y: 60 }],
          isCurrent: false,
          isExcluded: false,
        },
        {
          name: 'part_2',
          displayName: 'part 2',
          center: { x: 105, y: 40 },
          polygon: [{ x: 85, y: 20 }, { x: 125, y: 20 }, { x: 125, y: 60 }, { x: 85, y: 60 }],
          isCurrent: true,
          isExcluded: false,
        },
        {
          name: 'part_3',
          displayName: 'part 3',
          center: null,
          polygon: null,
          isCurrent: false,
          isExcluded: false,
        },
        {
          name: 'part_4',
          displayName: 'part 4',
          center: { x: 40, y: 105 },
          polygon: null,
          isCurrent: false,
          isExcluded: true,
        },
      ],
      currentObjectName: 'part_2',
      excludedObjectNames: ['part_4', 'unknown_part'],
      message: 'Klipper сообщает исключённые объекты вне текущей разметки: unknown_part.',
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

  it('marks exclude_object as unavailable when Moonraker does not publish it', () => {
    const snapshot = normalizeMoonrakerRuntimeSnapshot(buildPayload({
      webhooks: {
        state: 'ready',
      },
    }))

    expect(snapshot.excludeObjects).toEqual({
      supported: false,
      state: 'unavailable',
      objects: [],
      currentObjectName: null,
      excludedObjectNames: [],
      message: 'Исключение объектов не поддерживается текущей конфигурацией принтера.',
    })
  })

  it('keeps empty exclude_object object lists as a waiting state early in the print', () => {
    const snapshot = normalizeMoonrakerRuntimeSnapshot(buildPayload({
      webhooks: {
        state: 'ready',
      },
      print_stats: {
        state: 'printing',
        print_duration: 5,
      },
      virtual_sdcard: {
        is_active: true,
      },
      exclude_object: {
        objects: [],
        current_object: null,
        excluded_objects: [],
      },
    }))

    expect(snapshot.excludeObjects).toMatchObject({
      supported: true,
      state: 'waiting',
      objects: [],
      message: 'Получение списка объектов...',
    })
  })

  it('explains missing object markup after the print has advanced', () => {
    const snapshot = normalizeMoonrakerRuntimeSnapshot(buildPayload({
      webhooks: {
        state: 'ready',
      },
      print_stats: {
        state: 'printing',
        print_duration: 30,
      },
      virtual_sdcard: {
        is_active: true,
      },
      exclude_object: {
        objects: [],
        current_object: null,
        excluded_objects: [],
      },
    }))

    expect(snapshot.excludeObjects).toMatchObject({
      supported: true,
      state: 'ready',
      objects: [],
      message: 'В этом файле нет разметки отдельных объектов.',
    })
  })
})
