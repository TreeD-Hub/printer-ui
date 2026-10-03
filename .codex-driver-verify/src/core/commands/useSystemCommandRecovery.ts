import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExecuteCommandArgs, PrinterCommandId } from './types'

export type SystemTransitionCommand = Extract<
  PrinterCommandId,
  'restartKlipper' | 'firmwareRestart' | 'restartUi' | 'restartMoonraker' | 'rebootHost' | 'shutdownHost'
>

type UseSystemCommandRecoveryArgs = {
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  refresh: () => Promise<void>
}

const RECOVERY_REFRESH_DELAYS_MS = [0, 1_000, 2_500, 5_000, 10_000] as const
const SYSTEM_TRANSITION_TIMEOUT_MS = 12_000
const RECOVERY_COMMANDS = new Set<SystemTransitionCommand>([
  'restartKlipper',
  'firmwareRestart',
  'restartMoonraker',
])
const SYSTEM_TRANSITION_COMMANDS = new Set<SystemTransitionCommand>([
  'restartKlipper',
  'firmwareRestart',
  'restartUi',
  'restartMoonraker',
  'rebootHost',
  'shutdownHost',
])

function isSystemTransitionCommand(command: PrinterCommandId): command is SystemTransitionCommand {
  return SYSTEM_TRANSITION_COMMANDS.has(command as SystemTransitionCommand)
}

export function useSystemCommandRecovery({
  executeCommand: executePrinterCommand,
  refresh,
}: UseSystemCommandRecoveryArgs) {
  const [transitionCommand, setTransitionCommand] = useState<SystemTransitionCommand | null>(null)
  const transitionCommandRef = useRef<SystemTransitionCommand | null>(null)
  const timerIdsRef = useRef<number[]>([])

  const clearTimers = useCallback((): void => {
    for (const timerId of timerIdsRef.current) {
      window.clearTimeout(timerId)
    }
    timerIdsRef.current = []
  }, [])

  const beginTransition = useCallback((command: SystemTransitionCommand): void => {
    clearTimers()
    transitionCommandRef.current = command
    setTransitionCommand(command)

    if (RECOVERY_COMMANDS.has(command)) {
      for (const delayMs of RECOVERY_REFRESH_DELAYS_MS) {
        timerIdsRef.current.push(window.setTimeout(() => {
          void refresh()
        }, delayMs))
      }
    }

    timerIdsRef.current.push(window.setTimeout(() => {
      if (transitionCommandRef.current === command) {
        transitionCommandRef.current = null
        setTransitionCommand(null)
      }
    }, SYSTEM_TRANSITION_TIMEOUT_MS))
  }, [clearTimers, refresh])

  const executeCommand = useCallback(async (args: ExecuteCommandArgs): Promise<boolean> => {
    if (isSystemTransitionCommand(args.command) && transitionCommandRef.current !== null) {
      return false
    }

    const ok = await executePrinterCommand(args)
    if (ok && isSystemTransitionCommand(args.command)) {
      beginTransition(args.command)
    }
    return ok
  }, [beginTransition, executePrinterCommand])

  useEffect(() => clearTimers, [clearTimers])

  return {
    executeCommand,
    transitionCommand,
  }
}
