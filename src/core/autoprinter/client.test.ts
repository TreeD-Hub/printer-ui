import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMoonrakerAutoPrinterClient } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
})

function respond(status: number, body: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

describe('Moonraker AutoPrinter client HTTP boundary', () => {
  it.each([404, 405])('classifies HTTP %i as unsupported', async (status) => {
    respond(status, { error: 'not found' })
    const client = createMoonrakerAutoPrinterClient()

    await expect(client.getStatus()).rejects.toMatchObject({ kind: 'unsupported' })
  })

  it('does not treat a successful status-only control body as an executed action', async () => {
    respond(200, { status: 'confirmed' })
    const client = createMoonrakerAutoPrinterClient()

    await expect(client.control({ type: 'pause_queue' }))
      .rejects.toMatchObject({ kind: 'invalid-result' })
  })

  it('parses action_result from the unwrapped core control response', async () => {
    respond(200, {
      status: 'ready',
      action_result: { type: 'pause_queue', command_id: null, state: 'executed', result: {} },
    })
    const client = createMoonrakerAutoPrinterClient()

    await expect(client.control({ type: 'pause_queue' })).resolves.toEqual({
      type: 'pause_queue',
      command_id: null,
      state: 'executed',
      result: {},
    })
  })

  it('posts the local unlink intent and requires a pending or finalized full status', async () => {
    const status = {
      enabled: true, configured: true, binding_state: 'paired', binding_epoch: 1,
      protocol_version: 1, configuration_version: 1, execution_enabled: true,
      physical_execution_enabled: false, local_pause: false, remote_pause: false,
      blocked_reason: null, last_sync_at: null, queue: [], queue_total: 0,
      queue_truncated: false, unlink_pending: true,
    }
    respond(200, status)
    const client = createMoonrakerAutoPrinterClient()

    await expect(client.unlinkAccount()).resolves.toMatchObject({ binding_state: 'paired', unlink_pending: true })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/server/treed/autoprinter/account/unlink'), expect.objectContaining({
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    }))

    respond(200, { ...status, unlink_pending: false })
    await expect(client.unlinkAccount()).rejects.toMatchObject({ kind: 'invalid-result' })
  })
})
