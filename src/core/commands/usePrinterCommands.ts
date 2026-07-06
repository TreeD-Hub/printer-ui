import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createCommandClient } from '#runtime'
import { recordOperationalDiagnostic } from '../../diagnostics'
import {
  getFirstPrinterPendingCommand,
  getPrinterCommandPendingDomain,
  getTreeDCommandBlockReason,
  getTreeDCommandCatalogItem,
  type TreeDCommandRuntimeContext,
} from './catalog'
import type {
  CommandResult,
  ExecuteCommandArgs,
  PrinterCommandId,
  PrinterCommandPendingDomain,
  PrinterPendingCommands,
} from './types'

type QueuedCoalescedCommand = {
  args: ExecuteCommandArgs
  resolve: (value: boolean) => void
}

type PendingCommandConfirmation = {
  args: ExecuteCommandArgs
  acceptedResult: Extract<CommandResult, { ok: true }>
  domain: PrinterCommandPendingDomain
  token: number
  timeoutId: number
}

const COALESCED_COMMAND_RATE_LIMIT_MS = 120
const DEFAULT_COMMAND_CONFIRMATION_TIMEOUT_MS = 12_000
const RESTART_COMMAND_CONFIRMATION_TIMEOUT_MS = 90_000
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

function getCommandConfirmationTimeoutMs(args: ExecuteCommandArgs): number {
  return args.command === 'setFilamentEncoderSensitivity'
    ? RESTART_COMMAND_CONFIRMATION_TIMEOUT_MS
    : DEFAULT_COMMAND_CONFIRMATION_TIMEOUT_MS
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
    case 'setMainLightEnabled':
      return context.mainLightEnabled === args.enabled
    case 'excludeObject':
      return context.excludeObjects?.excludedObjectNames.includes(args.objectName) === true
    case 'setFilamentSensorMode':
      return (
        context.filamentSensor?.mode === args.mode &&
        context.filamentSensor.switchEnabled === true &&
        context.filamentSensor.motionEnabled === (args.mode === 'motion')
      )
    case 'setFilamentEncoderSensitivity':
      return context.filamentSensor?.sensitivity === args.sensitivity
    default:
      return null
  }
}

export function usePrinterCommands(runtimeContext: TreeDCommandRuntimeContext) {
  const [pendingCommands, setPendingCommands] = useState<PrinterPendingCommands>({})
  const [error, setError] = useState('')
  const lastErrorRef = useRef('')
  const [lastResult, setLastResult] = useState<CommandResult | null>(null)
  const activeCommandTokensRef = useRef<Map<PrinterCommandPendingDomain, number>>(new Map())
  const pendingCommandTokensRef = useRef<Map<PrinterCommandPendingDomain, number>>(new Map())
  const commandTokenRef = useRef(0)
  const queuedCoalescedCommandsRef = useRef<Map<PrinterCommandId, QueuedCoalescedCommand>>(new Map())
  const coalescedCommandTimersRef = useRef<Map<PrinterCommandId, number>>(new Map())
  const lastCoalescedCommandRunAtRef = useRef<Map<PrinterCommandId, number>>(new Map())
  const pendingConfirmationsRef = useRef<Map<PrinterCommandPendingDomain, PendingCommandConfirmation>>(new Map())
  const supersedeGenerationRef = useRef(0)
  const runtimeContextRef = useRef(runtimeContext)

  const client = useMemo(() => {
    return createCommandClient()
  }, [])

  runtimeContextRef.current = runtimeContext
  const pendingCommand = useMemo(() => getFirstPrinterPendingCommand(pendingCommands), [pendingCommands])

  const setPendingCommandForDomain = useCallback((
    domain: PrinterCommandPendingDomain,
    command: PrinterCommandId,
    token: number,
  ): void => {
    pendingCommandTokensRef.current.set(domain, token)
    setPendingCommands((currentCommands) => ({
      ...currentCommands,
      [domain]: command,
    }))
  }, [])

  const clearPendingCommandForDomain = useCallback((domain: PrinterCommandPendingDomain, token?: number): void => {
    if (token !== undefined && pendingCommandTokensRef.current.get(domain) !== token) {
      return
    }

    pendingCommandTokensRef.current.delete(domain)
    setPendingCommands((currentCommands) => {
      if ((currentCommands[domain] ?? null) === null) {
        return currentCommands
      }

      const nextCommands = { ...currentCommands }
      delete nextCommands[domain]
      return nextCommands
    })
  }, [])

  const clearPendingCommands = useCallback((): void => {
    pendingCommandTokensRef.current.clear()
    setPendingCommands({})
  }, [])

  const executeCommand = useCallback(
    async (args: ExecuteCommandArgs): Promise<boolean> => {
      const { command } = args
      const domain = getPrinterCommandPendingDomain(command)
      const isCriticalCommand = domain === 'critical'

      function runQueuedCommand(commandToRun?: PrinterCommandId): void {
        const nextEntry = commandToRun === undefined
          ? Array.from(queuedCoalescedCommandsRef.current.entries()).find(([, queued]) => (
              !activeCommandTokensRef.current.has(getPrinterCommandPendingDomain(queued.args.command))
            ))
          : [commandToRun, queuedCoalescedCommandsRef.current.get(commandToRun)] as const
        if (nextEntry === undefined || nextEntry[1] === undefined) {
          return
        }

        const [queuedCommand, queued] = nextEntry
        if (activeCommandTokensRef.current.has(getPrinterCommandPendingDomain(queued.args.command))) {
          return
        }

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

      function clearPendingConfirmations(): void {
        for (const pendingConfirmation of pendingConfirmationsRef.current.values()) {
          window.clearTimeout(pendingConfirmation.timeoutId)
        }
        pendingConfirmationsRef.current.clear()
      }

      if (!isCriticalCommand && pendingConfirmationsRef.current.has(domain) && !isCoalescedCommand(command)) {
        return false
      }

      if (!isCriticalCommand && activeCommandTokensRef.current.has(domain)) {
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

      const token = commandTokenRef.current + 1
      commandTokenRef.current = token
      let shouldClearPendingCommand = true

      if (isCriticalCommand) {
        supersedeGenerationRef.current += 1
        activeCommandTokensRef.current.clear()
        clearPendingConfirmations()
        clearQueuedCommands()
        clearPendingCommands()
      }

      activeCommandTokensRef.current.set(domain, token)
      const supersedeGeneration = supersedeGenerationRef.current
      if (isCoalescedCommand(command)) {
        lastCoalescedCommandRunAtRef.current.set(command, Date.now())
      }
      setPendingCommandForDomain(domain, command, token)
      lastErrorRef.current = ''
      setError('')

      try {
        recordOperationalDiagnostic('command', `${command}: dispatched`)
        const result = await client.execute(args)
        if (!isCriticalCommand && supersedeGeneration !== supersedeGenerationRef.current) {
          recordOperationalDiagnostic('command', `${command}: superseded_by_critical_command`)
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

        const confirmed = isCriticalCommand
          ? true
          : result.status === 'confirmed'
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
              const pending = pendingConfirmationsRef.current.get(domain)
              if (pending === undefined || pending.timeoutId !== timeoutId) {
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
              pendingConfirmationsRef.current.delete(domain)
              lastErrorRef.current = message
              setError(message)
              setLastResult(timeoutResult)
              clearPendingCommandForDomain(domain, token)
              recordOperationalDiagnostic('command', `${command}: confirmation_timeout`, message)
            }, getCommandConfirmationTimeoutMs(args))
            pendingConfirmationsRef.current.set(domain, {
              args,
              acceptedResult: result,
              domain,
              token,
              timeoutId,
            })
            shouldClearPendingCommand = false
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
        if (activeCommandTokensRef.current.get(domain) === token) {
          activeCommandTokensRef.current.delete(domain)
        }
        if (shouldClearPendingCommand && !pendingConfirmationsRef.current.has(domain)) {
          clearPendingCommandForDomain(domain, token)
        }
        runQueuedCommand()
      }
    },
    [clearPendingCommandForDomain, clearPendingCommands, client, setPendingCommandForDomain],
  )

  useEffect(() => {
    for (const pending of pendingConfirmationsRef.current.values()) {
      if (isCommandConfirmed(pending.args, runtimeContext) !== true) {
        continue
      }

      window.clearTimeout(pending.timeoutId)
      pendingConfirmationsRef.current.delete(pending.domain)
      lastErrorRef.current = ''
      setError('')
      setLastResult({
        ...pending.acceptedResult,
        status: 'confirmed',
        at: new Date().toISOString(),
      })
      clearPendingCommandForDomain(pending.domain, pending.token)
      recordOperationalDiagnostic('command', `${pending.args.command}: confirmed`)
    }
  }, [clearPendingCommandForDomain, runtimeContext])

  useEffect(() => {
    const pendingConfirmations = pendingConfirmationsRef.current
    const coalescedCommandTimers = coalescedCommandTimersRef.current
    const queuedCoalescedCommands = queuedCoalescedCommandsRef.current

    return () => {
      for (const pendingConfirmation of pendingConfirmations.values()) {
        window.clearTimeout(pendingConfirmation.timeoutId)
      }
      pendingConfirmations.clear()
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
    pendingCommands,
    error,
    lastResult,
    executeCommand,
    clearCommandError,
    getLastCommandError,
  }
}
