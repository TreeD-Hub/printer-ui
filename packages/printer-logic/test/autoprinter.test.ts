import { describe, expect, it } from 'vitest'
import { getAutoPrinterStartBlockReason, parseAutoPrinterActionResult, parseAutoPrinterPairing, parseAutoPrinterStatus, parseAutoPrinterUnlinkResult } from '../src/autoprinter'

const status = (overrides: Record<string, unknown> = {}) => ({ enabled: true, configured: true, binding_state: 'paired', binding_epoch: 1, protocol_version: 1, configuration_version: 1, execution_enabled: false, physical_execution_enabled: false, local_pause: false, remote_pause: false, blocked_reason: null, last_sync_at: null, queue: [], queue_total: 0, queue_truncated: false, ...overrides })
describe('AutoPrinter contract', () => {
  it('accepts an explicit persistent deadline and restores the code only for an unpaired printer', () => {
    const pairing = { code: 'ABCD2345', expires_at: null, verification_url: 'https://treed.example/autoprinter/connect#code=ABCD2345' }
    expect(parseAutoPrinterPairing(pairing)).toEqual(pairing)
    expect(parseAutoPrinterStatus(status({ binding_state: 'unpaired', pairing })).pairing).toEqual(pairing)
    expect(parseAutoPrinterStatus(status({ pairing })).pairing).toBeNull()
    expect(() => parseAutoPrinterPairing({ ...pairing, expires_at: undefined })).toThrow()
  })

  it('preserves an HTTPS owner avatar, drops unsafe images and hides revoked profiles', () => {
    const profile = { display_name: 'Owner', avatar_url: 'https://treed.example/avatar.jpg' }
    expect(parseAutoPrinterStatus(status({ owner_profile: profile })).owner_profile).toEqual(profile)
    for (const avatar_url of [null, 42, 'javascript:alert(1)', 'http://treed.example/a.jpg', 'https://user:pass@treed.example/a.jpg', 'https://treed.example/\na.jpg']) {
      expect(parseAutoPrinterStatus(status({ owner_profile: { ...profile, avatar_url } })).owner_profile?.avatar_url).toBeNull()
    }
    expect(parseAutoPrinterStatus(status({ binding_state: 'revoked', owner_profile: profile })).owner_profile).toBeNull()
  })

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
    expect(getAutoPrinterStartBlockReason({ status: parseAutoPrinterStatus(status({ enabled: false, configured: false, binding_state: 'unpaired', display_name: null })), availability: 'available', stale: false, connected: true })).toBeNull()
    expect(getAutoPrinterStartBlockReason({ status: null, availability: 'unsupported', stale: false, connected: true })).toBeNull()
    expect(getAutoPrinterStartBlockReason({ status: null, availability: 'unsupported', stale: true, connected: true })).not.toBeNull()
    expect(getAutoPrinterStartBlockReason({ status: parseAutoPrinterStatus(status()), availability: 'available', stale: false, connected: true })).not.toBeNull()
  })
  it('accepts an early disabled status without presenting an empty queue or idle execution', () => {
    const legacy = parseAutoPrinterStatus({ enabled: false, configured: false, connection: 'online', display_name: null, protocol_version: 1, configuration_version: 1, last_sync_at: null, binding_state: 'unpaired', execution_enabled: false, physical_execution_enabled: false, queue_recovery_required: false, blocked_reason: null })
    expect(legacy.queueAvailable).toBe(false)
    expect(legacy.executionSnapshotAvailable).toBe(false)
    expect(legacy.ready).toBeUndefined()
    expect(legacy.display_name).toBeUndefined()
    expect(legacy).toMatchObject({ active_package: null, hold: null, recovery_required: false })
  })
  it('validates offline package status while keeping older payloads compatible', () => {
    const packageStatus = parseAutoPrinterStatus(status({
      active_package: { package_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: 2, manifest_hash: 'a'.repeat(64), state: 'active', run_count: 3, remaining_count: 4 },
      hold: { reason: 'ai_detection', created_at: '2030-01-01T00:00:00Z', context: { frame_id: 'frame.jpg' } },
      recovery_required: true,
      capabilities: { offline_packages_v1: true },
    }))
    expect(packageStatus).toMatchObject({
      active_package: { version: 2, run_count: 3, remaining_count: 4 },
      hold: { reason: 'ai_detection' }, recovery_required: true,
      capabilities: { offline_packages_v1: true },
    })
    for (const active_package of [
      { package_id: 'bad', version: 1, manifest_hash: 'a'.repeat(64), state: 'active', run_count: 0, remaining_count: 1 },
      { package_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: 1, manifest_hash: 'bad', state: 'active', run_count: 0, remaining_count: 1 },
      { package_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version: 1, manifest_hash: 'a'.repeat(64), state: 'active', run_count: -1, remaining_count: 1 },
    ]) expect(() => parseAutoPrinterStatus(status({ active_package }))).toThrow()
    expect(() => parseAutoPrinterStatus(status({ hold: { reason: 'ai_detection', created_at: 'bad', context: {} } }))).toThrow()
    expect(() => parseAutoPrinterStatus(status({ recovery_required: 'true' }))).toThrow()
    expect(() => parseAutoPrinterStatus(status({ capabilities: { offline_packages_v1: 1 } }))).toThrow()
  })
  it('normalizes a null printer name for disabled and fresh unpaired status', () => {
    const disabled = parseAutoPrinterStatus(status({ enabled: false, configured: false, binding_state: 'unpaired', display_name: null }))
    expect(disabled.display_name).toBeUndefined()
    expect(getAutoPrinterStartBlockReason({ status: disabled, availability: 'available', stale: false, connected: true })).toBeNull()

    const freshStore = parseAutoPrinterStatus(status({ enabled: true, configured: true, binding_state: 'unpaired', binding_epoch: 0, display_name: null }))
    expect(freshStore.display_name).toBeUndefined()
    expect(freshStore.binding_state).toBe('unpaired')
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
    expect(parseAutoPrinterActionResult({
      type: 'cancel_package', command_id: null, state: 'executed',
      result: { scope: 'remaining_queued_runs', cancelled_run_ids: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] },
    }).type).toBe('cancel_package')
    expect(() => parseAutoPrinterActionResult({ type: 'cancel_package', command_id: null, state: 'executed', result: {} })).toThrow()
    expect(() => parseAutoPrinterActionResult({ type: 'pause_queue', state: 'executed' })).toThrow()
    expect(parseAutoPrinterPairing({ code: 'A1B2C3D4E5F6G7H8I9J0', expires_at: '2030-01-01T00:00:00Z' }).code).toBe('A1B2C3D4E5F6G7H8I9J0')
    expect(() => parseAutoPrinterPairing({ code: 'abcdefghijkl', expires_at: '2030-01-01T00:00:00Z' })).toThrow()
    expect(parseAutoPrinterPairing({ code: 'ABCD2345', expires_at: '2030-01-01T00:00:00Z', verification_url: 'https://treed.example/autoprinter/connect#code=ABCD2345' }).verification_url).toContain('#code=ABCD2345')
    expect(() => parseAutoPrinterPairing({ code: 'ABCD2345', expires_at: '2030-01-01T00:00:00Z' })).toThrow()
    expect(() => parseAutoPrinterPairing({ code: 'ABCD2345', expires_at: '2030-01-01T00:00:00Z', verification_url: 'http://evil.example/autoprinter/connect#code=ABCD2345' })).toThrow()
    expect(() => parseAutoPrinterPairing({ code: 'ABCD2345', expires_at: '2000-01-01T00:00:00Z' })).toThrow()
  })
  it('parses optional account status without breaking older cores and blocks starts during unlink', () => {
    const legacy = parseAutoPrinterStatus(status())
    expect(legacy.owner_profile).toBeUndefined()
    expect(legacy.capabilities?.account_linking).toBeUndefined()
    const pending = parseAutoPrinterStatus(status({ display_name: 'Printer', owner_profile: { display_name: 'Account' }, unlink_pending: true, capabilities: { account_linking: true } }))
    expect(pending).toMatchObject({ display_name: 'Printer', owner_profile: { display_name: 'Account' }, unlink_pending: true, capabilities: { account_linking: true } })
    expect(getAutoPrinterStartBlockReason({ status: pending, availability: 'available', stale: false, connected: true })).toMatch(/отвязк/i)
    expect(getAutoPrinterStartBlockReason({ status: pending, availability: 'unsupported', stale: false, connected: true })).toMatch(/отвязк/i)
    expect(() => parseAutoPrinterStatus(status({ owner_profile: { display_name: 12 } }))).toThrow()
  })
  it('accepts only a full pending or finalized unlink status', () => {
    expect(parseAutoPrinterUnlinkResult(status({ unlink_pending: true }))).toMatchObject({ binding_state: 'paired', unlink_pending: true })
    expect(parseAutoPrinterUnlinkResult(status({ binding_state: 'unpaired', binding_epoch: 2, queue_total: 0, queue: [], queue_truncated: false }))).toMatchObject({ binding_state: 'unpaired' })
    expect(() => parseAutoPrinterUnlinkResult(status())).toThrow()
    expect(() => parseAutoPrinterUnlinkResult({ status: 'pending' })).toThrow()
  })
})
