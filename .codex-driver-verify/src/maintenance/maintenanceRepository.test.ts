import { describe, expect, it, vi } from 'vitest'
import {
  createMoonrakerMaintenanceRepository,
  normalizeMaintenanceLedger,
} from './maintenanceRepository'

function moonrakerResponse<T>(result: T, status = 200): Response {
  return new Response(JSON.stringify({ result }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('maintenanceRepository', () => {
  it('returns an empty ledger when the client namespace has not been created', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(moonrakerResponse({ namespaces: ['moonraker'] })))
    const repository = createMoonrakerMaintenanceRepository({
      baseUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
    })

    await expect(repository.load()).resolves.toEqual({
      schemaVersion: 1,
      records: [],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('records maintenance at the current runtime without losing previous history', async () => {
    const previousLedger = {
      schemaVersion: 1 as const,
      records: [{
        id: 'maintenance-1',
        completedAt: '2026-01-01T00:00:00.000Z',
        runtimeSec: 1_000_000,
      }],
    }
    let postedValue: unknown
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/server/database/list')) {
        return Promise.resolve(moonrakerResponse({ namespaces: ['printer_ui'] }))
      }
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { value: unknown }
        postedValue = body.value
        return Promise.resolve(moonrakerResponse({
          namespace: 'printer_ui',
          key: 'maintenance',
          value: body.value,
        }))
      }
      return Promise.resolve(moonrakerResponse({
        namespace: 'printer_ui',
        key: 'maintenance',
        value: previousLedger,
      }))
    })
    const repository = createMoonrakerMaintenanceRepository({
      baseUrl: 'http://moonraker.local',
      fetchImpl: fetchMock as typeof fetch,
      now: () => new Date('2026-07-03T12:00:00.000Z'),
    })

    const ledger = await repository.complete(2_000_000)

    expect(ledger.records).toHaveLength(2)
    expect(ledger.records[0]).toMatchObject({
      completedAt: '2026-07-03T12:00:00.000Z',
      runtimeSec: 2_000_000,
    })
    expect(ledger.records[1]).toEqual(previousLedger.records[0])
    expect(postedValue).toEqual(ledger)
  })

  it('uses completion time to select the latest cycle after Moonraker history is reset', () => {
    const ledger = normalizeMaintenanceLedger({
      schemaVersion: 1,
      records: [
        {
          id: 'before-reset',
          completedAt: '2026-06-01T00:00:00.000Z',
          runtimeSec: 2_000_000,
        },
        {
          id: 'after-reset',
          completedAt: '2026-07-01T00:00:00.000Z',
          runtimeSec: 10_000,
        },
      ],
    })

    expect(ledger.records[0]?.id).toBe('after-reset')
  })

  it('rejects unknown schemas instead of overwriting them', () => {
    expect(() => normalizeMaintenanceLedger({
      schemaVersion: 2,
      records: [],
    })).toThrow('Неподдерживаемая версия данных технического обслуживания.')
  })
})
