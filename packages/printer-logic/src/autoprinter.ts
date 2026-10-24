export type AutoPrinterRunState = 'queued' | 'preparing' | 'printing' | 'cooling' | 'removing' | 'verifying' | 'completed' | 'failed' | 'cancelled' | 'uncertain'
export type AutoPrinterActionType = 'pause_queue' | 'resume_queue' | 'stop_after_current' | 'pause_current_print' | 'cancel_current_print' | 'cancel_package' | 'recheck_bed'
export type AutoPrinterAction = { type: Exclude<AutoPrinterActionType, 'pause_current_print' | 'cancel_current_print' | 'cancel_package'> } | { type: 'pause_current_print' | 'cancel_current_print'; run_id: string; action_id: string } | { type: 'cancel_package'; package_id: string; action_id: string }
export interface AutoPrinterQueueRun { run_id: string; position: number; state: AutoPrinterRunState; series_id: string | null; copies_per_run: number | null }
export interface AutoPrinterActivePackage { package_id: string; version: number; manifest_hash: string; state: string; run_count: number; remaining_count: number }
export interface AutoPrinterHold { reason: string; created_at: string; context: Record<string, unknown> }
export interface AutoPrinterStatus {
  enabled: boolean; configured: boolean; binding_state: 'unpaired' | 'paired' | 'revoked'; binding_epoch: number
  protocol_version: 1; configuration_version: 1; execution_enabled: boolean; physical_execution_enabled: boolean
  queue: AutoPrinterQueueRun[]; queueAvailable: boolean; queue_total: number; queue_truncated: boolean
  local_pause: boolean | null; remote_pause: boolean | null; queue_control?: 'blocked' | 'stop_after_current' | 'paused' | 'running'
  executionSnapshotAvailable: boolean
  current_run_id: string | null; run_state: AutoPrinterRunState | null; stop_after_current?: boolean
  ready?: boolean; blocked_reason: string | null; connection?: string; last_sync_at: string | null
  display_name?: string; owner_profile?: { display_name: string; avatar_url?: string | null } | null; unlink_pending?: boolean
  pairing?: AutoPrinterPairing | null
  active_package: AutoPrinterActivePackage | null; hold: AutoPrinterHold | null; recovery_required: boolean
  capabilities?: { queue?: boolean; pairing?: boolean; pairing_cancel?: boolean; account_linking?: boolean; bed_check?: boolean; bed_check_diagnostic?: boolean; offline_packages_v1?: boolean }
  bed_check?: { model_version?: string; live_qualified?: boolean; last_check?: { state: string; reason: string | null; checked_at: string | null } }
}
export type AutoPrinterPendingType = AutoPrinterActionType | 'pairing' | 'pairing_cancel' | 'account_unlink'
export interface AutoPrinterActionResult { type: AutoPrinterActionType; command_id: string | null; state: 'executed' | 'rejected' | 'uncertain'; result: { code?: string; scope?: 'remaining_queued_runs'; cancelled_run_ids?: string[] } }
export interface AutoPrinterPairing { code: string; expires_at: string | null; verification_url?: string }
export type AutoPrinterUnlinkResult = AutoPrinterStatus

export class AutoPrinterSchemaError extends Error {
  constructor() { super('Получен некорректный ответ AutoPrinter.'); this.name = 'AutoPrinterSchemaError' }
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const states: readonly AutoPrinterRunState[] = ['queued','preparing','printing','cooling','removing','verifying','completed','failed','cancelled','uncertain']
const actions: readonly AutoPrinterActionType[] = ['pause_queue','resume_queue','stop_after_current','pause_current_print','cancel_current_print','cancel_package','recheck_bed']
function fail(): never { throw new AutoPrinterSchemaError() }
function optionalBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
  const value = source[key]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') fail()
  return value
}
function safeCode(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 100 && /^[a-zA-Z0-9_.-]+$/.test(value)
}

export function parseAutoPrinterStatus(value: unknown): AutoPrinterStatus {
  if (!record(value)) fail()
  if (typeof value.enabled !== 'boolean' || typeof value.configured !== 'boolean') fail()
  if (!['unpaired', 'paired', 'revoked'].includes(String(value.binding_state))) fail()

  const bindingEpoch = value.binding_epoch
  if (bindingEpoch !== undefined && (!Number.isSafeInteger(bindingEpoch) || (bindingEpoch as number) < 0)) fail()
  if (value.protocol_version !== 1 || value.configuration_version !== 1) fail()
  if (typeof value.execution_enabled !== 'boolean' || typeof value.physical_execution_enabled !== 'boolean') fail()

  const paired = value.binding_state === 'paired'
  const mayOmitPause = value.binding_state === 'unpaired'
  for (const key of ['local_pause', 'remote_pause'] as const) {
    const pause = value[key]
    if (typeof pause !== 'boolean' && !(mayOmitPause && pause === undefined)) fail()
  }
  if (value.blocked_reason !== null && value.blocked_reason !== undefined && !safeCode(value.blocked_reason)) fail()
  if (value.last_sync_at !== null && value.last_sync_at !== undefined && !date(value.last_sync_at)) fail()

  const queueAvailable = Array.isArray(value.queue)
  if (value.queue !== undefined && !queueAvailable) fail()
  const queueInput = queueAvailable ? value.queue as unknown[] : []
  if (queueAvailable) {
    if (queueInput.length > 1000) fail()
    if (!Number.isSafeInteger(value.queue_total) || (value.queue_total as number) < 0) fail()
    if (typeof value.queue_truncated !== 'boolean') fail()
    if (paired && ((value.queue_total as number) < queueInput.length
      || value.queue_truncated !== ((value.queue_total as number) > queueInput.length))) fail()
  }

  const queue = queueInput.map((row): AutoPrinterQueueRun => {
    if (!record(row)) fail()
    if (!uuid(row.run_id)) fail()
    if (!Number.isSafeInteger(row.position) || (row.position as number) < 1) fail()
    if (!states.includes(row.state as AutoPrinterRunState)) fail()
    if (row.series_id !== null && !uuid(row.series_id)) fail()
    if (row.copies_per_run !== null
      && (!Number.isSafeInteger(row.copies_per_run) || (row.copies_per_run as number) < 1)) fail()

    return {
      run_id: row.run_id,
      position: row.position as number,
      state: row.state as AutoPrinterRunState,
      series_id: row.series_id as string | null,
      copies_per_run: row.copies_per_run as number | null,
    }
  })
  if (queue.some((row, index) => index > 0 && queue[index - 1]!.position >= row.position)) fail()
  if (!paired && queue.length > 0) fail()

  if (value.current_run_id !== undefined && value.current_run_id !== null && !uuid(value.current_run_id)) fail()
  if (value.run_state !== undefined && value.run_state !== null && !states.includes(value.run_state as AutoPrinterRunState)) fail()
  if (value.observed_at !== undefined
    && (!('current_run_id' in value) || !('run_state' in value))) fail()
  if (value.current_run_id !== undefined && (value.current_run_id === null) !== (value.run_state === null)) fail()
  if (value.capabilities !== undefined && !record(value.capabilities)) fail()
  if (value.ready !== undefined && typeof value.ready !== 'boolean') fail()
  if (value.connection !== undefined && typeof value.connection !== 'string') fail()
  if (value.display_name !== undefined && value.display_name !== null && typeof value.display_name !== 'string') fail()
  if (value.owner_profile !== undefined && value.owner_profile !== null
    && (!record(value.owner_profile) || typeof value.owner_profile.display_name !== 'string')) fail()
  if (value.unlink_pending !== undefined && typeof value.unlink_pending !== 'boolean') fail()
  if (paired && (bindingEpoch === undefined || (bindingEpoch as number) < 1)) fail()
  if (!paired && queueAvailable
    && ((value.queue_total as number) !== 0 || queue.length > 0 || value.queue_truncated !== false)) fail()
  if (value.queue_control !== undefined
    && !['blocked', 'stop_after_current', 'paused', 'running'].includes(String(value.queue_control))) fail()
  if (value.stop_after_current !== undefined && typeof value.stop_after_current !== 'boolean') fail()
  if (value.observed_at !== undefined && !date(value.observed_at)) fail()
  let activePackage: AutoPrinterActivePackage | null = null
  if (value.active_package !== undefined && value.active_package !== null) {
    if (!record(value.active_package) || !uuid(value.active_package.package_id)
      || !Number.isSafeInteger(value.active_package.version) || (value.active_package.version as number) < 1
      || typeof value.active_package.manifest_hash !== 'string' || !/^[0-9a-f]{64}$/i.test(value.active_package.manifest_hash)
      || typeof value.active_package.state !== 'string' || value.active_package.state.length === 0 || value.active_package.state.length > 64
      || !Number.isSafeInteger(value.active_package.run_count) || (value.active_package.run_count as number) < 0
      || !Number.isSafeInteger(value.active_package.remaining_count) || (value.active_package.remaining_count as number) < 0) fail()
    activePackage = {
      package_id: value.active_package.package_id as string,
      version: value.active_package.version as number,
      manifest_hash: value.active_package.manifest_hash as string,
      state: value.active_package.state as string,
      run_count: value.active_package.run_count as number,
      remaining_count: value.active_package.remaining_count as number,
    }
  } else if (value.active_package === null) activePackage = null
  let hold: AutoPrinterHold | null = null
  if (value.hold !== undefined && value.hold !== null) {
    if (!record(value.hold) || typeof value.hold.reason !== 'string' || value.hold.reason.length === 0 || value.hold.reason.length > 128
      || !date(value.hold.created_at) || !record(value.hold.context)) fail()
    hold = { reason: value.hold.reason, created_at: value.hold.created_at, context: value.hold.context }
  } else if (value.hold === null) hold = null
  if (value.recovery_required !== undefined && typeof value.recovery_required !== 'boolean') fail()
  const capabilityInput = record(value.capabilities) ? value.capabilities : null
  const capabilities = capabilityInput ? {
    queue: optionalBoolean(capabilityInput, 'queue'),
    pairing: optionalBoolean(capabilityInput, 'pairing'),
    bed_check: optionalBoolean(capabilityInput, 'bed_check'),
    bed_check_diagnostic: optionalBoolean(capabilityInput, 'bed_check_diagnostic'),
    offline_packages_v1: optionalBoolean(capabilityInput, 'offline_packages_v1'),
  } : undefined
  let bedCheck: AutoPrinterStatus['bed_check']
  if (value.bed_check !== undefined) {
    if (!record(value.bed_check)) fail()
    const bed = value.bed_check
    if (bed.model_version !== undefined && typeof bed.model_version !== 'string') fail()
    if (bed.live_qualified !== undefined && typeof bed.live_qualified !== 'boolean') fail()
    if (bed.allowed_model_versions !== undefined && (!Array.isArray(bed.allowed_model_versions) || bed.allowed_model_versions.some((model) => typeof model !== 'string'))) fail()
    if (bed.last_check !== undefined) {
      if (!record(bed.last_check) || !['unavailable', 'unknown', 'occupied'].includes(String(bed.last_check.state))) fail()
      if (bed.last_check.reason !== null && !safeCode(bed.last_check.reason)) fail()
      if (bed.last_check.checked_at !== null && !date(bed.last_check.checked_at)) fail()
      bedCheck = {
        ...(typeof bed.model_version === 'string' ? { model_version: bed.model_version } : {}),
        ...(typeof bed.live_qualified === 'boolean' ? { live_qualified: bed.live_qualified } : {}),
        last_check: { state: bed.last_check.state as string, reason: bed.last_check.reason as string | null, checked_at: bed.last_check.checked_at as string | null },
      }
    } else {
      bedCheck = {
        ...(typeof bed.model_version === 'string' ? { model_version: bed.model_version } : {}),
        ...(typeof bed.live_qualified === 'boolean' ? { live_qualified: bed.live_qualified } : {}),
      }
    }
  }
  return {
    enabled: value.enabled, configured: value.configured, binding_state: value.binding_state as AutoPrinterStatus['binding_state'], binding_epoch: (value.binding_epoch as number | undefined) ?? 0,
    protocol_version: 1, configuration_version: 1, execution_enabled: value.execution_enabled, physical_execution_enabled: value.physical_execution_enabled,
    queue, queueAvailable, queue_total: queueAvailable ? value.queue_total as number : 0, queue_truncated: queueAvailable ? value.queue_truncated as boolean : false,
    local_pause: typeof value.local_pause === 'boolean' ? value.local_pause : null, remote_pause: typeof value.remote_pause === 'boolean' ? value.remote_pause : null, queue_control: value.queue_control as AutoPrinterStatus['queue_control'],
    executionSnapshotAvailable: value.observed_at !== undefined,
    current_run_id: (value.current_run_id as string | null | undefined) ?? null, run_state: (value.run_state as AutoPrinterRunState | null | undefined) ?? null,
    stop_after_current: value.stop_after_current as boolean | undefined, ready: value.ready as boolean | undefined,
    blocked_reason: (value.blocked_reason as string | null | undefined) ?? null, connection: value.connection as string | undefined, last_sync_at: (value.last_sync_at as string | null | undefined) ?? null,
    capabilities: capabilityInput ? { ...capabilities, account_linking: optionalBoolean(capabilityInput, 'account_linking'), pairing_cancel: optionalBoolean(capabilityInput, 'pairing_cancel') } : undefined,
    pairing: value.binding_state !== 'unpaired' || value.pairing === null ? null
      : value.pairing === undefined ? undefined : parseAutoPrinterPairing(value.pairing),
    display_name: typeof value.display_name === 'string' ? value.display_name : undefined,
    owner_profile: !paired || value.owner_profile === null ? null : record(value.owner_profile) ? {
      display_name: value.owner_profile.display_name as string,
      ...(value.owner_profile.avatar_url !== undefined ? { avatar_url: accountAvatarUrl(value.owner_profile.avatar_url) } : {}),
    } : undefined,
    unlink_pending: value.unlink_pending as boolean | undefined,
    bed_check: bedCheck,
    active_package: activePackage,
    hold,
    recovery_required: value.recovery_required === true,
  }
}

export function parseAutoPrinterActionResult(value: unknown): AutoPrinterActionResult {
  if (!record(value)) fail()
  if (!actions.includes(value.type as AutoPrinterActionType)) fail()
  if (value.command_id !== null && !uuid(value.command_id)) fail()
  if (!['executed', 'rejected', 'uncertain'].includes(String(value.state))) fail()
  if (!record(value.result)) fail()
  const allowedResultKeys = value.type === 'cancel_package' ? ['code', 'scope', 'cancelled_run_ids'] : ['code']
  if (Object.keys(value.result).some((key) => !allowedResultKeys.includes(key))) fail()
  if (value.result.code !== undefined && !safeCode(value.result.code)) fail()
  if (value.type === 'cancel_package') {
    if (value.result.scope !== undefined && value.result.scope !== 'remaining_queued_runs') fail()
    if (value.result.cancelled_run_ids !== undefined
      && (!Array.isArray(value.result.cancelled_run_ids) || value.result.cancelled_run_ids.some((id) => !uuid(id)))) fail()
    if (value.state === 'executed' && (value.result.scope !== 'remaining_queued_runs' || !Array.isArray(value.result.cancelled_run_ids))) fail()
  }
  return {
    type: value.type as AutoPrinterActionType,
    command_id: value.command_id as string | null,
    state: value.state as AutoPrinterActionResult['state'],
    result: value.result as AutoPrinterActionResult['result'],
  }
}
export function parseAutoPrinterPairing(value: unknown): AutoPrinterPairing {
  if (!record(value) || typeof value.code !== 'string') fail()
  const newCode = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(value.code)
  const legacyCode = /^[A-Z0-9]{20}$/.test(value.code)
  if (!newCode && !legacyCode) fail()
  const expiresAt = value.expires_at
  if (expiresAt !== null && (!date(expiresAt) || Date.parse(expiresAt) <= Date.now())) fail()
  if (newCode && value.verification_url === undefined) fail()
  if (value.verification_url !== undefined) {
    if (typeof value.verification_url !== 'string') fail()
    try {
      const url = new URL(value.verification_url)
      const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (url.protocol !== 'https:' && !isLocalHttp) fail()
      if (url.username || url.password || url.pathname !== '/autoprinter/connect' || url.search !== '' || url.hash !== `#code=${value.code}`) fail()
    } catch { fail() }
  }
  return { code: value.code, expires_at: expiresAt, ...(typeof value.verification_url === 'string' ? { verification_url: value.verification_url } : {}) }
}

function accountAvatarUrl(value: unknown): string | null {
  // eslint-disable-next-line no-control-regex -- Управляющие символы в URL намеренно запрещены до нормализации URL-парсером.
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f]/.test(value)) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? value : null
  } catch {
    return null
  }
}

export function parseAutoPrinterUnlinkResult(value: unknown): AutoPrinterUnlinkResult {
  const status = parseAutoPrinterStatus(value)
  if (status.binding_state !== 'unpaired' && status.unlink_pending !== true) fail()
  return status
}

export type AutoPrinterStartContext = { status: AutoPrinterStatus | null; availability: 'loading' | 'available' | 'unsupported' | 'error'; stale: boolean; connected: boolean }
export function getAutoPrinterStartBlockReason(context: AutoPrinterStartContext): string | null {
  if (!context.connected) return 'Нет связи с Moonraker'
  if (context.status?.unlink_pending === true) return 'Отвязка ожидает завершения текущей работы и связи с TreeD'
  if (context.availability === 'error' || context.stale) return 'Состояние AutoPrinter устарело или недоступно'
  if (context.availability === 'unsupported') return null
  if (context.availability === 'loading' || !context.status) return 'Проверяется состояние AutoPrinter'
  const s = context.status
  if (s.current_run_id) return 'Выполняется серийная печать AutoPrinter'
  if (s.hold || s.recovery_required) return 'Серийная печать AutoPrinter требует проверки'
  return null
}
export const describeAutoPrinterState = (state: AutoPrinterRunState): string => ({ queued:'В очереди', preparing:'Подготовка', printing:'Печать', cooling:'Охлаждение', removing:'Снятие модели', verifying:'Проверка', completed:'Завершено', failed:'Ошибка', cancelled:'Отменено', uncertain:'Результат неизвестен' })[state]
export const describeAutoPrinterReason = (reason: string | null): string => ({
  bed_proof_unavailable: 'Проверка стола недоступна',
  bed_occupied: 'На столе обнаружен объект',
  bed_unknown: 'Не удалось определить состояние стола',
  model_not_qualified: 'Результат модели не прошёл квалификацию для подтверждения пустого стола',
  not_checked: 'Стол ещё не проверяли',
  camera_unavailable: 'Камера недоступна',
  camera_error: 'Не удалось получить кадр с камеры',
  configuration_invalid: 'Настройки AutoPrinter некорректны',
  side_effect_uncertain: 'Физическое действие не получило подтверждения',
  local_action_outcome_uncertain: 'Результат локального действия неизвестен',
  queue_recovery_required: 'Требуется восстановление очереди',
  protocol_recovery_required: 'Требуется восстановление протокола',
  control_conflict: 'Состояние очереди изменилось; обновите состояние',
  revision_conflict: 'Состояние очереди изменилось; обновите состояние',
  device_unavailable: 'Устройство недоступно',
} as Record<string, string>)[reason ?? ''] ?? 'Действие недоступно'
export const describeAutoPrinterAction = (action: AutoPrinterActionType): string => ({ pause_queue:'Приостановить очередь', resume_queue:'Продолжить очередь', stop_after_current:'Остановить после текущей печати', pause_current_print:'Приостановить текущую печать', cancel_current_print:'Отменить текущую печать', cancel_package:'Отменить оставшиеся задания', recheck_bed:'Повторно проверить стол' })[action]
