import type {
  PrinterCapabilitiesSnapshot,
  FilamentSensorSnapshot,
  PrinterEddyCalibrationSnapshot,
  PrinterEddyCalibrationStep,
  PrinterEddyOperatorPrompt,
  PrinterExcludeObjectSnapshot,
  PrinterFileItemSnapshot,
  PrinterFilesSnapshot,
  PrinterGeometrySnapshot,
  PrinterJobState,
  PrinterHardwareSnapshot,
  PrinterCameraSnapshot,
  PrinterCalibrationSnapshot,
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
  PrinterUsageSnapshot,
  PrinterV2Snapshot,
} from './types'
import {
  type DriverMode,
  type DriverModeSnapshot,
  readPrinterEvent,
  getPrinterFileDirectoryFromPath,
  getPrinterFileNameFromPath,
  normalizePrinterFileId,
  normalizePrinterFilePath,
  TREED_V2_COREXY_V1_LIMITS,
  type PrinterFileMetadataStatus,
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
  exclude_object?: MoonrakerExcludeObjectStatus
  webhooks?: MoonrakerWebhooksStatus
  save_variables?: MoonrakerSaveVariablesStatus
  [key: string]: unknown
}

export interface MoonrakerToolheadStatus {
  position?: Array<number | null | undefined>
  homed_axes?: string
  axis_minimum?: Array<number | null | undefined>
  axis_maximum?: Array<number | null | undefined>
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

export interface MoonrakerOutputPinStatus {
  value?: number
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

export interface MoonrakerExcludeObjectStatus {
  objects?: unknown
  current_object?: unknown
  excluded_objects?: unknown
}

export interface MoonrakerWebhooksStatus {
  state?: string
  state_message?: string
}

export interface MoonrakerSaveVariablesStatus {
  variables?: Record<string, unknown>
}

export interface MoonrakerNormalizeOptions {
  availableObjects?: readonly string[]
  source?: PrinterSource
  revisionSource?: PrinterRevisionSource
  transportState?: PrinterTransportState
  receivedAt?: number
  moonrakerUrl?: string
  wifiSsid?: string
  printFiles?: MoonrakerPrintFileInput[]
  printFilesError?: string | null
  usage?: PrinterUsageSnapshot
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
  metadataStatus?: PrinterFileMetadataStatus
  metadataError?: string | null
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numericValue = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(numericValue) ? numericValue : fallback
}

function toNullableNumber(value: unknown): number | null {
  const numericValue = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(numericValue) ? numericValue : null
}

function readNullableNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function toLayerNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
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
    filePosition: Math.max(0, Math.trunc(toFiniteNumber(virtualSdCard?.file_position, 0))),
    fileSize: virtualSdCard?.file_size == null ? null : Math.max(0, Math.trunc(toFiniteNumber(virtualSdCard.file_size, 0))),
  }
}

const PRINT_STATS_STATES: Record<string, PrinterJobState | undefined> = {
  standby: 'idle',
  pending: 'preparing',
  printing: 'printing',
  paused: 'paused',
  complete: 'complete',
  cancelled: 'cancelled',
  error: 'error',
}

function normalizePrintStats(
  printStats: MoonrakerPrintStatsStatus | undefined,
  virtualSdCard: MoonrakerVirtualSdCardStatus | undefined,
  displayStatus: MoonrakerDisplayStatus | undefined,
  pauseResume: MoonrakerPauseResumeStatus | undefined,
): PrinterPrintJobSnapshot {
  const filename = firstNonEmpty(printStats?.filename, virtualSdCard?.file_path ?? undefined)
  const rawState = printStats?.state?.trim().toLowerCase()
  const mappedState = rawState === undefined ? undefined : PRINT_STATS_STATES[rawState]
  const state: PrinterJobState = mappedState === 'printing' && pauseResume?.is_paused
    ? 'paused'
    : mappedState ?? (pauseResume?.is_paused ? 'paused' : virtualSdCard?.is_active ? 'printing' : 'unknown')
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
    currentLayer: toLayerNumber(info?.current_layer),
    totalLayer: toLayerNumber(info?.total_layer) || null,
  }
}

function readObjectField(value: Record<string, unknown>, ...fieldNames: string[]): unknown {
  for (const fieldName of fieldNames) {
    if (fieldName in value) {
      return value[fieldName]
    }
  }

  return undefined
}

function normalizeExcludeObjectName(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeExcludeObjectPoint(value: unknown): { x: number, y: number } | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null
  }

  const x = toNullableNumber(value[0])
  const y = toNullableNumber(value[1])
  return x === null || y === null ? null : { x, y }
}

function normalizeExcludeObjectPolygon(value: unknown): Array<{ x: number, y: number }> | null {
  if (!Array.isArray(value)) {
    return null
  }

  const points: Array<{ x: number, y: number }> = []
  for (const point of value) {
    const normalizedPoint = normalizeExcludeObjectPoint(point)
    if (normalizedPoint === null) {
      return null
    }
    points.push(normalizedPoint)
  }

  return points.length >= 3 ? points : null
}

function normalizeExcludeObjectNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const names: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const name = normalizeExcludeObjectName(item)
    if (name === null || seen.has(name)) {
      continue
    }
    seen.add(name)
    names.push(name)
  }

  return names
}

function normalizeExcludeObjects(
  excludeObject: MoonrakerExcludeObjectStatus | undefined,
  printJob: PrinterPrintJobSnapshot,
): PrinterExcludeObjectSnapshot {
  if (excludeObject === undefined) {
    return {
      supported: false,
      state: 'unavailable',
      objects: [],
      currentObjectName: null,
      excludedObjectNames: [],
      message: 'Исключение объектов не поддерживается текущей конфигурацией принтера.',
    }
  }

  const currentObjectName = normalizeExcludeObjectName(excludeObject.current_object)
  const excludedObjectNames = normalizeExcludeObjectNames(excludeObject.excluded_objects)
  const excludedObjectNameSet = new Set(excludedObjectNames)
  const objects: PrinterExcludeObjectSnapshot['objects'] = []
  const seenObjects = new Set<string>()

  if (Array.isArray(excludeObject.objects)) {
    for (const rawObject of excludeObject.objects) {
      if (!isRecord(rawObject)) {
        continue
      }

      const name = normalizeExcludeObjectName(readObjectField(rawObject, 'name', 'NAME'))
      if (name === null || seenObjects.has(name)) {
        continue
      }
      seenObjects.add(name)

      const center = normalizeExcludeObjectPoint(readObjectField(rawObject, 'center', 'CENTER'))
      const polygon = normalizeExcludeObjectPolygon(readObjectField(rawObject, 'polygon', 'POLYGON'))
      objects.push({
        name,
        displayName: name.replaceAll('_', ' '),
        center,
        polygon,
        isCurrent: currentObjectName === name,
        isExcluded: excludedObjectNameSet.has(name),
      })
    }
  }

  const unknownExcludedObjectNames = excludedObjectNames.filter((name) => !seenObjects.has(name))
  const unknownExcludedMessage = unknownExcludedObjectNames.length > 0
    ? `Klipper сообщает исключённые объекты вне текущей разметки: ${unknownExcludedObjectNames.join(', ')}.`
    : null
  if (objects.length === 0) {
    const hasPrintAdvanced = printJob.printDurationSec >= 20 || printJob.progress >= 0.02
    return {
      supported: true,
      state: hasPrintAdvanced ? 'ready' : 'waiting',
      objects,
      currentObjectName,
      excludedObjectNames,
      message: hasPrintAdvanced ? 'В этом файле нет разметки отдельных объектов.' : 'Получение списка объектов...',
    }
  }

  return {
    supported: true,
    state: 'ready',
    objects,
    currentObjectName,
    excludedObjectNames,
    message: unknownExcludedMessage,
  }
}

function normalizeHeater(value: MoonrakerHeaterStatus | undefined): number {
  return toFiniteNumber(value?.temperature, 0)
}

function normalizeFan(value: MoonrakerFanStatus | undefined): number {
  return clamp(toFiniteNumber(value?.speed, 0) * 100, 0, 100)
}

function normalizeDriverMode(value: unknown): DriverModeSnapshot {
  const record = isRecord(value) ? value : {}
  const isMode = (mode: unknown): mode is DriverMode => mode === 'normal' || mode === 'quiet'
  const availableModes = Array.isArray(record.available_modes) ? record.available_modes.filter(isMode) : []
  const mode = isMode(record.mode) ? record.mode : null
  const state = record.state === 'ready' || record.state === 'applying' || record.state === 'fault'
    ? record.state : 'unavailable'
  const supported = record.contract_version === '1.0' && availableModes.includes('normal')
    && state !== 'unavailable' && (state !== 'ready' || (mode !== null && availableModes.includes(mode)))
  const percent = (raw: unknown): number | null => typeof raw === 'number' && Number.isFinite(raw)
    && raw >= 0 && raw <= 1 ? Math.round(raw * 100) : null
  const effective = isRecord(record.effective_modes) ? record.effective_modes : {}
  return {
    supported, mode: supported ? mode : null, state: supported ? state : 'unavailable',
    availableModes: supported ? availableModes : [], needsRestart: record.needs_restart === true,
    message: typeof record.message === 'string' ? record.message : null,
    effectiveModes: Object.fromEntries(['X', 'Y', 'Z'].map((axis) => [axis, isMode(effective[axis]) ? effective[axis] : null])),
    speedPercent: percent(record.speed), activePercent: percent(record.active_speed), idlePercent: percent(record.idle_speed),
    powerControlSupported: record.power_control === true && percent(record.min_power) !== null
      && percent(record.max_power) !== null && (record.min_power as number) <= (record.max_power as number),
    minPowerPercent: percent(record.min_power) === null ? null : Math.ceil((record.min_power as number) * 100),
    maxPowerPercent: percent(record.max_power) === null ? null : Math.floor((record.max_power as number) * 100),
    loadReason: typeof record.load_reason === 'string' ? record.load_reason : null,
  }
}

function normalizeMainLight(status: MoonrakerPrinterObjectsStatus): boolean {
  const outputPin = status['output_pin chamber_light'] as MoonrakerOutputPinStatus | undefined

  return toFiniteNumber(outputPin?.value, 0) > 0
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

function formatDuration(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return '—'
  }

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

type NormalizeMoonrakerPrintFilesOptions = {
  moonrakerUrl?: string
}

function toMoonrakerUrl(path: string, moonrakerUrl: string | undefined): string {
  return moonrakerUrl === undefined
    ? path
    : new URL(path, moonrakerUrl).toString()
}

function resolveRelativePreviewPath(src: string, filePath: string | undefined): string {
  if (filePath === undefined) {
    return src
  }

  const normalizedSrc = normalizePrinterFilePath(src)
  if (!normalizedSrc.startsWith('.thumbs/')) {
    return normalizedSrc
  }

  const directory = getPrinterFileDirectoryFromPath(filePath)
  return directory === null ? normalizedSrc : `${directory}/${normalizedSrc}`
}

function normalizePreviewSrc(
  value: string,
  moonrakerUrl: string | undefined,
  filePath: string | undefined,
): string | null {
  const src = value.trim()
  if (src.length === 0) {
    return null
  }

  if (/^https?:\/\//i.test(src)) {
    return src
  }

  if (src.startsWith('/server/files/')) {
    return toMoonrakerUrl(src, moonrakerUrl)
  }

  const previewPath = resolveRelativePreviewPath(src, filePath)
  return toMoonrakerUrl(`/server/files/gcodes/${encodeMoonrakerFilePath(previewPath)}`, moonrakerUrl)
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

function normalizePreviewImage(
  thumbnail: MoonrakerPrintFileThumbnail | string,
  moonrakerUrl: string | undefined,
  filePath: string | undefined,
): PrinterFilePreviewImage | null {
  const rawSrc = getThumbnailSource(thumbnail)
  const src = normalizePreviewSrc(rawSrc, moonrakerUrl, filePath)
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

function normalizeFilePreview(
  metadata: MoonrakerPrintFileMetadata | undefined,
  moonrakerUrl: string | undefined,
  filePath: string | undefined,
): PrinterFilePreview | undefined {
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
    const preview = normalizePreviewImage(candidate, moonrakerUrl, filePath)
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

export function normalizeMoonrakerPrintFiles(
  items: MoonrakerPrintFileInput[],
  options: NormalizeMoonrakerPrintFilesOptions = {},
): PrinterFileItemSnapshot[] {
  return items
    .map((item): PrinterFileItemSnapshot | null => {
      const path = normalizePrinterFilePath(firstNonEmpty(item.path, item.filename))

      if (!path.toLowerCase().endsWith('.gcode')) {
        return null
      }

      const preview = normalizeFilePreview(item.metadata, options.moonrakerUrl, path)

      const metadataStatus = item.metadataStatus ?? (item.metadata === undefined ? 'idle' : undefined)

      return {
        id: normalizePrinterFileId(path),
        path,
        name: getPrinterFileNameFromPath(path),
        directory: getPrinterFileDirectoryFromPath(path),
        printTime: formatDuration(item.metadata?.estimated_time),
        weight: formatFilamentWeight(item.metadata?.filament_weight_total),
        material: normalizeMaterial(item.metadata),
        addedAt: normalizeModifiedDate(item.modified),
        ...(metadataStatus !== undefined ? { metadataStatus } : {}),
        ...(item.metadataError != null ? { metadataError: item.metadataError } : {}),
        ...(preview !== undefined ? { preview } : {}),
      }
    })
    .filter((item): item is PrinterFileItemSnapshot => item !== null)
}

function normalizeMacroValues(
  status: MoonrakerPrinterObjectsStatus | undefined,
  availableObjects?: readonly string[],
): PrinterMacroStateSnapshot {
  const available: string[] = availableObjects === undefined
    ? []
    : availableObjects.filter((name) => name.toLowerCase().startsWith('gcode_macro '))
      .map((name) => name.slice('gcode_macro '.length))
  const values: Record<string, Record<string, unknown>> = {}

  if (!status) {
    return { available, values }
  }

  for (const [key, value] of Object.entries(status)) {
    if (!key.toLowerCase().startsWith('gcode_macro ')) {
      continue
    }

    const macroName = key.slice('gcode_macro '.length)
    if (!available.includes(macroName)) {
      available.push(macroName)
    }

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

function readMacroString(macro: Record<string, unknown> | undefined, fieldName: string): string | null {
  const value = macro?.[fieldName]

  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function readMacroPositiveNumber(macro: Record<string, unknown> | undefined, fieldName: string): number | null {
  const value = toNullableNumber(macro?.[fieldName])

  return value === null || value <= 0 ? null : value
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
  if (typeof contract.required_macros !== 'string') {
    incompatibilities.push('список обязательных macro не указан')
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
  toolhead: MoonrakerToolheadStatus | undefined,
  macros: PrinterMacroStateSnapshot,
  uiContract: PrinterUiContractSnapshot,
): typeof TREED_V2_COREXY_V1_LIMITS {
  const axisLimit = (index: number) => {
    const min = toolhead?.axis_minimum?.[index]
    const max = toolhead?.axis_maximum?.[index]
    return typeof min === 'number' && Number.isFinite(min) &&
      typeof max === 'number' && Number.isFinite(max) && min < max
      ? { min, max }
      : undefined
  }

  const contract = uiContract.status === 'compatible'
    ? readMacro(macros.values, '_TREED_UI_CONTRACT')
    : undefined
  const x = axisLimit(0)
  const y = axisLimit(1)
  const z = axisLimit(2)
  return {
    nozzleMaxC: readContractNumber(contract, 'nozzle_max_c', TREED_V2_COREXY_V1_LIMITS.nozzleMaxC),
    bedMaxC: readContractNumber(contract, 'bed_max_c', TREED_V2_COREXY_V1_LIMITS.bedMaxC),
    axis: {
      ...(x && { X: x }),
      ...(y && { Y: y }),
      ...(z && { Z: z }),
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
  filamentSensor: FilamentSensorSnapshot,
  availableObjects?: readonly string[],
  calibrationObject?: unknown,
): PrinterCapabilitiesSnapshot {
  const calibrationStatus = isRecord(calibrationObject) ? calibrationObject : {}
  const systemPower = readBooleanMacroFlag(macros.values, '_TREED_SYSTEM_POWER')
  const hasMainLightMacros = macros.available.includes('LIGHT_ON') && macros.available.includes('LIGHT_OFF')

  if (uiContract.status !== 'compatible') {
    return {
      print: false,
      motion: false,
      thermal: false,
      fan: false,
      lighting: false,
      lightAsync: false,
      filament: false,
      filamentSensorControl: false,
      filamentEncoderSensitivity: false,
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

  const contract = readMacro(macros.values, '_TREED_UI_CONTRACT') ?? {}
  const capability = (name: string): boolean => parseMacroBoolean(contract[`capability_${name}`]) === true
  const lightingCapability = parseMacroBoolean(contract.capability_lighting)
  const cameraMacro = readMacro(macros.values, '_TREED_CAMERA')
  const cameraEnabled = cameraMacro === undefined ? true : readBooleanMacroFlag(macros.values, '_TREED_CAMERA')

  return {
    print: capability('print'),
    motion: capability('motion'),
    thermal: capability('thermal'),
    fan: capability('fan'),
    lighting: hasMainLightMacros && lightingCapability !== false,
    lightAsync: hasMainLightMacros && lightingCapability !== false && capability('light_async'),
    lightingPreferences: hasMainLightMacros && macros.available.includes('TREED_LIGHT_SETTINGS'),
    filament: capability('filament'),
    filamentSensorControl: capability('filament_sensor_control') && filamentSensor.supported,
    filamentEncoderSensitivity:
      capability('filament_encoder_sensitivity') &&
      filamentSensor.motionSupported &&
      macros.available.includes('_FILAMENT_SENSOR_SENSITIVITY_STATE'),
    console: capability('console'),
    eddy: capability('eddy'),
    shaper: capability('shaper'),
    motionTest: capability('motion_test'),
    power: capability('system_power') && systemPower,
    network: capability('network'),
    cloud: readBooleanMacroFlag(macros.values, '_TREED_CLOUD'),
    updates: readBooleanMacroFlag(macros.values, '_TREED_UPDATES'),
    systemPower: capability('system_power') && systemPower,
    camera: capability('camera') && cameraEnabled,
    serviceCommands: capability('service_commands') && readBooleanMacroFlag(macros.values, '_TREED_SERVICE_COMMANDS'),
    calibrationCommands: {
      temperatureAccept: availableObjects?.includes('treed_calibration') === true && macros.available.includes('TREED_EDDY_TEMPERATURE_ACCEPT'),
      temperatureComplete: availableObjects?.includes('treed_calibration') === true && macros.available.includes('TREED_EDDY_TEMPERATURE_COMPLETE_SAVE'),
      abort: availableObjects?.includes('treed_calibration') === true && macros.available.includes('TREED_EDDY_CALIBRATION_ABORT'),
      probeAccuracy: availableObjects?.includes('treed_calibration') === true && macros.available.includes('TREED_EDDY_PROBE_ACCURACY'),
      setOffsets: availableObjects?.includes('treed_calibration') === true,
      zOffsetAdjust: availableObjects?.includes('treed_calibration') === true && macros.available.includes('TREED_EDDY_Z_OFFSET_ADJUST'),
      zOffsetSave: availableObjects?.includes('treed_calibration') === true && macros.available.includes('TREED_EDDY_Z_OFFSET_SAVE'),
      meshScan: availableObjects?.includes('treed_calibration') === true
        && macros.available.includes('TREED_EDDY_BED_MESH_CALIBRATE'),
      meshScanMethods: availableObjects?.includes('treed_calibration') === true
        && macros.available.includes('TREED_EDDY_BED_MESH_CALIBRATE')
        && parseMacroBoolean(readMacro(macros.values, 'TREED_EDDY_BED_MESH_CALIBRATE')?.scan_methods) === true,
      extruderCalibrationExtrude: availableObjects?.includes('treed_calibration') === true,
      extruderRotationDistance: availableObjects?.includes('treed_calibration') === true,
      accelerometerQuery: parseMacroBoolean(calibrationStatus.accelerometer_configured) === true,
      accelerometerMeasureNoise: parseMacroBoolean(calibrationStatus.accelerometer_configured) === true,
      adxlConfigured: parseMacroBoolean(calibrationStatus.accelerometer_configured) === true,
    },
  }
}

function normalizeCamera(macros: PrinterMacroStateSnapshot, cameraCapability: boolean): PrinterCameraSnapshot {
  const camera = readMacro(macros.values, '_TREED_CAMERA')
  const cameraState = readMacro(macros.values, '_TREED_CAM_STATE')
  const enabledFlag = parseMacroBoolean(camera?.enabled)
  const supported = cameraCapability && enabledFlag !== false
  const active = parseMacroBoolean(cameraState?.enabled) === true

  return {
    supported,
    active,
    resolution: readMacroString(camera, 'resolution'),
    format: readMacroString(camera, 'format'),
    encoder: readMacroString(camera, 'encoder'),
    targetFps: readMacroPositiveNumber(camera, 'target_fps'),
    maxFps: readMacroPositiveNumber(camera, 'max_fps'),
    streamUrl: readMacroString(camera, 'stream_url'),
    snapshotUrl: readMacroString(camera, 'snapshot_url'),
  }
}

function normalizeFilamentSensor(
  status: MoonrakerPrinterObjectsStatus,
  macros: PrinterMacroStateSnapshot,
): FilamentSensorSnapshot {
  const switchStatus = status['filament_switch_sensor filament_switch']
  const motionStatus = status['filament_motion_sensor filament_motion']
  const supported = isRecord(switchStatus)
  const motionSupported = isRecord(motionStatus)
  const modeValue = readMacro(macros.values, 'FILAMENT_SENSOR_STATUS')?.mode
  const actionValue = readMacro(macros.values, 'FILAMENT_SENSOR_STATUS')?.runout_action
  const sensitivityValue = readMacro(macros.values, '_FILAMENT_SENSOR_SENSITIVITY_STATE')?.sensitivity
  const mode = modeValue === 'motion' || modeValue === 'presence'
    ? modeValue
    : isRecord(motionStatus) && motionStatus.enabled === true
      ? 'motion'
      : 'presence'
  const sensitivity = sensitivityValue === 'low' || sensitivityValue === 'medium' || sensitivityValue === 'high'
    ? sensitivityValue
    : 'medium'

  let message: string | null = null
  if (!supported) {
    message = 'Датчик наличия филамента недоступен.'
  } else if (!motionSupported) {
    message = 'Канал движения датчика недоступен.'
  } else if (modeValue !== 'presence' && modeValue !== 'motion') {
    message = 'Состояние режима датчика недоступно.'
  } else if (sensitivityValue !== 'low' && sensitivityValue !== 'medium' && sensitivityValue !== 'high') {
    message = 'Настройки чувствительности энкодера недоступны.'
  }

  return {
    supported,
    motionSupported,
    mode,
    runoutAction: actionValue === 'pause' || actionValue === 'recover' ? actionValue : undefined,
    sensitivity,
    filamentDetected: isRecord(switchStatus) && typeof switchStatus.filament_detected === 'boolean'
      ? switchStatus.filament_detected
      : null,
    switchEnabled: isRecord(switchStatus) && switchStatus.enabled === true,
    motionEnabled: isRecord(motionStatus) && motionStatus.enabled === true,
    message,
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
    printOffsetY: toFiniteNumber(geometryMacro?.print_offset_y, 0),
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

const EDDY_CALIBRATION_STEPS = new Set<PrinterEddyCalibrationStep>([
  'not_started',
  'primary',
  'temperature',
  'z0',
  'screws',
  'mesh',
  'complete',
])

const EDDY_OPERATOR_PROMPTS = new Set<PrinterEddyOperatorPrompt>([
  'none',
  'drive_current',
  'cooling',
  'paper_test',
  'temperature_points',
  'verify_z0',
  'adjust_screws',
  'mesh_scan',
  'restart',
])

function normalizeStringEnum<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value as T) ? value as T : fallback
}

function readSavedFlag(variables: Record<string, unknown>, key: string): boolean {
  return parseMacroBoolean(variables[key]) === true
}

function normalizeEddyCalibration(status: MoonrakerPrinterObjectsStatus): PrinterEddyCalibrationSnapshot {
  const variables = status.save_variables?.variables ?? {}

  return {
    activeStep: normalizeStringEnum(variables.treed_eddy_active_step, EDDY_CALIBRATION_STEPS, 'not_started'),
    operatorPrompt: normalizeStringEnum(variables.treed_eddy_operator_prompt, EDDY_OPERATOR_PROMPTS, 'none'),
    driveCurrentDone: readSavedFlag(variables, 'treed_eddy_drive_current_done'),
    primaryDone: readSavedFlag(variables, 'treed_eddy_primary_done'),
    temperatureDone: readSavedFlag(variables, 'treed_eddy_temperature_done'),
    z0Done: readSavedFlag(variables, 'treed_eddy_z0_done'),
    screwsDone: readSavedFlag(variables, 'treed_eddy_screws_done'),
    meshDone: readSavedFlag(variables, 'treed_eddy_mesh_done'),
    requiredDone: readSavedFlag(variables, 'treed_eddy_required_done'),
  }
}

function normalizeV2Snapshot(
  macros: PrinterMacroStateSnapshot,
  webhooks: MoonrakerWebhooksStatus,
  homedAxes: string,
  status: MoonrakerPrinterObjectsStatus,
): PrinterV2Snapshot {
  const eddyAutosave = readMacro(macros.values, '_TREED_EDDY_Z_OFFSET_AUTOSAVE_STATE')

  return {
    branch: 'treed-v2',
    profile: 'treed_v2_corexy_v1',
    eddy: {
      status: normalizeEddyStatus(webhooks, homedAxes),
      autosaveEnabled: Boolean(eddyAutosave),
      autosavePending: Boolean(eddyAutosave?.has_pending),
      calibration: normalizeEddyCalibration(status),
    },
  }
}

function normalizeCalibration(status: MoonrakerPrinterObjectsStatus): PrinterCalibrationSnapshot | undefined {
  const configfile = isRecord(status.configfile) ? status.configfile : undefined
  const settings = isRecord(configfile?.settings) ? configfile.settings : {}
  const eddySettings = isRecord(settings['probe_eddy_current btt_eddy'])
    ? settings['probe_eddy_current btt_eddy']
    : {}
  const eddyStatus = isRecord(status['probe_eddy_current btt_eddy'])
    ? status['probe_eddy_current btt_eddy']
    : {}
  const temperatureStatus = isRecord(status['temperature_probe btt_eddy'])
    ? status['temperature_probe btt_eddy']
    : {}
  const temperatureState = isRecord(status['gcode_macro _TREED_EDDY_TEMPERATURE_STATE'])
    ? status['gcode_macro _TREED_EDDY_TEMPERATURE_STATE']
    : {}
  const manualProbe = isRecord(status.manual_probe) ? status.manual_probe : {}
  const mesh = isRecord(status.bed_mesh) ? status.bed_mesh : {}
  const savedProfilePayload = isRecord(mesh.profiles) ? mesh.profiles : {}
  const savedProfiles = Object.fromEntries(Object.entries(savedProfilePayload).flatMap(([name, profile]) => {
    if (!isRecord(profile) || !Array.isArray(profile.points)) return []
    const points = profile.points.map((row) => Array.isArray(row) ? row.map(readNullableNumber) : null)
    if (points.some((row) => row === null || row.some((value) => value === null))) return []
    return [[name, points as number[][]]]
  }))
  const screws = isRecord(status.screws_tilt_adjust) ? status.screws_tilt_adjust : {}
  const shaper = isRecord(status.input_shaper) ? status.input_shaper : {}
  const configuredShaper = isRecord(settings.input_shaper) ? settings.input_shaper : {}
  const extruderSettings = isRecord(settings.extruder) ? settings.extruder : {}
  const pendingItems = configfile?.save_config_pending_items
  const pendingSections = isRecord(pendingItems)
    ? Object.keys(pendingItems)
    : Array.isArray(pendingItems) ? pendingItems.filter((item): item is string => typeof item === 'string') : []
  const calibration = eddySettings.calibrate
  const heightCalibrationPoints = typeof calibration === 'string'
    ? calibration.split(',').filter((point) => point.includes(':')).length
    : Array.isArray(calibration) ? calibration.length : 0
  const savedVariables = isRecord(status.save_variables) ? status.save_variables : {}
  const variables = isRecord(savedVariables.variables) ? savedVariables.variables
    : isRecord(savedVariables.vars) ? savedVariables.vars : {}
  const treedCalibration = isRecord(status.treed_calibration) ? status.treed_calibration : {}
  const runtimeShaper = isRecord(treedCalibration.input_shaper) ? treedCalibration.input_shaper : {}
  const changedOffsets = parseMacroBoolean(treedCalibration.offsets_changed)
    ?? (parseMacroBoolean(variables.treed_eddy_offsets_changed) === true)
  const availableEddy = status['probe_eddy_current btt_eddy'] !== undefined
  const screwSettings = isRecord(settings.screws_tilt_adjust) ? settings.screws_tilt_adjust : {}
  const screwResults = isRecord(screws.results) ? screws.results : {}
  const results = Object.entries(screwResults).flatMap(([name, rawResult]) => {
    if (!isRecord(rawResult)) return []
    const configured = screwSettings[name]
    const coords = Array.isArray(configured)
      ? configured.map(readNullableNumber)
      : typeof configured === 'string' ? configured.split(',').map(readNullableNumber) : []
    return [{
      name: typeof rawResult.name === 'string' ? rawResult.name
        : typeof screwSettings[`${name}_name`] === 'string' ? String(screwSettings[`${name}_name`]) : name,
      xMm: coords[0] ?? null,
      yMm: coords[1] ?? null,
      zMm: readNullableNumber(rawResult.z),
      isBase: parseMacroBoolean(rawResult.is_base),
      sign: typeof rawResult.sign === 'string' ? rawResult.sign : null,
      adjust: typeof rawResult.adjust === 'string' ? rawResult.adjust : null,
    }]
  })
  const configuredScrewNames = Object.entries(screwSettings)
    .filter(([name, value]) => /^screw\d+$/.test(name) && (Array.isArray(value) || typeof value === 'string'))
    .map(([name]) => name)
  const hasCompleteScrewResults = configuredScrewNames.length > 0
    && configuredScrewNames.every((name) => isRecord(screwResults[name]))
  const baseZ = results.find((result) => result.isBase === true)?.zMm
  const maxScrewDeviation = !hasCompleteScrewResults || baseZ === undefined || baseZ === null || results.length === 0
    || results.some((result) => result.zMm === null)
    ? null
    : Math.max(...results.map((result) => Math.abs(result.zMm! - baseZ)))
  const hasCalibrationObjects = configfile !== undefined || availableEddy || status.treed_calibration !== undefined
    || status.manual_probe !== undefined || status.bed_mesh !== undefined
    || status.screws_tilt_adjust !== undefined || status.input_shaper !== undefined
    || status['temperature_probe btt_eddy'] !== undefined
    || status['gcode_macro _TREED_EDDY_TEMPERATURE_STATE'] !== undefined

  if (!hasCalibrationObjects) return undefined

  const readMatrix = (value: unknown): (number | null)[][] => Array.isArray(value)
    ? value.filter(Array.isArray).map((row) => row.map(readNullableNumber))
    : []
  const readBounds = (value: unknown): [number | null, number | null] | null => Array.isArray(value)
    ? [readNullableNumber(value[0]), readNullableNumber(value[1])]
    : null
  const boolField = (...values: unknown[]): boolean | null => {
    for (const value of values) {
      const parsed = parseMacroBoolean(value)
      if (parsed !== null) return parsed
    }
    return null
  }

  return {
    manualProbe: {
      active: parseMacroBoolean(manualProbe.is_active) === true,
      zMm: readNullableNumber(manualProbe.z_position),
      zMinimumMm: readNullableNumber(manualProbe.z_position_lower),
      zMaximumMm: readNullableNumber(manualProbe.z_position_upper),
    },
    eddy: {
      available: availableEddy,
      heightCalibrated: availableEddy ? heightCalibrationPoints > 2 && !changedOffsets : null,
      driveCurrent: readNullableNumber(eddyStatus.reg_drive_current ?? eddySettings.reg_drive_current),
      temperatureC: readNullableNumber(temperatureStatus.temperature ?? eddyStatus.temperature),
      temperaturePoints: readNullableNumber(temperatureState.points),
      temperatureSeriesActive: boolField(temperatureState.active),
      compensationEnabled: boolField(temperatureStatus.compensation_enabled),
      inTemperatureCalibration: boolField(temperatureStatus.in_calibration),
      estimatedExpansionMm: readNullableNumber(temperatureStatus.estimated_expansion ?? treedCalibration.estimated_expansion),
      xOffsetMm: readNullableNumber(eddyStatus.x_offset ?? eddySettings.x_offset),
      yOffsetMm: readNullableNumber(eddyStatus.y_offset ?? eddySettings.y_offset),
      zOffsetMm: readNullableNumber(eddyStatus.z_offset ?? eddySettings.z_offset),
    },
    config: {
      savePending: parseMacroBoolean(configfile?.save_config_pending) === true,
      pendingSections,
    },
    mesh: {
      profile: typeof mesh.profile_name === 'string' && mesh.profile_name.length > 0 ? mesh.profile_name : null,
      min: readBounds(mesh.mesh_min),
      max: readBounds(mesh.mesh_max),
      probedMatrix: readMatrix(mesh.probed_matrix),
      meshMatrix: readMatrix(mesh.mesh_matrix),
      savedProfiles,
    },
    screws: {
      error: boolField(screws.error),
      maxDeviationMm: maxScrewDeviation,
      results,
    },
    shaper: {
      typeX: typeof runtimeShaper.shaper_type_x === 'string'
        ? runtimeShaper.shaper_type_x
        : typeof shaper.shaper_type_x === 'string' ? shaper.shaper_type_x
          : typeof configuredShaper.shaper_type_x === 'string' ? configuredShaper.shaper_type_x : null,
      typeY: typeof runtimeShaper.shaper_type_y === 'string'
        ? runtimeShaper.shaper_type_y
        : typeof shaper.shaper_type_y === 'string' ? shaper.shaper_type_y
          : typeof configuredShaper.shaper_type_y === 'string' ? configuredShaper.shaper_type_y : null,
      freqXHz: readNullableNumber(runtimeShaper.shaper_freq_x)
        ?? readNullableNumber(shaper.shaper_freq_x) ?? readNullableNumber(configuredShaper.shaper_freq_x),
      freqYHz: readNullableNumber(runtimeShaper.shaper_freq_y)
        ?? readNullableNumber(shaper.shaper_freq_y) ?? readNullableNumber(configuredShaper.shaper_freq_y),
    },
    extruder: { rotationDistanceMm: readNullableNumber(treedCalibration.rotation_distance)
      ?? readNullableNumber(extruderSettings.rotation_distance) },
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

function createUnavailableUsageSnapshot(message = 'Moonraker history totals еще не загружены.'): PrinterUsageSnapshot {
  return {
    totalPrintTimeSec: null,
    totalJobTimeSec: null,
    totalJobs: null,
    totalFilamentUsedMm: null,
    longestPrintSec: null,
    updatedAt: null,
    state: 'unavailable',
    message,
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
  const printJob = normalizePrintStats(status.print_stats, status.virtual_sdcard, status.display_status, status.pause_resume)
  const excludeObjects = normalizeExcludeObjects(status.exclude_object, printJob)
  const macros = normalizeMacroValues(status, options.availableObjects)
  const uiContract = normalizeUiContract(macros)
  const filamentSensor = normalizeFilamentSensor(status, macros)
  const capabilities = normalizeCapabilities(macros, uiContract, filamentSensor, options.availableObjects, status.treed_calibration)
  const driverMode = normalizeDriverMode(status.treed_driver_mode)
  const driverFanMode = normalizeDriverMode(status.treed_driver_fan_mode)
  const driverContract = readMacro(macros.values, '_TREED_UI_CONTRACT')
  if (driverContract?.capability_driver_mode !== undefined) {
    capabilities.driverMode = uiContract.status === 'compatible' && driverMode.supported
      && parseMacroBoolean(driverContract.capability_driver_mode) === true
      && macros.available.includes('TREED_UI_SET_DRIVER_MODE')
  }
  if (driverContract?.capability_driver_fan_mode !== undefined) {
    capabilities.driverFanMode = uiContract.status === 'compatible' && driverFanMode.supported
      && parseMacroBoolean(driverContract.capability_driver_fan_mode) === true
      && macros.available.includes('TREED_UI_SET_DRIVER_FAN_MODE')
  }
  const homedAxes = typeof status.toolhead?.homed_axes === 'string' ? status.toolhead.homed_axes : ''
  const source = options.source ?? 'live'
  const revisionSource = options.revisionSource ?? (source === 'mock' ? 'mock' : 'http')
  const receivedAt = options.receivedAt ?? Date.now()
  const transportState = options.transportState ?? 'online'
  const klippy = normalizeKlippyState(status.webhooks)
  const isReady = transportState === 'online' && klippy.state === 'ready'
  const calibration = normalizeCalibration(status)

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
    wifiSsid: options.wifiSsid ?? 'Moonraker Network',
    ipAddress: normalizeIpAddress(options.moonrakerUrl),
    toolheadX: toolhead.x,
    toolheadY: toolhead.y,
    toolheadZ: toolhead.z,
    homedAxes,
    extruderTemp: normalizeHeater(status.extruder),
    bedTemp: normalizeHeater(status.heater_bed),
    modelFanPercent: normalizeFan(status.fan),
    driverMode,
    driverFanMode,
    mainLightEnabled: normalizeMainLight(status),
    lightPreferences: {
      onStartup: parseMacroBoolean(status.save_variables?.variables?.light_on_startup) === true,
      onPrintStart: parseMacroBoolean(status.save_variables?.variables?.light_on_print_start) !== false,
    },
    printerEvent: readPrinterEvent(status['gcode_macro _TREED_EVENT']),
    clogRecoveryActive: parseMacroBoolean(readMacro(macros.values, '_TREED_CLOG_RECOVERY_STATE')?.active) === true,
    operationPhase: readMacroString(readMacro(macros.values, '_TREED_OPERATION_STATE'), 'phase') ?? undefined,
    updatedAt: options.nowIso ?? new Date().toISOString(),
    message: firstNonEmpty(
      isReady && uiContract.status === 'incompatible' ? uiContract.message : null,
      printJob.message,
      displayStatus.message,
      webhooks.state_message,
    ),
    hardware: normalizeHardware(macros, uiContract),
    uiContract,
    capabilities,
    filamentSensor,
    limits: normalizeLimits(status.toolhead, macros, uiContract),
    usage: options.usage ?? createUnavailableUsageSnapshot(),
    printJob,
    excludeObjects,
    files: virtualSdCard.type === 'virtual_sdcard'
      ? virtualSdCard
      : {
          type: 'unknown',
          path: null,
          progress: 0,
          filePosition: 0,
          fileSize: null,
        },
    camera: normalizeCamera(macros, capabilities.camera),
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
    ...(calibration !== undefined ? { calibration } : {}),
    printFiles: normalizeMoonrakerPrintFiles(options.printFiles ?? [], { moonrakerUrl: options.moonrakerUrl }),
    v2: normalizeV2Snapshot(macros, webhooks, homedAxes, status),
  }
}

export {
  normalizeCapabilities,
  normalizeKlippyState,
  normalizeUiContract,
  normalizeDisplayStatus,
  normalizeExcludeObjects,
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
