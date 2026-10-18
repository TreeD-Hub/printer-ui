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
})
