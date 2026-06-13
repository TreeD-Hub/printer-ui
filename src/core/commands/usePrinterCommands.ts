import { useCallback, useMemo, useRef, useState } from 'react'
import { createCommandClient } from '#runtime'
import { getTreeDCommandBlockReason, type TreeDCommandRuntimeContext } from './catalog'
import type { CommandResult, ExecuteCommandArgs, PrinterCommandId } from './types'

export function usePrinterCommands(runtimeContext: TreeDCommandRuntimeContext) {
  const powerCapability = runtimeContext.capabilities.power
  const [pendingCommand, setPendingCommand] = useState<PrinterCommandId | null>(
    null,
  )
  const [error, setError] = useState('')
  const lastErrorRef = useRef('')
  const [lastResult, setLastResult] = useState<CommandResult | null>(null)

  const client = useMemo(() => {
    return createCommandClient({ capabilities: { power: powerCapability } })
  }, [powerCapability])

  const executeCommand = useCallback(
    async (args: ExecuteCommandArgs): Promise<boolean> => {
      const { command } = args

      if (pendingCommand) {
        return false
      }

      const blockReason = getTreeDCommandBlockReason(command, runtimeContext, args)
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
        setPendingCommand(null)
      }
    },
    [client, pendingCommand, runtimeContext],
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
