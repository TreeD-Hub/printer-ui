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
  lighting: true,
  filament: true,
  filamentSensorControl: true,
  filamentEncoderSensitivity: true,
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
  transportState: 'online',
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
  mainLightEnabled: false,
  filamentSensor: {
    supported: true,
    motionSupported: true,
    mode: 'motion',
    sensitivity: 'medium',
    filamentDetected: true,
    switchEnabled: true,
    motionEnabled: true,
    message: null,
  },
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

  it('rejects non-coalesced commands in the same domain while another command is in flight', async () => {
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
      firstPromise = api!.executeCommand({ command: 'setNozzleTarget', targetCelsius: 215 })
      secondPromise = api!.executeCommand({ command: 'turnOffHeaters' })
    })

    expect(runtimeMocks.execute).toHaveBeenCalledTimes(1)
    await expect(secondPromise).resolves.toBe(false)

    await act(async () => {
      firstResult.resolve(success('setNozzleTarget'))
      await firstPromise
    })
  })

  it('allows commands in other domains while a domain is awaiting runtime confirmation', async () => {
    runtimeMocks.execute
      .mockResolvedValueOnce(accepted('setFilamentSensorMode'))
      .mockResolvedValueOnce(success('start'))
    let api: PrinterCommandsApi | null = null
    const idleContext: TreeDCommandRuntimeContext = {
      ...RUNTIME_CONTEXT,
      printJob: {
        filename: '',
        state: 'standby',
        isActive: false,
        isPaused: false,
      },
      filamentSensor: {
        ...RUNTIME_CONTEXT.filamentSensor!,
        mode: 'presence',
        motionEnabled: false,
      },
    }

    render(<Harness context={idleContext} onReady={(nextApi) => {
      api = nextApi
    }} />)

    await waitFor(() => {
      expect(api).not.toBeNull()
    })

    await act(async () => {
      await api!.executeCommand({ command: 'setFilamentSensorMode', mode: 'motion' })
    })
    expect(api!.pendingCommands.filament).toBe('setFilamentSensorMode')

    let startResult!: boolean
    await act(async () => {
      startResult = await api!.executeCommand({ command: 'start', filename: 'jobs/benchy.gcode' })
    })

    expect(startResult).toBe(true)
    expect(runtimeMocks.execute).toHaveBeenCalledTimes(2)
    expect(runtimeMocks.execute).toHaveBeenNthCalledWith(2, {
      command: 'start',
      filename: 'jobs/benchy.gcode',
    })
    expect(api!.pendingCommands.filament).toBe('setFilamentSensorMode')
    expect(api!.pendingCommands.print ?? null).toBeNull()
  })

  it.each([
    ['light', { command: 'setMainLightEnabled', enabled: true }, { command: 'firmwareRestart' }],
    ['fan', { command: 'setFanPercent', percent: 35 }, { command: 'restartKlipper' }],
    ['thermal', { command: 'setNozzleTarget', targetCelsius: 205 }, { command: 'restartUi' }],
    ['filament', { command: 'setFilamentSensorMode', mode: 'presence' }, { command: 'restartMoonraker' }],
  ] satisfies Array<[string, ExecuteCommandArgs, ExecuteCommandArgs]>)(
    'does not let pending %s block a system command',
    async (_domain, pendingArgs, systemArgs) => {
      const pendingResult = createDeferred<CommandResult>()
      runtimeMocks.execute
        .mockReturnValueOnce(pendingResult.promise)
        .mockResolvedValueOnce(success(systemArgs.command))
      let api: PrinterCommandsApi | null = null
      const idleContext: TreeDCommandRuntimeContext = {
        ...RUNTIME_CONTEXT,
        printJob: {
          filename: '',
          state: 'standby',
          isActive: false,
          isPaused: false,
        },
      }

      render(<Harness context={idleContext} onReady={(nextApi) => {
        api = nextApi
      }} />)

      await waitFor(() => {
        expect(api).not.toBeNull()
      })

      let pendingPromise!: Promise<boolean>
      let systemPromise!: Promise<boolean>
      await act(async () => {
        pendingPromise = api!.executeCommand(pendingArgs)
        systemPromise = api!.executeCommand(systemArgs)
        await systemPromise
      })

      expect(runtimeMocks.execute).toHaveBeenNthCalledWith(1, pendingArgs)
      expect(runtimeMocks.execute).toHaveBeenNthCalledWith(2, systemArgs)
      await expect(systemPromise).resolves.toBe(true)

      await act(async () => {
        pendingResult.resolve(success(pendingArgs.command))
        await pendingPromise
      })
    },
  )

  it('blocks a second system command while the first is in flight', async () => {
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
      firstPromise = api!.executeCommand({ command: 'restartKlipper' })
      secondPromise = api!.executeCommand({ command: 'firmwareRestart' })
    })

    expect(runtimeMocks.execute).toHaveBeenCalledTimes(1)
    await expect(secondPromise).resolves.toBe(false)

    await act(async () => {
      firstResult.resolve(success('restartKlipper'))
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
      regularPromise = api!.executeCommand({ command: 'restartMoonraker' })
      emergencyPromise = api!.executeCommand({ command: 'emergencyStop' })
      await emergencyPromise
    })

    expect(runtimeMocks.execute).toHaveBeenCalledTimes(2)
    expect(runtimeMocks.execute).toHaveBeenNthCalledWith(2, { command: 'emergencyStop' })
    await expect(emergencyPromise).resolves.toBe(true)

    await act(async () => {
      firstResult.resolve(success('restartMoonraker'))
      await regularPromise
    })
    await expect(regularPromise).resolves.toBe(false)
  })

  it('dispatches cancel through the critical path and clears noncritical pending state', async () => {
    const firstResult = createDeferred<CommandResult>()
    runtimeMocks.execute
      .mockReturnValueOnce(firstResult.promise)
      .mockResolvedValueOnce(success('cancel'))
    let api: PrinterCommandsApi | null = null

    render(<Harness context={{
      ...RUNTIME_CONTEXT,
      mainLightEnabled: false,
    }} onReady={(nextApi) => {
      api = nextApi
    }} />)

    await waitFor(() => {
      expect(api).not.toBeNull()
    })

    let systemPromise!: Promise<boolean>
    let cancelPromise!: Promise<boolean>
    await act(async () => {
      systemPromise = api!.executeCommand({ command: 'restartUi' })
      cancelPromise = api!.executeCommand({ command: 'cancel' })
      await cancelPromise
    })

    expect(runtimeMocks.execute).toHaveBeenCalledTimes(2)
    expect(runtimeMocks.execute).toHaveBeenNthCalledWith(2, { command: 'cancel' })
    await expect(cancelPromise).resolves.toBe(true)
    expect(api!.pendingCommands.system ?? null).toBeNull()
    expect(api!.pendingCommands.critical ?? null).toBeNull()

    await act(async () => {
      firstResult.resolve(success('restartUi'))
      await systemPromise
    })
    await expect(systemPromise).resolves.toBe(false)
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

  it('confirms main light from updated runtime state', async () => {
    runtimeMocks.execute.mockResolvedValue(accepted('setMainLightEnabled'))
    let api: PrinterCommandsApi | null = null
    const onReady = (nextApi: PrinterCommandsApi) => {
      api = nextApi
    }
    const initialContext: TreeDCommandRuntimeContext = {
      ...RUNTIME_CONTEXT,
      mainLightEnabled: false,
    }
    const { rerender } = render(<Harness context={initialContext} onReady={onReady} />)

    await waitFor(() => {
      expect(api).not.toBeNull()
    })

    await act(async () => {
      await api!.executeCommand({ command: 'setMainLightEnabled', enabled: true })
    })

    expect(api!.pendingCommand).toBe('setMainLightEnabled')

    rerender(<Harness context={{
      ...initialContext,
      mainLightEnabled: true,
    }} onReady={onReady} />)

    await waitFor(() => {
      expect(api!.pendingCommand).toBeNull()
      expect(api!.lastResult).toEqual(expect.objectContaining({ status: 'confirmed' }))
    })
  })

  it('allows fan changes while another command is awaiting runtime confirmation', async () => {
    runtimeMocks.execute
      .mockResolvedValueOnce(accepted('setMainLightEnabled'))
      .mockResolvedValueOnce(success('setFanPercent'))
    let api: PrinterCommandsApi | null = null

    render(<Harness context={{
      ...RUNTIME_CONTEXT,
      mainLightEnabled: false,
    }} onReady={(nextApi) => {
      api = nextApi
    }} />)

    await waitFor(() => {
      expect(api).not.toBeNull()
    })

    await act(async () => {
      await api!.executeCommand({ command: 'setMainLightEnabled', enabled: true })
    })
    expect(api!.pendingCommand).toBe('setMainLightEnabled')

    let fanResult!: boolean
    await act(async () => {
      fanResult = await api!.executeCommand({ command: 'setFanPercent', percent: 70 })
    })

    expect(fanResult).toBe(true)
    expect(runtimeMocks.execute).toHaveBeenCalledTimes(2)
    expect(runtimeMocks.execute).toHaveBeenNthCalledWith(2, { command: 'setFanPercent', percent: 70 })
    expect(api!.pendingCommand).toBe('setMainLightEnabled')
  })

  it('confirms filament mode and sensitivity only from updated runtime state', async () => {
    runtimeMocks.execute
      .mockResolvedValueOnce(accepted('setFilamentSensorMode'))
      .mockResolvedValueOnce(accepted('setFilamentEncoderSensitivity'))
    let api: PrinterCommandsApi | null = null
    const onReady = (nextApi: PrinterCommandsApi) => {
      api = nextApi
    }
    const idleContext: TreeDCommandRuntimeContext = {
      ...RUNTIME_CONTEXT,
      printJob: {
        filename: '',
        state: 'standby',
        isActive: false,
        isPaused: false,
      },
      filamentSensor: {
        ...RUNTIME_CONTEXT.filamentSensor!,
        mode: 'presence',
        motionEnabled: false,
      },
    }
    const { rerender } = render(<Harness context={idleContext} onReady={onReady} />)

    await waitFor(() => expect(api).not.toBeNull())
    await act(async () => {
      await api!.executeCommand({ command: 'setFilamentSensorMode', mode: 'motion' })
    })
    expect(api!.pendingCommand).toBe('setFilamentSensorMode')

    const motionContext = {
      ...idleContext,
      filamentSensor: {
        ...idleContext.filamentSensor!,
        mode: 'motion' as const,
        motionEnabled: true,
      },
    }
    rerender(<Harness context={motionContext} onReady={onReady} />)
    await waitFor(() => expect(api!.pendingCommand).toBeNull())

    await act(async () => {
      await api!.executeCommand({ command: 'setFilamentEncoderSensitivity', sensitivity: 'high' })
    })
    expect(api!.pendingCommand).toBe('setFilamentEncoderSensitivity')

    rerender(<Harness context={{
      ...motionContext,
      filamentSensor: {
        ...motionContext.filamentSensor,
        sensitivity: 'high',
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

  it('keeps filament sensitivity pending through the Klipper restart window', async () => {
    runtimeMocks.execute.mockResolvedValue(accepted('setFilamentEncoderSensitivity'))
    let api: PrinterCommandsApi | null = null
    const idleContext: TreeDCommandRuntimeContext = {
      ...RUNTIME_CONTEXT,
      printJob: {
        filename: '',
        state: 'standby',
        isActive: false,
        isPaused: false,
      },
    }

    render(<Harness context={idleContext} onReady={(nextApi) => {
      api = nextApi
    }} />)

    await waitFor(() => {
      expect(api).not.toBeNull()
    })

    vi.useFakeTimers()
    await act(async () => {
      await api!.executeCommand({ command: 'setFilamentEncoderSensitivity', sensitivity: 'high' })
      await vi.advanceTimersByTimeAsync(12_000)
    })

    expect(api!.pendingCommand).toBe('setFilamentEncoderSensitivity')
    expect(api!.lastResult).toEqual(expect.objectContaining({
      ok: true,
      status: 'accepted',
    }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(78_000)
    })

    expect(api!.pendingCommand).toBeNull()
    expect(api!.lastResult).toEqual(expect.objectContaining({
      ok: false,
      kind: 'confirmation_timeout',
    }))
  })
})
