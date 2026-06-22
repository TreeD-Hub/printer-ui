import { describe, expect, it } from 'vitest'
import { createMockSnapshot } from '../../../mocks/runtime'
import { reconcilePrinterSnapshot } from './printerStore'

describe('reconcilePrinterSnapshot', () => {
  it('keeps newer printer objects while applying a newer HTTP file list', () => {
    const previous = createMockSnapshot()
    previous.revisions.printerObjects = {
      eventtime: 20,
      receivedAt: 200,
      source: 'websocket',
    }
    previous.revisions.files = {
      eventtime: null,
      receivedAt: 100,
      source: 'http',
    }
    previous.extruderTemp = 220

    const staleHttp = createMockSnapshot()
    staleHttp.revisions.printerObjects = {
      eventtime: 10,
      receivedAt: 300,
      source: 'http',
    }
    staleHttp.revisions.files = {
      eventtime: null,
      receivedAt: 300,
      source: 'http',
    }
    staleHttp.extruderTemp = 180
    staleHttp.printFiles = [{
      id: 'new-file',
      path: 'new-file.gcode',
      name: 'new-file.gcode',
      directory: null,
      printTime: '1 мин',
      weight: '—',
      material: '—',
      addedAt: '2026-06-22T00:00:00.000Z',
    }]

    const result = reconcilePrinterSnapshot(previous, staleHttp)

    expect(result.extruderTemp).toBe(220)
    expect(result.printFiles).toEqual(staleHttp.printFiles)
    expect(result.revisions.printerObjects.eventtime).toBe(20)
    expect(result.revisions.files?.receivedAt).toBe(300)
  })

  it('accepts a lower eventtime after transport reconnect begins', () => {
    const previous = createMockSnapshot()
    previous.transport.state = 'reconnecting'
    previous.revisions.printerObjects.eventtime = 20

    const restarted = createMockSnapshot()
    restarted.revisions.printerObjects.eventtime = 1
    restarted.extruderTemp = 42

    expect(reconcilePrinterSnapshot(previous, restarted).extruderTemp).toBe(42)
  })
})
