import { describe, expect, it } from 'vitest'
import { parseAutoPrinterUnlinkResult } from '@treed/printer-logic/autoprinter'
import { createMockAutoPrinterClient } from '../mocks/autoprinter'

describe('AutoPrinter mock account unlink', () => {
  it('persists an idle unlink and keeps repeated requests idempotent', async () => {
    const client = createMockAutoPrinterClient('unknown')
    const before = await client.getStatus()
    const result = await client.unlinkAccount()

    expect(parseAutoPrinterUnlinkResult(result)).toMatchObject({ binding_state: 'unpaired', binding_epoch: before.binding_epoch + 1, unlink_pending: false })
    expect(await client.getStatus()).toEqual(result)
    expect(await client.unlinkAccount()).toEqual(result)
  })

  it('defers unlink without discarding the active run or its queue', async () => {
    const client = createMockAutoPrinterClient('occupied')
    const before = await client.getStatus()
    const result = await client.unlinkAccount()

    expect(parseAutoPrinterUnlinkResult(result)).toMatchObject({ binding_state: 'paired', binding_epoch: before.binding_epoch, unlink_pending: true })
    expect(result.current_run_id).toBe(before.current_run_id)
    expect(result.queue).toEqual(before.queue)
    expect(await client.getStatus()).toEqual(result)
  })
})
