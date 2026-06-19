import { useCallback, useMemo, useRef, useState } from 'react'
import { createCommandClient } from '#runtime'
import { getTreeDCommandBlockReason, type TreeDCommandRuntimeContext } from './catalog'
import type { CommandResult, ExecuteCommandArgs, PrinterCommandId } from './types'

type QueuedCoalescedCommand = {
  args: ExecuteCommandArgs
  resolve: (value: boolean) => void
}

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
  const runtimeContextRef = useRef(runtimeContext)

  const client = useMemo(() => {
    return createCommandClient({ capabilities: { power: powerCapability } })
  }, [powerCapability])

  runtimeContextRef.current = runtimeContext

  const executeCommand = useCallback(
    async (args: ExecuteCommandArgs): Promise<boolean> => {
      const { command } = args

      function runQueuedCommand(): void {
        if (activeCommandRef.current !== null) {
          return
        }

        const nextEntry = queuedCoalescedCommandsRef.current.entries().next().value
        if (nextEntry === undefined) {
          return
        }

        const [queuedCommand, queued] = nextEntry
        queuedCoalescedCommandsRef.current.delete(queuedCommand)
        void executeCommand(queued.args).then(queued.resolve)
      }

      if (activeCommandRef.current !== null) {
        if (isCoalescedCommand(command)) {
          const previousQueuedCommand = queuedCoalescedCommandsRef.current.get(command)
          previousQueuedCommand?.resolve(false)

          return new Promise<boolean>((resolve) => {
            queuedCoalescedCommandsRef.current.set(command, {
              args,
              resolve,
            })
          })
        }

        return false
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
      setPendingCommand(command)
      lastErrorRef.current = ''
      setError('')

      try {
        const result = await client.execute(args)
        setLastResult(result)
        if (!result.ok) {
          lastErrorRef.current = result.message
          setError(result.message)
          return false
        }

        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown command error'
        lastErrorRef.current = message
        setError(message)
        return false
      } finally {
        activeCommandRef.current = null
        setPendingCommand(null)
        runQueuedCommand()
      }
    },
    [client],
  )

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
