/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeMoonrakerRuntimeSnapshot } from './moonrakerNormalizer'

interface CoreProtocol {
  contractVersion: string
  profile: string
  capabilities: Record<string, number>
  requiredMacros: string
}

describe('printer-core protocol compatibility', () => {
  it.skipIf(!process.env.CORE_CONTRACT_FIXTURE)('normalizes the active Core contract', () => {
    const protocol = JSON.parse(readFileSync(process.env.CORE_CONTRACT_FIXTURE!, 'utf8')) as CoreProtocol
    const requiredMacros = protocol.requiredMacros.split(',')
    const status = Object.fromEntries(requiredMacros.map((name) => [`gcode_macro ${name}`, {}]))
    const snapshot = normalizeMoonrakerRuntimeSnapshot({
      status: {
        ...status,
        webhooks: { state: 'ready' },
        'gcode_macro _TREED_UI_CONTRACT': {
          contract_version: protocol.contractVersion,
          profile: protocol.profile,
          required_macros: protocol.requiredMacros,
          ...Object.fromEntries(Object.entries(protocol.capabilities).map(([name, value]) => [`capability_${name}`, value])),
        },
        'gcode_macro _TREED_SYSTEM_POWER': { enabled: 1 },
        'gcode_macro _TREED_SERVICE_COMMANDS': { enabled: 1 },
      },
    })

    expect(snapshot.uiContract).toMatchObject({
      status: 'compatible',
      contractVersion: protocol.contractVersion,
      profile: protocol.profile,
      requiredMacros,
      missingMacros: [],
    })
    for (const name of ['print', 'motion', 'thermal', 'fan', 'filament', 'console', 'eddy', 'shaper', 'network', 'camera']) {
      expect(snapshot.capabilities[name as keyof typeof snapshot.capabilities]).toBe(protocol.capabilities[name] === 1)
    }
    expect(snapshot.capabilities.motionTest).toBe(protocol.capabilities.motion_test === 1)
    expect(snapshot.capabilities.systemPower).toBe(protocol.capabilities.system_power === 1)
    expect(snapshot.capabilities.serviceCommands).toBe(protocol.capabilities.service_commands === 1)
  })
})
