import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createCommandClient } from '#runtime'
import { recordOperationalDiagnostic } from '../../diagnostics'
import {
  getTreeDCommandBlockReason,
  getTreeDCommandCatalogItem,
  type TreeDCommandRuntimeContext,
} from './catalog'
import type { CommandResult, ExecuteCommandArgs, PrinterCommandId } from './types'

type QueuedCoalescedCommand = {
  args: ExecuteCommandArgs
  resolve: (value: boolean) => void
}

type PendingCommandConfirmation = {
  args: ExecuteCommandArgs
  acceptedResult: Extract<CommandResult, { ok: true }>
  timeoutId: number
}

const COALESCED_COMMAND_RATE_LIMIT_MS = 120
const COMMAND_CONFIRMATION_TIMEOUT_MS = 12_000
const COALESCED_COMMANDS = new Set<PrinterCommandId>([
  'setFanPercent',
  'setPrintSpeedFactorPercent',
  'setPrintFlowFactorPercent',
  'setPrintAccel',
  'setPressureAdvance',
  'setRetractionLength',
])

function isCoalescedCommand(command: PrinterCommandId): boolean {
  return COALESCED_COMMANDS.has(command)
}

function isNear(left: number | undefined, right: number, tolerance = 0.5): boolean {
  return left !== undefined && Number.isFinite(left) && Math.abs(left - right) <= tolerance
}

function isCommandConfirmed(
  args: ExecuteCommandArgs,
  context: TreeDCommandRuntimeContext,
): boolean | null {
  if (context.source === 'mock') {
    return true
  }

  switch (args.command) {
    case 'start': {
      const currentFilename = context.printJob?.filename?.replace(/^\/+gcodes\//, '')
      const expectedFilename = args.filename.replace(/^\/+gcodes\//, '')
      return context.printJob?.state.toLowerCase() === 'printing' && currentFilename === expectedFilename
    }
    case 'pause':
      return context.printJob?.isPaused === true || context.printJob?.state.toLowerCase() === 'paused'
    case 'resume':
      return context.printJob?.isActive === true && context.printJob.isPaused === false && context.printJob.state.toLowerCase() === 'printing'
    case 'cancel':
      return context.printJob?.isActive === false && !['printing', 'paused'].includes(context.printJob.state.toLowerCase())
    case 'turnOffHeaters':
      return isNear(context.thermalTargets?.nozzle, 0) && isNear(context.thermalTargets?.bed, 0)
    case 'setNozzleTarget':
      return isNear(context.thermalTargets?.nozzle, args.targetCelsius)
    case 'setBedTarget':
      return isNear(context.thermalTargets?.bed, args.targetCelsius)
    case 'setHeatingTargets':
      return isNear(context.thermalTargets?.nozzle, args.nozzleCelsius) && isNear(context.thermalTargets?.bed, args.bedCelsius)
    default:
      return null
  }
}

export function usePrinterCommands(runtimeContext: TreeDCommandRuntimeContext) {
  const powerCapability = runtimeContext.capabilities.power
  const [pendingCommand, setPendingCommand] = useState<PrinterCommandId | null>(
    null,
  )
  const [error, setError] = useState('')
  const lastErrorRef = useRef('')
  const [lastResult, setLastResult] = useState<CommandResult | null>(null)
  const activeCommandRef = useRef<PrinterCommandId | null>(null)
  const queuedCoalescedCommandsRef = useRef<Map<PrinterCommandId, QueuedCoalescedCommand>>(new Map())
  const coalescedCommandTimersRef = useRef<Map<PrinterCommandId, number>>(new Map())
  const lastCoalescedCommandRunAtRef = useRef<Map<PrinterCommandId, number>>(new Map())
  const pendingConfirmationRef = useRef<PendingCommandConfirmation | null>(null)
  const emergencyGenerationRef = useRef(0)
  const runtimeContextRef = useRef(runtimeContext)

  const client = useMemo(() => {
    return createCommandClient({ capabilities: { power: powerCapability } })
  }, [powerCapability])

  runtimeContextRef.current = runtimeContext

  const executeCommand = useCallback(
    async (args: ExecuteCommandArgs): Promise<boolean> => {
      const { command } = args

      function runQueuedCommand(commandToRun?: PrinterCommandId): void {
        if (activeCommandRef.current !== null) {
          return
        }

        const nextEntry = commandToRun === undefined
          ? queuedCoalescedCommandsRef.current.entries().next().value
          : [commandToRun, queuedCoalescedCommandsRef.current.get(commandToRun)] as const
        if (nextEntry === undefined || nextEntry[1] === undefined) {
          return
        }

        const [queuedCommand, queued] = nextEntry
        queuedCoalescedCommandsRef.current.delete(queuedCommand)
        const timerId = coalescedCommandTimersRef.current.get(queuedCommand)
        if (timerId !== undefined) {
          window.clearTimeout(timerId)
          coalescedCommandTimersRef.current.delete(queuedCommand)
        }
        void executeCommand(queued.args).then(queued.resolve)
      }

      function scheduleQueuedCommand(queuedCommand: PrinterCommandId, delayMs: number): void {
        if (coalescedCommandTimersRef.current.has(queuedCommand)) {
          return
        }

        const timerId = window.setTimeout(() => {
          coalescedCommandTimersRef.current.delete(queuedCommand)
          runQueuedCommand(queuedCommand)
        }, delayMs)
        coalescedCommandTimersRef.current.set(queuedCommand, timerId)
      }

      function queueCoalescedCommand(delayMs?: number): Promise<boolean> {
        const previousQueuedCommand = queuedCoalescedCommandsRef.current.get(command)
        previousQueuedCommand?.resolve(false)

        return new Promise<boolean>((resolve) => {
          queuedCoalescedCommandsRef.current.set(command, {
            args,
            resolve,
          })

          if (delayMs !== undefined) {
            scheduleQueuedCommand(command, delayMs)
          }
        })
      }

      function clearQueuedCommands(): void {
        for (const timerId of coalescedCommandTimersRef.current.values()) {
          window.clearTimeout(timerId)
        }
        coalescedCommandTimersRef.current.clear()
        for (const queued of queuedCoalescedCommandsRef.current.values()) {
          queued.resolve(false)
        }
        queuedCoalescedCommandsRef.current.clear()
      }

      if (command === 'emergencyStop') {
        emergencyGenerationRef.current += 1
        const pendingConfirmation = pendingConfirmationRef.current
        if (pendingConfirmation !== null) {
          window.clearTimeout(pendingConfirmation.timeoutId)
          pendingConfirmationRef.current = null
          setPendingCommand(null)
        }
        clearQueuedCommands()
        recordOperationalDiagnostic('command', `${command}: dispatched`)
        try {
          const result = await client.execute(args)
          setLastResult(result)
          if (!result.ok) {
            lastErrorRef.current = result.message
            setError(result.message)
            recordOperationalDiagnostic('command', `${command}: rejected`, result.message)
            return false
          }
          recordOperationalDiagnostic('command', `${command}: ${result.status}`)
          return true
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown emergency stop error'
          const result: CommandResult = {
            command,
            ok: false,
            kind: 'failed',
            message,
            at: new Date().toISOString(),
          }
          lastErrorRef.current = message
          setError(message)
          setLastResult(result)
          recordOperationalDiagnostic('command', `${command}: failed`, message)
          return false
        }
      }

      if (pendingConfirmationRef.current !== null) {
        return false
      }

      if (activeCommandRef.current !== null) {
        if (isCoalescedCommand(command)) {
          return queueCoalescedCommand()
        }

        return false
      }

      if (isCoalescedCommand(command)) {
        const lastRunAt = lastCoalescedCommandRunAtRef.current.get(command)
        if (lastRunAt !== undefined) {
          const delayMs = COALESCED_COMMAND_RATE_LIMIT_MS - (Date.now() - lastRunAt)
          if (delayMs > 0) {
            return queueCoalescedCommand(delayMs)
          }
        }
      }

      const blockReason = getTreeDCommandBlockReason(command, runtimeContextRef.current, args)
      if (blockReason !== null) {
        const result: CommandResult = {
          command,
          ok: false,
          kind: 'unsupported',
          message: blockReason,
          at: new Date().toISOString(),
        }
        lastErrorRef.current = blockReason
        setError(blockReason)
        setLastResult(result)
        return false
      }

      activeCommandRef.current = command
      const emergencyGeneration = emergencyGenerationRef.current
      if (isCoalescedCommand(command)) {
        lastCoalescedCommandRunAtRef.current.set(command, Date.now())
      }
      setPendingCommand(command)
      lastErrorRef.current = ''
      setError('')

      try {
        recordOperationalDiagnostic('command', `${command}: dispatched`)
        const result = await client.execute(args)
        if (emergencyGeneration !== emergencyGenerationRef.current) {
          recordOperationalDiagnostic('command', `${command}: superseded_by_emergency_stop`)
          return false
        }
        setLastResult(result)
        if (!result.ok) {
          lastErrorRef.current = result.message
          setError(result.message)
          recordOperationalDiagnostic('command', `${command}: rejected`, result.message)
          return false
        }
        recordOperationalDiagnostic('command', `${command}: ${result.status}`)

        const confirmed = result.status === 'confirmed'
          ? true
          : isCommandConfirmed(args, runtimeContextRef.current)
        if (confirmed !== null) {
          if (confirmed) {
            setLastResult({
              ...result,
              status: 'confirmed',
            })
          } else {
            const timeoutId = window.setTimeout(() => {
              const pending = pendingConfirmationRef.current
              if (pending === null || pending.timeoutId !== timeoutId) {
                return
              }

              const message = `${getTreeDCommandCatalogItem(command).label}: подтверждение состояния не получено.`
              const timeoutResult: CommandResult = {
                command,
                ok: false,
                kind: 'confirmation_timeout',
                message,
                at: new Date().toISOString(),
              }
              pendingConfirmationRef.current = null
              lastErrorRef.current = message
              setError(message)
              setLastResult(timeoutResult)
              setPendingCommand(null)
              recordOperationalDiagnostic('command', `${command}: confirmation_timeout`, message)
            }, COMMAND_CONFIRMATION_TIMEOUT_MS)
            pendingConfirmationRef.current = {
              args,
              acceptedResult: result,
              timeoutId,
            }
          }
        }

        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown command error'
        const result: CommandResult = {
          command,
          ok: false,
          kind: 'failed',
          message,
          at: new Date().toISOString(),
        }
        lastErrorRef.current = message
        setError(message)
        setLastResult(result)
        recordOperationalDiagnostic('command', `${command}: failed`, message)
        return false
      } finally {
        activeCommandRef.current = null
        if (pendingConfirmationRef.current?.args.command !== command) {
          setPendingCommand(null)
          runQueuedCommand()
        }
      }
    },
    [client],
  )

  useEffect(() => {
    const pending = pendingConfirmationRef.current
    if (pending === null || isCommandConfirmed(pending.args, runtimeContext) !== true) {
      return
    }

    window.clearTimeout(pending.timeoutId)
    pendingConfirmationRef.current = null
    lastErrorRef.current = ''
    setError('')
    setLastResult({
      ...pending.acceptedResult,
      status: 'confirmed',
      at: new Date().toISOString(),
    })
    setPendingCommand(null)
    recordOperationalDiagnostic('command', `${pending.args.command}: confirmed`)
  }, [runtimeContext])

  useEffect(() => {
    const coalescedCommandTimers = coalescedCommandTimersRef.current
    const queuedCoalescedCommands = queuedCoalescedCommandsRef.current

    return () => {
      const pendingConfirmation = pendingConfirmationRef.current
      if (pendingConfirmation !== null) {
        window.clearTimeout(pendingConfirmation.timeoutId)
      }
      for (const timerId of coalescedCommandTimers.values()) {
        window.clearTimeout(timerId)
      }
      coalescedCommandTimers.clear()
      for (const queued of queuedCoalescedCommands.values()) {
        queued.resolve(false)
      }
      queuedCoalescedCommands.clear()
    }
  }, [])

  const clearCommandError = useCallback(() => {
    lastErrorRef.current = ''
    setError('')
  }, [])

  const getLastCommandError = useCallback(() => lastErrorRef.current, [])

  return {
    pendingCommand,
    error,
    lastResult,
    executeCommand,
    clearCommandError,
    getLastCommandError,
  }
}
