import { afterEach, describe, expect, it } from 'vitest'
import { parseAutoPrinterPairing, parseAutoPrinterUnlinkResult } from '@treed/printer-logic/autoprinter'
import { createMockAutoPrinterClient } from '../mocks/autoprinter'
import { createAutoPrinterClient } from '../mocks/runtime'

describe('AutoPrinter mock account scenarios', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it.each([
    ['unpaired', 'unpaired', false],
    ['paired', 'paired', false],
    ['unlink-pending', 'paired', true],
    ['revoked', 'revoked', false],
  ])('selects %s from the browser URL', async (scenario, bindingState, unlinkPending) => {
    window.history.replaceState(null, '', `/?mockAccount=${scenario}`)
    const status = await createAutoPrinterClient().getStatus()

    expect(status).toMatchObject({ binding_state: bindingState, unlink_pending: unlinkPending, capabilities: { account_linking: true } })
    if (unlinkPending) expect(status.current_run_id).not.toBeNull()
    if (bindingState === 'revoked') expect(status.owner_profile).toBeNull()
  })

  it('keeps a persistent code until explicit cancellation without confirming pairing', async () => {
    const client = createMockAutoPrinterClient('unpaired')
    const pairing = parseAutoPrinterPairing(await client.pair())
    expect(pairing).toMatchObject({ code: 'ABCD2345', expires_at: null, verification_url: 'https://treed.example/autoprinter/connect#code=ABCD2345' })
    expect(await client.pair()).toEqual(pairing)
    expect(await client.getStatus()).toMatchObject({ binding_state: 'unpaired', pairing })
    await client.cancelPairing()
    expect((await client.getStatus()).pairing).toBeNull()
  })

  it('keeps the service error available as a separate scenario', async () => {
    window.history.replaceState(null, '', '/?mockAccount=offline')
    await expect(createAutoPrinterClient().getStatus()).rejects.toThrow('Mock AutoPrinter офлайн.')
  })

  it.each(['', '?mockAccount=invalid'])('preserves the disabled default for %s', async (query) => {
    window.history.replaceState(null, '', `/${query}`)
    expect(await createAutoPrinterClient().getStatus()).toMatchObject({ enabled: false, configured: false })
  })
})

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
