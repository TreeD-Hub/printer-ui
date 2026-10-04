import type { CommandClient, CommandResult, ExecuteCommandArgs } from '../src/core/commands/types'
import { receivePrinterGcodeResponse } from '../src/core/store/printerNotifications'
import {
  createUnavailableHostNetworkStatus,
  type HostNetworkClient,
  type HostNetworkStatus,
} from '../src/core/hostNetwork'
import type { HostUpdateClient, HostUpdateOperation, HostUpdateStatus } from '../src/core/hostUpdate'
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
  message: 'Проверочный выпуск интерфейса доступен.',
  targetId: null,
  targetTag: null,
  logPath: null,
  releaseResults: [
    {
      id: 'printer-ui',
      label: 'Интерфейс TreeD',
      currentVersion: '0.1.0',
      latestTag: 'ui-main-42-1',
      latestVersion: 'ui-main-42-1',
      status: 'available',
      message: 'Проверочный выпуск интерфейса доступен.',
      canApply: true,
    },
    {
      id: 'printer-core',
      label: 'Система TreeD',
      currentVersion: '0.1.0',
      latestTag: null,
      latestVersion: '0.1.0',
      status: 'mock',
      message: 'Системное обновление доступно только на проверенной A/B-платформе.',
      canApply: false,
      capability: {
        supported: false,
        reasonCode: 'ab_platform_unverified',
        reason: 'A/B-платформа для системного выпуска не настроена.',
      },
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
    case 'setDriverMode':
    case 'setDriverFanMode':
      return `Mock: режим ${args.mode} сохранён`
    case 'setMainLightEnabled':
      return args.enabled ? 'Mock: main light on' : 'Mock: main light off'
    case 'setLightPreference':
      return 'Mock: настройка света сохранена'
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
    case 'restartUi':
      return 'Mock: UI restart requested'
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
    case 'setDriverMode':
    case 'setDriverFanMode':
      updateMockSnapshot(snapshot => {
        const state = args.command === 'setDriverMode' ? snapshot.driverMode : snapshot.driverFanMode
        if (state) {
          state.mode = args.mode
          state.state = 'ready'
          if (args.command === 'setDriverMode') state.effectiveModes = { X: args.mode, Y: args.mode, Z: args.mode }
        }
      })
      return
    case 'start':
      updateMockSnapshot((snapshot) => {
        snapshot.printJob = {
          ...snapshot.printJob,
          filename: args.filename,
          filePath: args.filename,
          state: 'printing',
          message: 'Mock print active',
        }
        snapshot.excludeObjects = createMockExcludeObjects()
      })
      return
    case 'cancel':
      updateMockSnapshot((snapshot) => {
        snapshot.printJob = {
          ...snapshot.printJob,
          filename: '',
          filePath: null,
          state: 'idle',
          message: 'Ready for local mock print',
          progress: 0,
          progressPercent: 0,
        }
        snapshot.excludeObjects = createUnavailableMockExcludeObjects()
      })
      return
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
    case 'setMainLightEnabled':
      updateMockSnapshot((snapshot) => {
        snapshot.mainLightEnabled = args.enabled
      })
      return
    case 'setLightPreference':
      updateMockSnapshot((snapshot) => {
        snapshot.lightPreferences = { onStartup: false, onPrintStart: true, ...snapshot.lightPreferences, [args.setting]: args.enabled }
      })
      return
    case 'setFilamentSensorMode':
      updateMockSnapshot((snapshot) => {
        snapshot.filamentSensor = {
          ...snapshot.filamentSensor,
          mode: args.mode,
          switchEnabled: true,
          motionEnabled: args.mode === 'motion',
        }
      })
      return
    case 'setFilamentEncoderSensitivity':
      updateMockSnapshot((snapshot) => {
        snapshot.filamentSensor = {
          ...snapshot.filamentSensor,
          sensitivity: args.sensitivity,
        }
      })
      return
    case 'excludeObject':
      updateMockSnapshot((snapshot) => {
        const excludedObjectNames = new Set(snapshot.excludeObjects.excludedObjectNames)
        excludedObjectNames.add(args.objectName)
        snapshot.excludeObjects = {
          ...snapshot.excludeObjects,
          excludedObjectNames: [...excludedObjectNames],
          objects: snapshot.excludeObjects.objects.map((item) => (
            item.name === args.objectName
              ? { ...item, isExcluded: true }
              : item
          )),
        }
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

function createUnavailableMockExcludeObjects(): PrinterSnapshot['excludeObjects'] {
  return {
    supported: false,
    state: 'unavailable',
    objects: [],
    currentObjectName: null,
    excludedObjectNames: [],
    message: 'Исключение объектов не поддерживается текущей конфигурацией принтера.',
  }
}

function createMockExcludeObjects(): PrinterSnapshot['excludeObjects'] {
  return {
    supported: true,
    state: 'ready',
    currentObjectName: 'part_2',
    excludedObjectNames: ['part_4'],
    message: null,
    objects: [
      {
        name: 'part_1',
        displayName: 'part 1',
        center: { x: 42, y: 44 },
        polygon: [{ x: 20, y: 22 }, { x: 64, y: 22 }, { x: 64, y: 66 }, { x: 20, y: 66 }],
        isCurrent: false,
        isExcluded: false,
      },
      {
        name: 'part_2',
        displayName: 'part 2',
        center: { x: 108, y: 44 },
        polygon: [{ x: 86, y: 22 }, { x: 130, y: 22 }, { x: 130, y: 66 }, { x: 86, y: 66 }],
        isCurrent: true,
        isExcluded: false,
      },
      {
        name: 'part_3',
        displayName: 'part 3',
        center: { x: 174, y: 44 },
        polygon: [{ x: 152, y: 22 }, { x: 196, y: 22 }, { x: 196, y: 66 }, { x: 152, y: 66 }],
        isCurrent: false,
        isExcluded: false,
      },
      {
        name: 'part_4',
        displayName: 'part 4',
        center: { x: 42, y: 112 },
        polygon: null,
        isCurrent: false,
        isExcluded: true,
      },
    ],
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
    wifiSsid: 'TreeD-Lab',
    ipAddress: '192.168.0.21',
    toolheadX: 125,
    toolheadY: 125,
    toolheadZ: 12.4,
    homedAxes: 'xyz',
    extruderTemp: 215,
    bedTemp: 58,
    modelFanPercent: 78,
    driverMode: { supported: true, mode: 'normal', state: 'ready', availableModes: ['normal', 'quiet'], needsRestart: false, message: null },
    driverFanMode: { supported: true, mode: 'normal', state: 'ready', availableModes: ['normal', 'quiet'], needsRestart: false, message: null },
    mainLightEnabled: false,
    lightPreferences: { onStartup: false, onPrintStart: true },
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
      driverMode: true,
      driverFanMode: true,
      lightingPreferences: true,
      print: true,
      motion: true,
      thermal: true,
      fan: true,
      lighting: true,
      filament: true,
      filamentSensorControl: true,
      filamentEncoderSensitivity: true,
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
    filamentSensor: {
      supported: true,
      motionSupported: true,
      mode: 'motion',
      sensitivity: 'medium',
      filamentDetected: true,
      switchEnabled: true,
      motionEnabled: true,
      message: null,
    },
    limits: {
      ...TREED_V2_COREXY_V1_LIMITS,
      axis: {
        X: { min: 0, max: 245 },
        Y: { min: 0, max: 245 },
        Z: { min: -5, max: 203 },
      },
    },
    usage: {
      totalPrintTimeSec: 437 * 60 * 60,
      totalJobTimeSec: 462 * 60 * 60,
      totalJobs: 126,
      totalFilamentUsedMm: 824_500,
      longestPrintSec: 18 * 60 * 60,
      updatedAt: nowIso(),
      state: 'ready',
      message: null,
    },
    printJob: {
      filename: '',
      filePath: null,
      state: 'idle',
      message: 'Ready for local mock print',
      progress: 0,
      progressPercent: 0,
      totalDurationSec: 0,
      printDurationSec: 0,
      filamentUsedMm: 0,
      currentLayer: null,
      totalLayer: null,
    },
    excludeObjects: createUnavailableMockExcludeObjects(),
    files: {
      type: 'virtual_sdcard',
      path: null,
      progress: 0,
      filePosition: 0,
      fileSize: null,
    },
    camera: {
      supported: false,
      active: false,
      resolution: null,
      format: null,
      encoder: null,
      targetFps: null,
      maxFps: null,
      streamUrl: null,
      snapshotUrl: null,
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
        calibration: {
          activeStep: 'not_started',
          operatorPrompt: 'none',
          driveCurrentDone: false,
          primaryDone: false,
          temperatureDone: false,
          z0Done: false,
          screwsDone: false,
          meshDone: false,
          requiredDone: false,
        },
      },
    },
  }
}

export function createTransportClient(): TransportClient {
  return {
    async fetchSnapshot(): Promise<PrinterSnapshot> {
      return mockTransportSnapshot === null ? createMockSnapshot() : structuredClone(mockTransportSnapshot)
    },
    async fetchRuntimeSnapshot(): Promise<PrinterSnapshot> {
      return mockTransportSnapshot === null ? createMockSnapshot() : structuredClone(mockTransportSnapshot)
    },
    async fetchUsage() {
      const snapshot = mockTransportSnapshot === null ? createMockSnapshot() : structuredClone(mockTransportSnapshot)

      return snapshot.usage
    },
    async fetchFilamentSensor() {
      const snapshot = mockTransportSnapshot === null ? createMockSnapshot() : structuredClone(mockTransportSnapshot)

      return snapshot.filamentSensor
    },
    async fetchEddyState() {
      const snapshot = mockTransportSnapshot === null ? createMockSnapshot() : structuredClone(mockTransportSnapshot)

      return {
        autosaveEnabled: snapshot.v2.eddy.autosaveEnabled,
        autosavePending: snapshot.v2.eddy.autosavePending,
        calibration: snapshot.v2.eddy.calibration,
      }
    },
    async fetchExcludeObjects() {
      const snapshot = mockTransportSnapshot === null ? createMockSnapshot() : structuredClone(mockTransportSnapshot)

      return snapshot.excludeObjects
    },
    async fetchPrintJobState() {
      const snapshot = mockTransportSnapshot === null ? createMockSnapshot() : structuredClone(mockTransportSnapshot)

      return {
        excludeObjects: snapshot.excludeObjects,
        files: snapshot.files,
        message: snapshot.message,
        printJob: snapshot.printJob,
        updatedAt: snapshot.updatedAt,
      }
    },
    async fetchPrintFilesState() {
      const snapshot = mockTransportSnapshot === null ? createMockSnapshot() : structuredClone(mockTransportSnapshot)

      return {
        fileList: snapshot.fileList,
        printFiles: snapshot.printFiles,
        revisions: snapshot.revisions,
      }
    },
    async fetchMotionState() {
      const snapshot = mockTransportSnapshot === null ? createMockSnapshot() : structuredClone(mockTransportSnapshot)

      return {
        axisLimits: snapshot.limits.axis,
        eddyStatus: snapshot.v2.eddy.status,
        geometry: snapshot.geometry,
        homedAxes: snapshot.homedAxes,
        message: snapshot.message,
        toolhead: snapshot.toolhead,
        toolheadX: snapshot.toolheadX,
        toolheadY: snapshot.toolheadY,
        toolheadZ: snapshot.toolheadZ,
        updatedAt: snapshot.updatedAt,
      }
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

      if (args.command === 'consoleGcode' && /^PID_CALIBRATE HEATER=(extruder|heater_bed) TARGET=\d+$/.test(args.script ?? '')) {
        await wait(12_000)
        receivePrinterGcodeResponse('PID parameters: pid_Kp=22.100 pid_Ki=1.200 pid_Kd=101.300')
      }

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
    operation: status.operation ? { ...status.operation } : null,
    latestOperation: status.latestOperation ? { ...status.latestOperation } : null,
  }
}

export function createHostUpdateClient(): HostUpdateClient {
  let status = cloneMockUpdateStatus(mockUpdateStatus)
  const requestedScenario = new URLSearchParams(globalThis.location?.search ?? '').get('mockUpdate')
  const scenario = requestedScenario === 'rollback' || requestedScenario === 'error'
    ? requestedScenario
    : 'success'

  const publishStage = (operation: HostUpdateOperation): void => {
    const isTerminal = ['applied', 'error', 'rolled_back', 'rejected'].includes(operation.status)
    const releaseResults = status.releaseResults.map((release) => {
      if (operation.targetId !== release.id || operation.status !== 'applied' || !operation.targetTag) {
        return release
      }
      return {
        ...release,
        currentVersion: operation.targetTag,
        latestTag: operation.targetTag,
        latestVersion: operation.targetTag,
        status: 'latest' as const,
        message: 'Установлена последняя версия.',
        canApply: false,
      }
    })
    status = {
      ...status,
      busy: !isTerminal,
      canApply: releaseResults.some((release) => release.canApply === true),
      message: operation.message,
      releaseResults,
      operation: { ...operation },
      latestOperation: { ...operation },
      history: ['applied', 'error', 'rolled_back', 'rejected'].includes(operation.status)
        ? [...(status.history ?? []).filter((item) => item.operationId !== operation.operationId), { ...operation }].slice(-10)
        : status.history ?? [],
      targetId: operation.targetId,
      targetTag: operation.targetTag,
    }
  }

  return {
    getStatus: () => Promise.resolve(cloneMockUpdateStatus(status)),
    check: () => Promise.resolve(cloneMockUpdateStatus(status)),
    apply: ({ targetId, targetTag, requestId }) => {
      if (requestId && status.operation?.requestId === requestId) {
        return Promise.resolve(cloneMockUpdateStatus(status))
      }
      if (status.busy && status.operation !== null && status.operation !== undefined) {
        return Promise.resolve(cloneMockUpdateStatus(status))
      }
      const opId = `mock-${Date.now()}`
      const base: HostUpdateOperation = {
        operationId: opId,
        requestId: requestId ?? opId,
        status: 'queued',
        phase: 'queued',
        progress: 0,
        resultCode: null,
        message: 'Обновление принято. Не выключайте принтер.',
        targetId,
        targetTag: targetTag ?? null,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        finishedAt: null,
      }
      const stages: Array<Pick<HostUpdateOperation, 'phase' | 'progress' | 'message'>> = [
        { phase: 'validating', progress: 8, message: 'Проверка подписи и совместимости пакета.' },
        { phase: 'downloading', progress: 32, message: 'Пакет загружен и проверен.' },
        { phase: 'installing', progress: 64, message: 'Запись новой версии в неактивный слот.' },
        { phase: 'restarting', progress: 82, message: 'Перезапуск для проверки новой версии.' },
        { phase: 'verifying', progress: 94, message: 'Проверка служб и готовности принтера.' },
        ...(scenario === 'rollback'
          ? [{ phase: 'rolling_back' as const, progress: null, message: 'Проверка не пройдена. Восстанавливаем предыдущую версию.' }]
          : []),
        scenario === 'rollback'
          ? { phase: 'complete', progress: null, message: 'Предыдущая версия восстановлена.' }
          : scenario === 'error'
            ? { phase: 'complete', progress: null, message: 'Проверка не пройдена. Предыдущая версия остаётся активной.' }
            : { phase: 'complete', progress: 100, message: 'Новая версия работает. Проверка завершена.' },
      ]
      publishStage(base)
      let index = 0
      const advance = (): void => {
        const stage = stages[index]
        if (!stage) return
        const terminal = index === stages.length - 1
        const rolledBack = terminal && scenario === 'rollback'
        const operation: HostUpdateOperation = {
          ...base,
          ...stage,
          phase: terminal ? 'complete' : stage.phase,
          status: terminal ? rolledBack ? 'rolled_back' : scenario === 'error' ? 'error' : 'applied' : 'running',
          resultCode: terminal ? rolledBack || scenario === 'error' ? 'MOCK_HEALTH_CHECK_FAILED' : 'MOCK_APPLIED' : null,
          finishedAt: terminal ? new Date().toISOString() : null,
          updatedAt: new Date().toISOString(),
        }
        publishStage(operation)
        index += 1
        if (!terminal) setTimeout(advance, 1100)
      }
      setTimeout(advance, 700)
      return Promise.resolve(cloneMockUpdateStatus(status))
    },
  }
}
