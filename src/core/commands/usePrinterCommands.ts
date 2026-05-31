import { useCallback, useMemo, useState } from 'react'
import { dataMode } from '../../config'
import { getTreeDCommandBlockReason, type TreeDCommandRuntimeContext } from './catalog'
import { createMockCommandClient } from './mockCommandClient'
import { createMoonrakerCommandClient } from './moonrakerCommandClient'
import type { CommandResult, ExecuteCommandArgs, PrinterCommandId } from './types'

export function usePrinterCommands(runtimeContext: TreeDCommandRuntimeContext) {
  const powerCapability = runtimeContext.capabilities.power
  const [pendingCommand, setPendingCommand] = useState<PrinterCommandId | null>(
    null,
  )
  const [error, setError] = useState('')
  const [lastResult, setLastResult] = useState<CommandResult | null>(null)

  const client = useMemo(() => {
    return dataMode === 'live'
      ? createMoonrakerCommandClient({ capabilities: { power: powerCapability } })
      : createMockCommandClient()
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
        setError(blockReason)
        setLastResult(result)
        return false
      }

      setPendingCommand(command)
      setError('')

      try {
        const result = await client.execute(args)
        setLastResult(result)
        if (!result.ok) {
          setError(result.message)
          return false
        }

        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown command error'
        setError(message)
        return false
      } finally {
        setPendingCommand(null)
      }
    },
    [client, pendingCommand, runtimeContext],
  )

  const clearCommandError = useCallback(() => {
    setError('')
  }, [])

  return {
    pendingCommand,
    error,
    lastResult,
    executeCommand,
    clearCommandError,
  }
}
