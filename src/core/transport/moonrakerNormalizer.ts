import type {
  PrinterCapabilitiesSnapshot,
  PrinterConnectionState,
  PrinterFileItemSnapshot,
  PrinterFilesSnapshot,
  PrinterGeometrySnapshot,
  PrinterHardwareSnapshot,
  PrinterMacroStateSnapshot,
  PrinterPositionSnapshot,
  PrinterPrintJobSnapshot,
  PrinterRuntimeSnapshot,
  PrinterSource,
  PrinterToolheadRuntimeSnapshot,
  PrinterV2Snapshot,
} from './types'

export interface MoonrakerObjectsQueryPayload {
  eventtime?: number
  status?: MoonrakerPrinterObjectsStatus
}

export interface MoonrakerPrinterObjectsStatus {
  toolhead?: MoonrakerToolheadStatus
  gcode_move?: MoonrakerGcodeMoveStatus
  print_stats?: MoonrakerPrintStatsStatus
  virtual_sdcard?: MoonrakerVirtualSdCardStatus
  extruder?: MoonrakerHeaterStatus
  heater_bed?: MoonrakerHeaterStatus
  fan?: MoonrakerFanStatus
  display_status?: MoonrakerDisplayStatus
  pause_resume?: MoonrakerPauseResumeStatus
  webhooks?: MoonrakerWebhooksStatus
  [key: string]: unknown
}

export interface MoonrakerToolheadStatus {
  position?: Array<number | null | undefined>
  homed_axes?: string
}

export interface MoonrakerGcodeMoveStatus {
  speed_factor?: number
  speed?: number
  extrude_factor?: number
  absolute_coordinates?: boolean
  absolute_extrude?: boolean
  homing_origin?: Array<number | null | undefined>
  position?: Array<number | null | undefined>
  gcode_position?: Array<number | null | undefined>
}

export interface MoonrakerPrintStatsStatus {
  filename?: string
  total_duration?: number
  print_duration?: number
  filament_used?: number
  state?: string
  message?: string
  info?: {
    total_layer?: number | null
    current_layer?: number | null
  }
}

export interface MoonrakerVirtualSdCardStatus {
  file_path?: string | null
  progress?: number
  is_active?: boolean
  file_position?: number
  file_size?: number | null
}

export interface MoonrakerHeaterStatus {
  temperature?: number
  target?: number
}

export interface MoonrakerFanStatus {
  speed?: number
}

export interface MoonrakerDisplayStatus {
  message?: string
  progress?: number
}

export interface MoonrakerPauseResumeStatus {
  is_paused?: boolean
}

export interface MoonrakerWebhooksStatus {
  state?: string
  state_message?: string
}

export interface MoonrakerNormalizeOptions {
  source?: PrinterSource
  moonrakerUrl?: string
  wifiSsid?: string
  printFiles?: MoonrakerPrintFileInput[]
  nowIso?: string
}

export interface MoonrakerPrintFileMetadata {
  estimated_time?: number
  filament_total?: number
  filament_name?: string
  filament_type?: string
  slicer?: string
}

export interface MoonrakerPrintFileInput {
  path?: string
  filename?: string
  modified?: number
  size?: number
  metadata?: MoonrakerPrintFileMetadata
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numericValue = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(numericValue) ? numericValue : fallback
}

function toNullableNumber(value: unknown): number | null {
  const numericValue = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(numericValue) ? numericValue : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizePosition(value: Array<number | null | undefined> | undefined): PrinterPositionSnapshot {
  return {
    x: toFiniteNumber(value?.[0], 0),
    y: toFiniteNumber(value?.[1], 0),
    z: toFiniteNumber(value?.[2], 0),
    e: toFiniteNumber(value?.[3], 0),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }

  return ''
}

function normalizeConnectionState(webhooks?: MoonrakerWebhooksStatus): PrinterConnectionState {
  const state = webhooks?.state?.toLowerCase()

  if (!state) {
    return 'degraded'
  }

  if (state === 'ready') {
    return 'online'
  }

  if (state === 'startup') {
    return 'connecting'
  }

  if (state === 'shutdown') {
    return 'shutdown'
  }

  if (state === 'error') {
    return 'offline'
  }

  return 'degraded'
}

function normalizeToolhead(
  toolhead: MoonrakerToolheadStatus | undefined,
  gcodeMove: MoonrakerGcodeMoveStatus | undefined,
): PrinterPositionSnapshot {
  return normalizePosition(toolhead?.position ?? gcodeMove?.position)
}

function normalizeGcodeMove(gcodeMove: MoonrakerGcodeMoveStatus | undefined): PrinterGeometrySnapshot {
  return {
    toolhead: normalizePosition(gcodeMove?.position),
    gcode: normalizePosition(gcodeMove?.gcode_position),
    homingOrigin: normalizePosition(gcodeMove?.homing_origin),
    absoluteCoordinates: Boolean(gcodeMove?.absolute_coordinates),
    absoluteExtrude: Boolean(gcodeMove?.absolute_extrude),
    speedFactor: toFiniteNumber(gcodeMove?.speed_factor, 1),
    speed: toFiniteNumber(gcodeMove?.speed, 0),
    extrudeFactor: toFiniteNumber(gcodeMove?.extrude_factor, 1),
  }
}

function normalizeVirtualSdCard(virtualSdCard: MoonrakerVirtualSdCardStatus | undefined): PrinterFilesSnapshot {
  const hasVirtualSdCard = Boolean(virtualSdCard)

  return {
    type: hasVirtualSdCard ? 'virtual_sdcard' : 'unknown',
    path: virtualSdCard?.file_path ?? null,
    progress: clamp(toFiniteNumber(virtualSdCard?.progress, 0), 0, 1),
    isActive: Boolean(virtualSdCard?.is_active),
    filePosition: Math.max(0, Math.trunc(toFiniteNumber(virtualSdCard?.file_position, 0))),
    fileSize: virtualSdCard?.file_size == null ? null : Math.max(0, Math.trunc(toFiniteNumber(virtualSdCard.file_size, 0))),
  }
}

function normalizePrintStats(
  printStats: MoonrakerPrintStatsStatus | undefined,
  virtualSdCard: MoonrakerVirtualSdCardStatus | undefined,
  displayStatus: MoonrakerDisplayStatus | undefined,
  pauseResume: MoonrakerPauseResumeStatus | undefined,
  webhooks: MoonrakerWebhooksStatus | undefined,
): PrinterPrintJobSnapshot {
  const filename = firstNonEmpty(printStats?.filename, virtualSdCard?.file_path ?? undefined)
  const state = firstNonEmpty(
    printStats?.state,
    webhooks?.state,
    virtualSdCard?.is_active ? 'printing' : undefined,
    'unknown',
  )
  const message = firstNonEmpty(printStats?.message, displayStatus?.message)
  const progress = clamp(
    toFiniteNumber(displayStatus?.progress, toFiniteNumber(virtualSdCard?.progress, 0)),
    0,
    1,
  )
  const info = printStats?.info

  return {
    filename,
    filePath: virtualSdCard?.file_path ?? null,
    state,
    message,
    progress,
    progressPercent: Math.round(progress * 100),
    totalDurationSec: toFiniteNumber(printStats?.total_duration, 0),
    printDurationSec: toFiniteNumber(printStats?.print_duration, 0),
    filamentUsedMm: toFiniteNumber(printStats?.filament_used, 0),
    currentLayer: toNullableNumber(info?.current_layer),
    totalLayer: toNullableNumber(info?.total_layer),
    isPaused: Boolean(pauseResume?.is_paused),
    isActive: state === 'printing' || Boolean(virtualSdCard?.is_active),
  }
}

function normalizeHeater(value: MoonrakerHeaterStatus | undefined): number {
  return toFiniteNumber(value?.temperature, 0)
}

function normalizeFan(value: MoonrakerFanStatus | undefined): number {
  return clamp(toFiniteNumber(value?.speed, 0) * 100, 0, 100)
}

function normalizeDisplayStatus(displayStatus: MoonrakerDisplayStatus | undefined): MoonrakerDisplayStatus {
  return {
    message: displayStatus?.message ?? '',
    progress: clamp(toFiniteNumber(displayStatus?.progress, 0), 0, 1),
  }
}

function normalizePauseResume(pauseResume: MoonrakerPauseResumeStatus | undefined): MoonrakerPauseResumeStatus {
  return {
    is_paused: Boolean(pauseResume?.is_paused),
  }
}

function normalizeWebhooks(webhooks: MoonrakerWebhooksStatus | undefined): MoonrakerWebhooksStatus {
  return {
    state: webhooks?.state ?? '',
    state_message: webhooks?.state_message ?? '',
  }
}

function normalizeFileId(path: string): string {
  const slug = path
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `file-${slug || 'gcode'}`
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60))
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60

  if (hours > 0) {
    return `${hours} ч ${String(restMinutes).padStart(2, '0')} мин`
  }

  return `${restMinutes} мин`
}

function formatFilamentWeight(filamentMm: number | undefined, sizeBytes: number | undefined): string {
  if (typeof filamentMm === 'number' && Number.isFinite(filamentMm) && filamentMm > 0) {
    return `${Math.max(1, Math.round(filamentMm / 1000))} г`
  }

  if (typeof sizeBytes === 'number' && Number.isFinite(sizeBytes) && sizeBytes > 0) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} КБ`
  }

  return '—'
}

function normalizeModifiedDate(modified: number | undefined): string {
  if (typeof modified !== 'number' || !Number.isFinite(modified) || modified <= 0) {
    return new Date(0).toISOString()
  }

  return new Date(modified * 1000).toISOString()
}

function normalizeMaterial(metadata: MoonrakerPrintFileMetadata | undefined): string {
  return firstNonEmpty(metadata?.filament_name, metadata?.filament_type, metadata?.slicer, '—')
}

export function normalizeMoonrakerPrintFiles(items: MoonrakerPrintFileInput[]): PrinterFileItemSnapshot[] {
  return items
    .map((item): PrinterFileItemSnapshot | null => {
      const path = firstNonEmpty(item.path, item.filename)

      if (!path.toLowerCase().endsWith('.gcode')) {
        return null
      }

      return {
        id: normalizeFileId(path),
        name: path,
        printTime: formatDuration(toFiniteNumber(item.metadata?.estimated_time, 0)),
        weight: formatFilamentWeight(item.metadata?.filament_total, item.size),
        material: normalizeMaterial(item.metadata),
        addedAt: normalizeModifiedDate(item.modified),
      }
    })
    .filter((item): item is PrinterFileItemSnapshot => item !== null)
}

function normalizeMacroValues(status: MoonrakerPrinterObjectsStatus | undefined): PrinterMacroStateSnapshot {
  const available: string[] = []
  const values: Record<string, Record<string, unknown>> = {}

  if (!status) {
    return { available, values }
  }

  for (const [key, value] of Object.entries(status)) {
    if (!key.toLowerCase().startsWith('gcode_macro _treed_')) {
      continue
    }

    const macroName = key.slice('gcode_macro '.length)
    available.push(macroName)

    if (isRecord(value)) {
      const normalizedRecord: Record<string, unknown> = {}

      for (const [fieldName, fieldValue] of Object.entries(value)) {
        if (fieldName === 'gcode') {
          continue
        }

        normalizedRecord[fieldName] = fieldValue
      }

      values[macroName] = normalizedRecord
      continue
    }

    values[macroName] = {}
  }

  return {
    available,
    values,
  }
}

function readMacro(values: Record<string, Record<string, unknown>>, macroName: string): Record<string, unknown> | undefined {
  return values[macroName]
}

function parseMacroBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()

    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) {
      return true
    }

    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
      return false
    }
  }

  return null
}

function readBooleanMacroFlag(values: Record<string, Record<string, unknown>>, macroName: string): boolean {
  const macro = readMacro(values, macroName)

  if (!macro) {
    return false
  }

  const enabledFlag = parseMacroBoolean(macro.enabled)
  if (enabledFlag !== null) {
    return enabledFlag
  }

  const activeFlag = parseMacroBoolean(macro.active)
  if (activeFlag !== null) {
    return activeFlag
  }

  const isActiveFlag = parseMacroBoolean(macro.is_active)
  if (isActiveFlag !== null) {
    return isActiveFlag
  }

  return true
}

function normalizeHardware(macros: PrinterMacroStateSnapshot): PrinterHardwareSnapshot {
  const profileMacro = readMacro(macros.values, '_TREED_PROFILE')
  const model = firstNonEmpty(
    typeof profileMacro?.model === 'string' ? profileMacro.model : undefined,
    typeof profileMacro?.name === 'string' ? profileMacro.name : undefined,
    'TreeD V2',
  )
  const revision = firstNonEmpty(
    typeof profileMacro?.revision === 'string' ? profileMacro.revision : undefined,
    typeof profileMacro?.variant === 'string' ? profileMacro.variant : undefined,
  )

  return {
    marker: 'treed-v2',
    profile: 'treed_v2_corexy_v1',
    host: 'Rock Pi / Armbian Debian 12',
    mainMcu: 'Octopus Pro CAN',
    toolheadMcu: 'EBB42 CAN',
    probe: 'Eddy Duo CAN',
    model,
    revision: revision.length > 0 ? revision : null,
  }
}

function normalizeCapabilities(macros: PrinterMacroStateSnapshot): PrinterCapabilitiesSnapshot {
  const systemPower = readBooleanMacroFlag(macros.values, '_TREED_SYSTEM_POWER')

  return {
    print: true,
    motion: true,
    thermal: true,
    fan: true,
    filament: true,
    console: true,
    eddy: true,
    shaper: true,
    motionTest: true,
    power: systemPower,
    network: false,
    cloud: readBooleanMacroFlag(macros.values, '_TREED_CLOUD'),
    updates: readBooleanMacroFlag(macros.values, '_TREED_UPDATES'),
    systemPower,
    camera: readBooleanMacroFlag(macros.values, '_TREED_CAMERA') || readBooleanMacroFlag(macros.values, '_TREED_CAM_STATE'),
    serviceCommands: readBooleanMacroFlag(macros.values, '_TREED_SERVICE_COMMANDS'),
  }
}

function normalizeToolheadRuntime(
  toolhead: PrinterPositionSnapshot,
  homedAxes: string,
  macros: PrinterMacroStateSnapshot,
): PrinterToolheadRuntimeSnapshot {
  const geometryMacro = readMacro(macros.values, '_TREED_GEOMETRY_CFG')

  return {
    rawX: toolhead.x,
    rawY: toolhead.y,
    rawZ: toolhead.z,
    rawE: toolhead.e,
    printOffsetX: toFiniteNumber(geometryMacro?.print_offset_x, 0),
    printOffsetY: toFiniteNumber(geometryMacro?.print_offset_y, 65),
    homedAxes,
    coordinateMode: 'raw',
  }
}

function normalizeEddyStatus(
  webhooks: MoonrakerWebhooksStatus,
  homedAxes: string,
): PrinterV2Snapshot['eddy']['status'] {
  const message = webhooks.state_message?.toLowerCase() ?? ''

  if (message.includes('must calibrate probe_eddy_current first')) {
    return 'uncalibrated'
  }

  const lowerHomedAxes = homedAxes.toLowerCase()
  if (!lowerHomedAxes.includes('x') || !lowerHomedAxes.includes('y')) {
    return 'requires_xy_home'
  }

  if (lowerHomedAxes.includes('z')) {
    return 'ready'
  }

  return 'unknown'
}

function normalizeV2Snapshot(
  macros: PrinterMacroStateSnapshot,
  webhooks: MoonrakerWebhooksStatus,
  homedAxes: string,
): PrinterV2Snapshot {
  const eddyAutosave = readMacro(macros.values, '_TREED_EDDY_Z_OFFSET_AUTOSAVE_STATE')

  return {
    branch: 'treed-v2',
    profile: 'treed_v2_corexy_v1',
    eddy: {
      status: normalizeEddyStatus(webhooks, homedAxes),
      autosaveEnabled: Boolean(eddyAutosave?.enabled),
      autosavePending: Boolean(eddyAutosave?.has_pending),
    },
  }
}

function normalizeIpAddress(moonrakerUrl?: string): string {
  if (!moonrakerUrl) {
    return 'unknown'
  }

  try {
    return new URL(moonrakerUrl).hostname || 'unknown'
  } catch {
    return 'unknown'
  }
}

export function normalizeMoonrakerRuntimeSnapshot(
  payload: MoonrakerObjectsQueryPayload,
  options: MoonrakerNormalizeOptions = {},
): PrinterRuntimeSnapshot {
  const status = payload.status ?? {}
  const toolhead = normalizeToolhead(status.toolhead, status.gcode_move)
  const gcodeMove = normalizeGcodeMove(status.gcode_move)
  const virtualSdCard = normalizeVirtualSdCard(status.virtual_sdcard)
  const displayStatus = normalizeDisplayStatus(status.display_status)
  const webhooks = normalizeWebhooks(status.webhooks)
  const printJob = normalizePrintStats(status.print_stats, status.virtual_sdcard, status.display_status, status.pause_resume, status.webhooks)
  const macros = normalizeMacroValues(status)
  const homedAxes = typeof status.toolhead?.homed_axes === 'string' ? status.toolhead.homed_axes : ''

  return {
    source: options.source ?? 'live',
    connection: normalizeConnectionState(status.webhooks),
    wifiSsid: options.wifiSsid ?? 'Moonraker Network',
    ipAddress: normalizeIpAddress(options.moonrakerUrl),
    state: firstNonEmpty(printJob.state, webhooks.state, 'unknown'),
    toolheadX: toolhead.x,
    toolheadY: toolhead.y,
    toolheadZ: toolhead.z,
    homedAxes,
    extruderTemp: normalizeHeater(status.extruder),
    bedTemp: normalizeHeater(status.heater_bed),
    modelFanPercent: normalizeFan(status.fan),
    updatedAt: options.nowIso ?? new Date().toISOString(),
    message: firstNonEmpty(printJob.message, displayStatus.message, webhooks.state_message),
    hardware: normalizeHardware(macros),
    capabilities: normalizeCapabilities(macros),
    printJob,
    files: virtualSdCard.type === 'virtual_sdcard'
      ? virtualSdCard
      : {
          type: 'unknown',
          path: null,
          progress: 0,
          isActive: false,
          filePosition: 0,
          fileSize: null,
        },
    toolhead: normalizeToolheadRuntime(toolhead, homedAxes, macros),
    geometry: {
      toolhead,
      gcode: gcodeMove.gcode,
      homingOrigin: gcodeMove.homingOrigin,
      absoluteCoordinates: gcodeMove.absoluteCoordinates,
      absoluteExtrude: gcodeMove.absoluteExtrude,
      speedFactor: gcodeMove.speedFactor,
      speed: gcodeMove.speed,
      extrudeFactor: gcodeMove.extrudeFactor,
    },
    macros,
    printFiles: normalizeMoonrakerPrintFiles(options.printFiles ?? []),
    v2: normalizeV2Snapshot(macros, webhooks, homedAxes),
  }
}

export {
  normalizeCapabilities,
  normalizeConnectionState,
  normalizeDisplayStatus,
  normalizeFan,
  normalizeGcodeMove,
  normalizeHardware,
  normalizeHeater,
  normalizeMacroValues,
  normalizePauseResume,
  normalizePrintStats,
  normalizeToolheadRuntime,
  normalizeToolhead,
  normalizeV2Snapshot,
  normalizeVirtualSdCard,
  normalizeWebhooks,
}
