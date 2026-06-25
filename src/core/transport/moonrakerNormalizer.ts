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
  PrinterRevisionSource,
  PrinterRuntimeSnapshot,
  PrinterRuntimeTuneSnapshot,
  PrinterSource,
  PrinterTransportState,
  PrinterThermalTargetsSnapshot,
  PrinterToolheadRuntimeSnapshot,
  PrinterUiContractSnapshot,
  PrinterV2Snapshot,
} from './types'
import {
  getPrinterFileDirectoryFromPath,
  getPrinterFileNameFromPath,
  normalizePrinterFileId,
  normalizePrinterFilePath,
  TREED_V2_COREXY_V1_LIMITS,
  type PrinterFilePreview,
  type PrinterFilePreviewImage,
} from '@treed/printer-logic'

const EXPECTED_UI_CONTRACT_VERSION = '1.0' as const
const EXPECTED_UI_PROFILE = 'treed_v2_corexy_v1'

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
  firmware_retraction?: MoonrakerFirmwareRetractionStatus
  display_status?: MoonrakerDisplayStatus
  pause_resume?: MoonrakerPauseResumeStatus
  webhooks?: MoonrakerWebhooksStatus
  [key: string]: unknown
}

export interface MoonrakerToolheadStatus {
  position?: Array<number | null | undefined>
  homed_axes?: string
  max_accel?: number
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
  pressure_advance?: number
}

export interface MoonrakerFanStatus {
  speed?: number
}

export interface MoonrakerFirmwareRetractionStatus {
  retract_length?: number
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
  revisionSource?: PrinterRevisionSource
  transportState?: PrinterTransportState
  receivedAt?: number
  moonrakerUrl?: string
  wifiSsid?: string
  printFiles?: MoonrakerPrintFileInput[]
  printFilesError?: string | null
  nowIso?: string
}

export interface MoonrakerPrintFileMetadata {
  estimated_time?: number
  filament_total?: number
  filament_weight_total?: number
  filament_name?: string
  filament_type?: string
  slicer?: string
  thumbnail?: MoonrakerPrintFileThumbnail | string
  thumbnail_path?: string
  thumbnails?: MoonrakerPrintFileThumbnail[]
}

export interface MoonrakerPrintFileThumbnail {
  width?: number | string
  height?: number | string
  format?: string
  type?: string
  mime_type?: string
  url?: string
  path?: string
  filename?: string
  relative_path?: string
  thumbnail_path?: string
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

function normalizeKlippyState(webhooks?: MoonrakerWebhooksStatus): PrinterRuntimeSnapshot['klippy'] {
  const state = webhooks?.state?.toLowerCase()
  const message = webhooks?.state_message ?? ''

  if (state === 'ready') {
    return { state: 'ready', message }
  }

  if (state === 'startup') {
    return { state: 'startup', message }
  }

  if (state === 'shutdown') {
    return { state: 'shutdown', message }
  }

  if (state === 'error') {
    return { state: 'error', message }
  }

  return { state: 'disconnected', message }
}

function normalizeConnectionState(
  transportState: PrinterTransportState,
  klippyState: PrinterRuntimeSnapshot['klippy']['state'],
): PrinterConnectionState {
  if (transportState !== 'online') {
    return transportState
  }

  if (klippyState === 'ready') {
    return 'online'
  }

  if (klippyState === 'startup') {
    return 'connecting'
  }

  if (klippyState === 'shutdown') {
    return 'shutdown'
  }

  return 'offline'
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

function normalizeThermalTargets(
  extruder: MoonrakerHeaterStatus | undefined,
  heaterBed: MoonrakerHeaterStatus | undefined,
): PrinterThermalTargetsSnapshot {
  return {
    nozzle: toFiniteNumber(extruder?.target, 0),
    bed: toFiniteNumber(heaterBed?.target, 0),
  }
}

function normalizeRuntimeTune(
  toolhead: MoonrakerToolheadStatus | undefined,
  gcodeMove: PrinterGeometrySnapshot,
  extruder: MoonrakerHeaterStatus | undefined,
  firmwareRetraction: MoonrakerFirmwareRetractionStatus | undefined,
  macros: PrinterMacroStateSnapshot,
): PrinterRuntimeTuneSnapshot {
  const uiTuneState = readMacro(macros.values, '_TREED_UI_TUNE_STATE')
  const contractVersion = typeof uiTuneState?.contract_version === 'string'
    ? uiTuneState.contract_version
    : null

  return {
    contractVersion,
    speedFactorPercent: Math.round(gcodeMove.speedFactor * 100),
    flowFactorPercent: Math.round(gcodeMove.extrudeFactor * 100),
    accelMmS2: toFiniteNumber(toolhead?.max_accel, 0),
    pressureAdvance: toFiniteNumber(extruder?.pressure_advance, 0),
    retractLengthMm: toFiniteNumber(firmwareRetraction?.retract_length, 0),
    appliedBabystepMm: toFiniteNumber(uiTuneState?.applied_babystep, 0),
  }
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

function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60))
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60

  if (hours > 0) {
    return `${hours} ч ${String(restMinutes).padStart(2, '0')} мин`
  }

  return `${restMinutes} мин`
}

function formatFilamentWeight(weightGrams: number | undefined): string {
  if (typeof weightGrams === 'number' && Number.isFinite(weightGrams) && weightGrams > 0) {
    return `${Math.max(1, Math.round(weightGrams))} г`
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
  return firstNonEmpty(metadata?.filament_name, metadata?.filament_type, '—')
}

function encodeMoonrakerFilePath(path: string): string {
  return normalizePrinterFilePath(path)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function normalizePreviewSrc(value: string): string | null {
  const src = value.trim()
  if (src.length === 0) {
    return null
  }

  if (/^https?:\/\//i.test(src)) {
    return src
  }

  if (src.startsWith('/server/files/')) {
    return src
  }

  return `/server/files/gcodes/${encodeMoonrakerFilePath(src)}`
}

function getThumbnailSource(thumbnail: MoonrakerPrintFileThumbnail | string): string {
  return typeof thumbnail === 'string'
    ? thumbnail
    : firstNonEmpty(
        thumbnail.url,
        thumbnail.relative_path,
        thumbnail.thumbnail_path,
        thumbnail.path,
        thumbnail.filename,
      )
}

function inferPreviewSizeFromSource(src: string): 48 | 300 | null {
  const match = src.match(/(?:^|[^0-9])(48|300)x\1(?:[^0-9]|$)/i)
  if (match?.[1] === '48') {
    return 48
  }
  if (match?.[1] === '300') {
    return 300
  }

  return null
}

function getPreviewSize(thumbnail: MoonrakerPrintFileThumbnail | string, src: string): 48 | 300 | null {
  if (typeof thumbnail === 'string') {
    return inferPreviewSizeFromSource(src)
  }

  const width = Math.round(toFiniteNumber(thumbnail.width, 0))
  const height = Math.round(toFiniteNumber(thumbnail.height, 0))
  if ((width === 48 || width === 300) && width === height) {
    return width
  }

  return inferPreviewSizeFromSource(src)
}

function isPngThumbnail(thumbnail: MoonrakerPrintFileThumbnail | string, src: string): boolean {
  if (typeof thumbnail !== 'string') {
    const type = firstNonEmpty(thumbnail.format, thumbnail.type, thumbnail.mime_type).toLowerCase()
    if (type === 'png' || type === 'image/png') {
      return true
    }
  }

  return src.split('?')[0]?.toLowerCase().endsWith('.png') === true
}

function normalizePreviewImage(thumbnail: MoonrakerPrintFileThumbnail | string): PrinterFilePreviewImage | null {
  const rawSrc = getThumbnailSource(thumbnail)
  const src = normalizePreviewSrc(rawSrc)
  if (src === null || !isPngThumbnail(thumbnail, src)) {
    return null
  }

  const size = getPreviewSize(thumbnail, src)
  if (size === null) {
    return null
  }

  return {
    src,
    width: size,
    height: size,
    format: 'png',
  }
}

function normalizeFilePreview(metadata: MoonrakerPrintFileMetadata | undefined): PrinterFilePreview | undefined {
  if (metadata === undefined) {
    return undefined
  }

  const candidates: Array<MoonrakerPrintFileThumbnail | string> = [
    ...(metadata.thumbnails ?? []),
  ]
  if (metadata.thumbnail !== undefined) {
    candidates.push(metadata.thumbnail)
  }
  if (metadata.thumbnail_path !== undefined) {
    candidates.push(metadata.thumbnail_path)
  }

  let small: PrinterFilePreviewImage | undefined
  let large: PrinterFilePreviewImage | undefined
  for (const candidate of candidates) {
    const preview = normalizePreviewImage(candidate)
    if (preview === null) {
      continue
    }

    if (preview.width === 48 && small === undefined) {
      small = preview
    }
    if (preview.width === 300 && large === undefined) {
      large = preview
    }
  }

  return small === undefined && large === undefined
    ? undefined
    : {
        ...(small !== undefined ? { small } : {}),
        ...(large !== undefined ? { large } : {}),
      }
}

export function normalizeMoonrakerPrintFiles(items: MoonrakerPrintFileInput[]): PrinterFileItemSnapshot[] {
  return items
    .map((item): PrinterFileItemSnapshot | null => {
      const path = normalizePrinterFilePath(firstNonEmpty(item.path, item.filename))

      if (!path.toLowerCase().endsWith('.gcode')) {
        return null
      }

      const preview = normalizeFilePreview(item.metadata)

      return {
        id: normalizePrinterFileId(path),
        path,
        name: getPrinterFileNameFromPath(path),
        directory: getPrinterFileDirectoryFromPath(path),
        printTime: formatDuration(toFiniteNumber(item.metadata?.estimated_time, 0)),
        weight: formatFilamentWeight(item.metadata?.filament_weight_total),
        material: normalizeMaterial(item.metadata),
        addedAt: normalizeModifiedDate(item.modified),
        ...(preview !== undefined ? { preview } : {}),
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
    if (!key.toLowerCase().startsWith('gcode_macro ')) {
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

function normalizeUiContract(macros: PrinterMacroStateSnapshot): PrinterUiContractSnapshot {
  const contract = readMacro(macros.values, '_TREED_UI_CONTRACT')
  if (contract === undefined) {
    return {
      status: 'legacy',
      expectedVersion: EXPECTED_UI_CONTRACT_VERSION,
      contractVersion: null,
      profile: null,
      requiredMacros: [],
      missingMacros: [],
      message: 'Device contract еще не опубликован.',
    }
  }

  const contractVersion = typeof contract.contract_version === 'string'
    ? contract.contract_version.trim()
    : null
  const profile = typeof contract.profile === 'string' ? contract.profile.trim() : null
  const requiredMacros = typeof contract.required_macros === 'string'
    ? contract.required_macros.split(',').map((item) => item.trim()).filter(Boolean)
    : []
  const availableMacros = new Set(macros.available.map((macro) => macro.toUpperCase()))
  const missingMacros = requiredMacros.filter((macro) => !availableMacros.has(macro.toUpperCase()))
  const incompatibilities: string[] = []

  if (contractVersion !== EXPECTED_UI_CONTRACT_VERSION) {
    incompatibilities.push(`версия ${contractVersion ?? 'не указана'}`)
  }
  if (profile !== EXPECTED_UI_PROFILE) {
    incompatibilities.push(`профиль ${profile ?? 'не указан'}`)
  }
  if (missingMacros.length > 0) {
    incompatibilities.push(`нет macro: ${missingMacros.join(', ')}`)
  }

  return {
    status: incompatibilities.length === 0 ? 'compatible' : 'incompatible',
    expectedVersion: EXPECTED_UI_CONTRACT_VERSION,
    contractVersion,
    profile,
    requiredMacros,
    missingMacros,
    message: incompatibilities.length === 0
      ? null
      : `Несовместимый TreeD UI contract: ${incompatibilities.join('; ')}.`,
  }
}

function readContractNumber(
  contract: Record<string, unknown> | undefined,
  field: string,
  fallback: number,
): number {
  const value = contract?.[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeLimits(
  macros: PrinterMacroStateSnapshot,
  uiContract: PrinterUiContractSnapshot,
): typeof TREED_V2_COREXY_V1_LIMITS {
  if (uiContract.status !== 'compatible') {
    return TREED_V2_COREXY_V1_LIMITS
  }

  const contract = readMacro(macros.values, '_TREED_UI_CONTRACT')
  return {
    nozzleMaxC: readContractNumber(contract, 'nozzle_max_c', TREED_V2_COREXY_V1_LIMITS.nozzleMaxC),
    bedMaxC: readContractNumber(contract, 'bed_max_c', TREED_V2_COREXY_V1_LIMITS.bedMaxC),
    axis: {
      X: {
        min: readContractNumber(contract, 'axis_x_min', TREED_V2_COREXY_V1_LIMITS.axis.X.min),
        max: readContractNumber(contract, 'axis_x_max', TREED_V2_COREXY_V1_LIMITS.axis.X.max),
      },
      Y: {
        min: readContractNumber(contract, 'axis_y_min', TREED_V2_COREXY_V1_LIMITS.axis.Y.min),
        max: readContractNumber(contract, 'axis_y_max', TREED_V2_COREXY_V1_LIMITS.axis.Y.max),
      },
      Z: {
        min: readContractNumber(contract, 'axis_z_min', TREED_V2_COREXY_V1_LIMITS.axis.Z.min),
        max: readContractNumber(contract, 'axis_z_max', TREED_V2_COREXY_V1_LIMITS.axis.Z.max),
      },
    },
  }
}

function normalizeHardware(
  macros: PrinterMacroStateSnapshot,
  uiContract: PrinterUiContractSnapshot,
): PrinterHardwareSnapshot {
  const profileMacro = readMacro(macros.values, '_TREED_PROFILE')
  const contractMacro = uiContract.status === 'compatible'
    ? readMacro(macros.values, '_TREED_UI_CONTRACT')
    : undefined
  const model = firstNonEmpty(
    typeof contractMacro?.model === 'string' ? contractMacro.model : undefined,
    typeof profileMacro?.model === 'string' ? profileMacro.model : undefined,
    typeof profileMacro?.name === 'string' ? profileMacro.name : undefined,
    'TreeD V2',
  )
  const revision = firstNonEmpty(
    typeof contractMacro?.revision === 'string' ? contractMacro.revision : undefined,
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

function normalizeCapabilities(
  macros: PrinterMacroStateSnapshot,
  uiContract: PrinterUiContractSnapshot,
): PrinterCapabilitiesSnapshot {
  const systemPower = readBooleanMacroFlag(macros.values, '_TREED_SYSTEM_POWER')

  if (uiContract.status === 'incompatible') {
    return {
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
    }
  }

  if (uiContract.status === 'compatible') {
    const contract = readMacro(macros.values, '_TREED_UI_CONTRACT') ?? {}
    const capability = (name: string): boolean => parseMacroBoolean(contract[`capability_${name}`]) === true

    return {
      print: capability('print'),
      motion: capability('motion'),
      thermal: capability('thermal'),
      fan: capability('fan'),
      filament: capability('filament'),
      console: capability('console'),
      eddy: capability('eddy'),
      shaper: capability('shaper'),
      motionTest: capability('motion_test'),
      power: capability('system_power') && systemPower,
      network: capability('network'),
      cloud: readBooleanMacroFlag(macros.values, '_TREED_CLOUD'),
      updates: readBooleanMacroFlag(macros.values, '_TREED_UPDATES'),
      systemPower: capability('system_power') && systemPower,
      camera: capability('camera'),
      serviceCommands: capability('service_commands') && readBooleanMacroFlag(macros.values, '_TREED_SERVICE_COMMANDS'),
    }
  }

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
  const uiContract = normalizeUiContract(macros)
  const homedAxes = typeof status.toolhead?.homed_axes === 'string' ? status.toolhead.homed_axes : ''
  const source = options.source ?? 'live'
  const revisionSource = options.revisionSource ?? (source === 'mock' ? 'mock' : 'http')
  const receivedAt = options.receivedAt ?? Date.now()
  const transportState = options.transportState ?? 'online'
  const klippy = normalizeKlippyState(status.webhooks)

  return {
    source,
    revisions: {
      printerObjects: {
        eventtime: toNullableNumber(payload.eventtime),
        receivedAt,
        source: revisionSource,
      },
      files: options.printFiles === undefined
        ? null
        : {
            eventtime: null,
            receivedAt,
            source: revisionSource,
          },
    },
    transport: {
      state: transportState,
      message: null,
    },
    klippy,
    connection: uiContract.status === 'incompatible'
      ? 'degraded'
      : normalizeConnectionState(transportState, klippy.state),
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
    message: firstNonEmpty(
      uiContract.status === 'incompatible' ? uiContract.message : null,
      printJob.message,
      displayStatus.message,
      webhooks.state_message,
    ),
    hardware: normalizeHardware(macros, uiContract),
    uiContract,
    capabilities: normalizeCapabilities(macros, uiContract),
    limits: normalizeLimits(macros, uiContract),
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
    fileList: {
      state: options.printFilesError ? 'error' : options.printFiles === undefined ? 'unknown' : 'ready',
      message: options.printFilesError ?? null,
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
    thermalTargets: normalizeThermalTargets(status.extruder, status.heater_bed),
    runtimeTune: normalizeRuntimeTune(status.toolhead, gcodeMove, status.extruder, status.firmware_retraction, macros),
    macros,
    printFiles: normalizeMoonrakerPrintFiles(options.printFiles ?? []),
    v2: normalizeV2Snapshot(macros, webhooks, homedAxes),
  }
}

export {
  normalizeCapabilities,
  normalizeConnectionState,
  normalizeKlippyState,
  normalizeUiContract,
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
