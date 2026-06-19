import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePrinterCommands } from './usePrinterCommands'
import type { CommandResult, ExecuteCommandArgs } from './types'
import type { TreeDCommandRuntimeContext } from './catalog'

const runtimeMocks = vi.hoisted(() => ({
  execute: vi.fn(),
}))

vi.mock('#runtime', () => ({
  createCommandClient: () => ({
    execute: runtimeMocks.execute,
  }),
}))

const ALL_CAPABILITIES = {
  print: true,
  motion: true,
  thermal: true,
  fan: true,
  filament: true,
  console: true,
  eddy: true,
  shaper: true,
  motionTest: true,
  power: true,
  network: false,
  cloud: false,
  updates: false,
  systemPower: true,
  camera: false,
  serviceCommands: true,
} as const

const RUNTIME_CONTEXT: TreeDCommandRuntimeContext = {
  capabilities: ALL_CAPABILITIES,
  connection: 'online',
  printJob: {
    state: 'printing',
    isActive: true,
    isPaused: false,
  },
  homedAxes: 'xyz',
  toolhead: {
    rawX: 10,
    rawY: 20,
    rawZ: 5,
  },
  eddyStatus: 'ready',
  extruderTemp: 210,
}

type PrinterCommandsApi = ReturnType<typeof usePrinterCommands>

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function success(command: ExecuteCommandArgs['command']): CommandResult {
  return {
    command,
    ok: true,
    message: 'ok',
    at: '2026-06-18T00:00:00.000Z',
  }
}

function Harness({ onReady }: { onReady: (api: PrinterCommandsApi) => void }) {
  const api = usePrinterCommands(RUNTIME_CONTEXT)

  useEffect(() => {
    onReady(api)
  }, [api, onReady])

  return null
}

describe('usePrinterCommands', () => {
  beforeEach(() => {
    runtimeMocks.execute.mockReset()
  })

  it('coalesces repeated fan commands while a previous command is in flight', async () => {
    const firstResult = createDeferred<CommandResult>()
    runtimeMocks.execute
      .mockReturnValueOnce(firstResult.promise)
      .mockResolvedValueOnce(success('setFanPercent'))
    let api: PrinterCommandsApi | null = null

    render(<Harness onReady={(nextApi) => {
      api = nextApi
    }} />)

    await waitFor(() => {
      expect(api).not.toBeNull()
    })

    let firstPromise!: Promise<boolean>
    let supersededPromise!: Promise<boolean>
    let latestPromise!: Promise<boolean>
    await act(async () => {
      firstPromise = api!.executeCommand({ command: 'setFanPercent', percent: 40 })
      supersededPromise = api!.executeCommand({ command: 'setFanPercent', percent: 55 })
      latestPromise = api!.executeCommand({ command: 'setFanPercent', percent: 70 })
    })

    expect(runtimeMocks.execute).toHaveBeenCalledTimes(1)
    expect(runtimeMocks.execute).toHaveBeenNthCalledWith(1, { command: 'setFanPercent', percent: 40 })

    await act(async () => {
      firstResult.resolve(success('setFanPercent'))
      await firstPromise
    })

    await waitFor(() => {
      expect(runtimeMocks.execute).toHaveBeenCalledTimes(2)
    })
    expect(runtimeMocks.execute).toHaveBeenNthCalledWith(2, { command: 'setFanPercent', percent: 70 })
    await expect(supersededPromise).resolves.toBe(false)
    await expect(latestPromise).resolves.toBe(true)
  })

  it('rejects non-coalesced commands while another command is in flight', async () => {
    const firstResult = createDeferred<CommandResult>()
    runtimeMocks.execute.mockReturnValueOnce(firstResult.promise)
    let api: PrinterCommandsApi | null = null

    render(<Harness onReady={(nextApi) => {
      api = nextApi
    }} />)

    await waitFor(() => {
      expect(api).not.toBeNull()
    })

    let firstPromise!: Promise<boolean>
    let secondPromise!: Promise<boolean>
    await act(async () => {
      firstPromise = api!.executeCommand({ command: 'turnOffHeaters' })
      secondPromise = api!.executeCommand({ command: 'homeAll' })
    })

    expect(runtimeMocks.execute).toHaveBeenCalledTimes(1)
    await expect(secondPromise).resolves.toBe(false)

    await act(async () => {
      firstResult.resolve(success('turnOffHeaters'))
      await firstPromise
    })
  })
})
