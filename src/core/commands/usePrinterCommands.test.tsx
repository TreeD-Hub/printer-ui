import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  source: 'live',
  capabilities: ALL_CAPABILITIES,
  connection: 'online',
  printJob: {
    filename: 'jobs/benchy.gcode',
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
  thermalTargets: {
    nozzle: 220,
    bed: 60,
  },
  modelFanPercent: 50,
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
    status: 'confirmed',
    message: 'ok',
    at: '2026-06-18T00:00:00.000Z',
  }
}

function accepted(command: ExecuteCommandArgs['command']): CommandResult {
  return {
    command,
    ok: true,
    status: 'accepted',
    message: 'accepted',
    at: '2026-06-18T00:00:00.000Z',
  }
}

function Harness({
  context = RUNTIME_CONTEXT,
  onReady,
}: {
  context?: TreeDCommandRuntimeContext
  onReady: (api: PrinterCommandsApi) => void
}) {
  const api = usePrinterCommands(context)

  useEffect(() => {
    onReady(api)
  }, [api, onReady])

  return null
}

describe('usePrinterCommands', () => {
  beforeEach(() => {
    runtimeMocks.execute.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('rate-limits repeated coalesced commands after a fast command completes', async () => {
    runtimeMocks.execute.mockResolvedValue(success('setPrintSpeedFactorPercent'))
    let api: PrinterCommandsApi | null = null

    render(<Harness onReady={(nextApi) => {
      api = nextApi
    }} />)

    await waitFor(() => {
      expect(api).not.toBeNull()
    })

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-18T00:00:00.000Z'))

    let firstPromise!: Promise<boolean>
    await act(async () => {
      firstPromise = api!.executeCommand({ command: 'setPrintSpeedFactorPercent', percent: 100 })
      await firstPromise
    })

    let supersededPromise!: Promise<boolean>
    let latestPromise!: Promise<boolean>
    await act(async () => {
      supersededPromise = api!.executeCommand({ command: 'setPrintSpeedFactorPercent', percent: 105 })
      latestPromise = api!.executeCommand({ command: 'setPrintSpeedFactorPercent', percent: 110 })
    })

    expect(runtimeMocks.execute).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(119)
    })
    expect(runtimeMocks.execute).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1)
      await latestPromise
    })

    expect(runtimeMocks.execute).toHaveBeenCalledTimes(2)
    expect(runtimeMocks.execute).toHaveBeenNthCalledWith(2, {
      command: 'setPrintSpeedFactorPercent',
      percent: 110,
    })
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

  it('dispatches emergency stop even while another command is in flight', async () => {
    const firstResult = createDeferred<CommandResult>()
    runtimeMocks.execute
      .mockReturnValueOnce(firstResult.promise)
      .mockResolvedValueOnce(success('emergencyStop'))
    let api: PrinterCommandsApi | null = null

    render(<Harness onReady={(nextApi) => {
      api = nextApi
    }} />)

    await waitFor(() => {
      expect(api).not.toBeNull()
    })

    let regularPromise!: Promise<boolean>
    let emergencyPromise!: Promise<boolean>
    await act(async () => {
      regularPromise = api!.executeCommand({ command: 'turnOffHeaters' })
      emergencyPromise = api!.executeCommand({ command: 'emergencyStop' })
      await emergencyPromise
    })

    expect(runtimeMocks.execute).toHaveBeenCalledTimes(2)
    expect(runtimeMocks.execute).toHaveBeenNthCalledWith(2, { command: 'emergencyStop' })
    await expect(emergencyPromise).resolves.toBe(true)

    await act(async () => {
      firstResult.resolve(success('turnOffHeaters'))
      await regularPromise
    })
    await expect(regularPromise).resolves.toBe(false)
  })

  it('keeps a stateful command pending until runtime state confirms it', async () => {
    runtimeMocks.execute.mockResolvedValue(accepted('pause'))
    let api: PrinterCommandsApi | null = null
    const onReady = (nextApi: PrinterCommandsApi) => {
      api = nextApi
    }
    const { rerender } = render(<Harness context={RUNTIME_CONTEXT} onReady={onReady} />)

    await waitFor(() => {
      expect(api).not.toBeNull()
    })

    await act(async () => {
      await api!.executeCommand({ command: 'pause' })
    })

    await waitFor(() => {
      expect(api!.pendingCommand).toBe('pause')
      expect(api!.lastResult).toEqual(expect.objectContaining({ status: 'accepted' }))
    })

    rerender(<Harness context={{
      ...RUNTIME_CONTEXT,
      printJob: {
        ...RUNTIME_CONTEXT.printJob!,
        state: 'paused',
        isPaused: true,
      },
    }} onReady={onReady} />)

    await waitFor(() => {
      expect(api!.pendingCommand).toBeNull()
      expect(api!.lastResult).toEqual(expect.objectContaining({ status: 'confirmed' }))
    })
  })

  it('reports confirmation timeout when runtime state does not change', async () => {
    runtimeMocks.execute.mockResolvedValue(accepted('turnOffHeaters'))
    let api: PrinterCommandsApi | null = null

    render(<Harness onReady={(nextApi) => {
      api = nextApi
    }} />)

    await waitFor(() => {
      expect(api).not.toBeNull()
    })

    vi.useFakeTimers()
    await act(async () => {
      await api!.executeCommand({ command: 'turnOffHeaters' })
      await vi.advanceTimersByTimeAsync(12_000)
    })

    expect(api!.pendingCommand).toBeNull()
    expect(api!.lastResult).toEqual(expect.objectContaining({
      ok: false,
      kind: 'confirmation_timeout',
    }))
  })
})
