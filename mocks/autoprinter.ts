import type { AutoPrinterClient } from '../src/core/autoprinter/client'
import type { AutoPrinterAction, AutoPrinterActionType, AutoPrinterStatus } from '@treed/printer-logic/autoprinter'

export type AutoPrinterMockScenario = 'disabled' | 'occupied' | 'unknown' | 'offline' | 'revoked'
const sampleId = '11111111-1111-4111-8111-111111111111'
export function createMockAutoPrinterClient(scenario: AutoPrinterMockScenario = 'disabled'): AutoPrinterClient {
  const queueAvailable = scenario !== 'disabled' && scenario !== 'revoked'
  let status: AutoPrinterStatus = {
    enabled: scenario !== 'disabled', configured: scenario !== 'disabled', binding_state: scenario === 'revoked' ? 'revoked' : scenario === 'disabled' ? 'unpaired' : 'paired', binding_epoch: 1,
    protocol_version: 1, configuration_version: 1, execution_enabled: scenario === 'occupied', physical_execution_enabled: false,
    queue: scenario === 'occupied' ? [{ run_id: sampleId, position: 1, state: 'printing', series_id: sampleId, copies_per_run: 1 }] : [], queueAvailable, queue_total: scenario === 'occupied' ? 1 : 0, queue_truncated: false,
    local_pause: false, remote_pause: false, current_run_id: scenario === 'occupied' ? sampleId : null, run_state: scenario === 'occupied' ? 'printing' : null,
    ready: scenario === 'occupied' ? true : undefined, blocked_reason: scenario === 'unknown' ? 'bed_proof_unavailable' : null, last_sync_at: null, executionSnapshotAvailable: scenario !== 'disabled' && scenario !== 'revoked',
    capabilities: scenario === 'disabled' || scenario === 'revoked' ? undefined : { queue: true, pairing: true, bed_check: false, bed_check_diagnostic: true },
    bed_check: scenario === 'unknown' ? { model_version: 'mock', live_qualified: false, last_check: { state: 'unknown', reason: 'bed_proof_unavailable', checked_at: new Date().toISOString() } } : undefined,
  }
  return {
    async getStatus() { if (scenario === 'offline') throw new Error('Mock AutoPrinter офлайн.'); return status },
    async pair() {
      if (scenario === 'offline') throw new Error('Mock AutoPrinter офлайн.')
      if (!status.enabled || !status.configured) throw new Error('Mock AutoPrinter не настроен.')
      return { code: 'MOCK-AUTOPRINTER-CODE', expires_at: new Date(Date.now() + 60_000).toISOString() }
    },
    async control(action: AutoPrinterAction) {
      if (scenario === 'offline') throw new Error('Mock AutoPrinter офлайн.')
      const command_id = 'action_id' in action ? action.action_id : null
      if (status.binding_state !== 'paired') return { type: action.type as AutoPrinterActionType, command_id, state: 'rejected', result: { code: 'not_paired' } }
      if (action.type === 'pause_queue') status = { ...status, local_pause: true, queue_control: 'paused' }
      else if (action.type === 'resume_queue') status = { ...status, local_pause: false, stop_after_current: false, queue_control: 'running' }
      else if (action.type === 'stop_after_current') status = { ...status, stop_after_current: true, queue_control: 'stop_after_current' }
      else if (action.type === 'pause_current_print' || action.type === 'cancel_current_print') return { type: action.type, command_id, state: 'rejected', result: { code: 'physical_execution_disabled' } }
      return { type: action.type, command_id, state: 'executed', result: {} }
    },
  }
}
