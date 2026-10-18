import { describe, expect, it } from 'vitest'
import { getAutoPrinterStartBlockReason, parseAutoPrinterActionResult, parseAutoPrinterPairing, parseAutoPrinterStatus } from '../src/autoprinter'

const status = (overrides: Record<string, unknown> = {}) => ({ enabled: true, configured: true, binding_state: 'paired', binding_epoch: 1, protocol_version: 1, configuration_version: 1, execution_enabled: false, physical_execution_enabled: false, local_pause: false, remote_pause: false, blocked_reason: null, last_sync_at: null, queue: [], queue_total: 0, queue_truncated: false, ...overrides })
describe('AutoPrinter contract', () => {
  it('rejects malformed queue rows and bounds queue size', () => {
    expect(() => parseAutoPrinterStatus(status({ queue: [{ run_id: 'bad' }] }))).toThrow()
    expect(() => parseAutoPrinterStatus(status({ queue: Array(1001).fill({}) }))).toThrow()
    expect(() => parseAutoPrinterStatus(status({ queue: {} }))).toThrow()
    expect(() => parseAutoPrinterStatus(status({ queue: null }))).toThrow()
  })
  it('preserves legacy queue rows with missing optional metadata as null', () => {
    const parsed = parseAutoPrinterStatus(status({ queue: [{ run_id: '11111111-1111-4111-8111-111111111111', position: 1, state: 'queued', series_id: null, copies_per_run: null }], queue_total: 1, queue_truncated: false }))
    expect(parsed.queue).toHaveLength(1)
    expect(parsed.queue[0]).toMatchObject({ series_id: null, copies_per_run: null })
  })
  it('allows normal start only after fresh unmanaged or unsupported response', () => {
    expect(getAutoPrinterStartBlockReason({ status: parseAutoPrinterStatus(status({ enabled: false, configured: false, binding_state: 'unpaired' })), availability: 'available', stale: false, connected: true })).toBeNull()
    expect(getAutoPrinterStartBlockReason({ status: null, availability: 'unsupported', stale: false, connected: true })).toBeNull()
    expect(getAutoPrinterStartBlockReason({ status: null, availability: 'unsupported', stale: true, connected: true })).not.toBeNull()
    expect(getAutoPrinterStartBlockReason({ status: parseAutoPrinterStatus(status()), availability: 'available', stale: false, connected: true })).not.toBeNull()
  })
  it('accepts an early disabled status without presenting an empty queue or idle execution', () => {
    const legacy = parseAutoPrinterStatus({ enabled: false, configured: false, connection: 'online', protocol_version: 1, configuration_version: 1, last_sync_at: null, binding_state: 'unpaired', execution_enabled: false, physical_execution_enabled: false, queue_recovery_required: false, blocked_reason: null })
    expect(legacy.queueAvailable).toBe(false)
    expect(legacy.executionSnapshotAvailable).toBe(false)
    expect(legacy.ready).toBeUndefined()
  })
  it('requires explicit current-run fields when an execution snapshot is present', () => {
    const observedAt = '2030-01-01T00:00:00Z'
    expect(() => parseAutoPrinterStatus(status({ observed_at: observedAt }))).toThrow()

    const parsed = parseAutoPrinterStatus(status({ observed_at: observedAt, current_run_id: null, run_state: null }))
    expect(parsed.executionSnapshotAvailable).toBe(true)
    expect(parsed.current_run_id).toBeNull()
    expect(parsed.run_state).toBeNull()
  })
  it('validates action receipts and pairing expiry fields', () => {
    expect(parseAutoPrinterActionResult({ type: 'pause_queue', command_id: null, state: 'executed', result: {} }).state).toBe('executed')
    expect(() => parseAutoPrinterActionResult({ type: 'pause_queue', state: 'executed' })).toThrow()
    expect(parseAutoPrinterPairing({ code: 'abcdefghijkl', expires_at: '2030-01-01T00:00:00Z' }).code).toBe('abcdefghijkl')
  })
})
