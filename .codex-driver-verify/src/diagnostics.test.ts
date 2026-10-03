import { beforeEach, describe, expect, it } from 'vitest'
import { createMockSnapshot } from '../mocks/runtime'
import {
  createDiagnosticReport,
  readOperationalDiagnostics,
  recordOperationalDiagnostic,
} from './diagnostics'

describe('operational diagnostics', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('keeps the latest 20 operational events and exports runtime contract state', () => {
    for (let index = 0; index < 21; index += 1) {
      recordOperationalDiagnostic('command', `command-${index}`)
    }

    const entries = readOperationalDiagnostics()
    const report = JSON.parse(createDiagnosticReport(createMockSnapshot(), '0.1.0')) as {
      uiVersion: string
      deviceContract: { status: string }
      operationalEvents: Array<{ message: string }>
    }

    expect(entries).toHaveLength(20)
    expect(entries[0]?.message).toBe('command-20')
    expect(report.uiVersion).toBe('0.1.0')
    expect(report.deviceContract.status).toBe('compatible')
    expect(report.operationalEvents).toHaveLength(20)
  })
})
