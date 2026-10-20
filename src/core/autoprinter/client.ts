import { moonrakerUrl } from '../../config'
import { parseAutoPrinterActionResult, parseAutoPrinterPairing, parseAutoPrinterStatus, parseAutoPrinterUnlinkResult } from '@treed/printer-logic/autoprinter'
import type { AutoPrinterAction, AutoPrinterActionResult, AutoPrinterPairing, AutoPrinterStatus, AutoPrinterUnlinkResult } from '@treed/printer-logic/autoprinter'

const base = '/server/treed/autoprinter'
export class AutoPrinterClientError extends Error {
  readonly kind: 'unsupported' | 'http' | 'network' | 'timeout' | 'invalid-result'

  constructor(kind: AutoPrinterClientError['kind'], message: string) {
    super(message)
    this.kind = kind
    this.name = 'AutoPrinterClientError'
  }
}
export interface AutoPrinterClient {
  getStatus(signal?: AbortSignal): Promise<AutoPrinterStatus>
  pair(): Promise<AutoPrinterPairing>
  cancelPairing(): Promise<void>
  unlinkAccount(): Promise<AutoPrinterUnlinkResult>
  control(action: AutoPrinterAction): Promise<AutoPrinterActionResult>
}

async function request(path: string, init: RequestInit, timeoutMs: number, externalSignal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  externalSignal?.addEventListener('abort', abort, { once: true })
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${moonrakerUrl}${base}${path}`, { ...init, signal: controller.signal, credentials: 'same-origin' })
    if (response.status === 404 || response.status === 405) throw new AutoPrinterClientError('unsupported', 'Эта функция недоступна в текущей версии системы принтера.')
    if (!response.ok) throw new AutoPrinterClientError('http', `Сервис принтера вернул ошибку HTTP ${response.status}.`)
    try { return await response.json() } catch { throw new AutoPrinterClientError('invalid-result', 'Сервис принтера вернул некорректный ответ.') }
  } catch (error) {
    if (error instanceof AutoPrinterClientError) throw error
    if (externalSignal?.aborted) throw new AutoPrinterClientError('network', 'Запрос к принтеру отменён.')
    if (controller.signal.aborted) throw new AutoPrinterClientError('timeout', 'Истекло время ожидания ответа принтера.')
    throw new AutoPrinterClientError('network', 'Не удалось связаться с принтером.')
  } finally {
    window.clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abort)
  }
}
function parse<T>(fn: (value: unknown) => T, value: unknown): T {
  try { return fn(value) } catch { throw new AutoPrinterClientError('invalid-result', 'Сервис принтера вернул некорректный ответ.') }
}
export function createMoonrakerAutoPrinterClient(): AutoPrinterClient {
  return {
    async getStatus(signal) { return parse(parseAutoPrinterStatus, await request('/status', { method: 'GET' }, 5_000, signal)) },
    async pair() { return parse(parseAutoPrinterPairing, await request('/pairing', { method: 'POST' }, 35_000)) },
    async cancelPairing() {
      const body = await request('/pairing/cancel', { method: 'POST' }, 35_000)
      if (typeof body !== 'object' || body === null || !('cancelled' in body) || body.cancelled !== true) {
        throw new AutoPrinterClientError('invalid-result', 'Core не подтвердил отмену привязки.')
      }
    },
    async unlinkAccount() {
      return parse(parseAutoPrinterUnlinkResult, await request('/account/unlink', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }, 35_000))
    },
    async control(action) {
      const body = await request('/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) }, 35_000)
      if (typeof body !== 'object' || body === null || Array.isArray(body) || !('action_result' in body)) throw new AutoPrinterClientError('invalid-result', 'Принтер не подтвердил действие.')
      return parse(parseAutoPrinterActionResult, body.action_result)
    },
  }
}
