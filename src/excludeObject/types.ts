import type { CommandResult, ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type { PrinterSnapshot } from '../core/transport/types'

export type ExcludeObjectControllerArgs = {
  snapshot: PrinterSnapshot
  isOpen: boolean
  pendingCommand: PrinterCommandId | null
  commandError: string
  lastResult: CommandResult | null
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
  refresh: () => Promise<void>
  onClose: () => void
  onRequestStopPrint: () => void
}
