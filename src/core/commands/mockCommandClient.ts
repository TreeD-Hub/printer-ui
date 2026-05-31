import type { CommandClient, CommandResult, ExecuteCommandArgs } from './types'

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs)
  })
}

function buildMessage(args: ExecuteCommandArgs): string {
  switch (args.command) {
    case 'start':
      return `Mock: print start for ${args.filename}`
    case 'pause':
      return 'Mock: print paused'
    case 'resume':
      return 'Mock: print resumed'
    case 'cancel':
      return 'Mock: print canceled'
    case 'emergencyStop':
      return 'Mock: emergency stop triggered'
    case 'home':
    case 'homeAll':
      return 'Mock: G28 sent'
    case 'homeXY':
      return 'Mock: G28 X Y sent'
    case 'homeZ':
      return 'Mock: _TREED_EDDY_HOME_Z sent'
    case 'moveAxis':
      return `Mock: move ${args.axis}${args.distanceMm} sent`
    case 'setNozzleTarget':
      return `Mock: nozzle target set to ${args.targetCelsius}C`
    case 'setBedTarget':
      return `Mock: bed target set to ${args.targetCelsius}C`
    case 'turnOffHeaters':
      return 'Mock: heaters off'
    case 'setFanPercent':
      return `Mock: fan set to ${args.percent}%`
    case 'loadFilament':
      return 'Mock: load filament sent'
    case 'unloadFilament':
      return 'Mock: unload filament sent'
    case 'zParkZeroEddy':
      return 'Mock: TREED_Z_PARK_ZERO_EDDY sent'
    case 'shaperCalibrateLight':
      return 'Mock: shaper calibrate light sent'
    case 'shaperCalibrateFull':
      return 'Mock: shaper calibrate full sent'
    case 'xyMotionTest':
      return 'Mock: xy motion test sent'
    case 'consoleGcode':
      return 'Mock: console G-code sent'
    case 'rebootHost':
      return 'Mock: host reboot requested'
    case 'shutdownHost':
      return 'Mock: shutdown host is unsupported'
    default:
      return 'Mock: command executed'
  }
}

export function createMockCommandClient(): CommandClient {
  return {
    async execute(args: ExecuteCommandArgs): Promise<CommandResult> {
      await wait(220)

      if (args.command === 'shutdownHost') {
        return {
          command: args.command,
          ok: false,
          kind: 'unsupported',
          message: 'Mock: shutdown host is unsupported',
          at: new Date().toISOString(),
        }
      }

      return {
        command: args.command,
        ok: true,
        message: buildMessage(args),
        at: new Date().toISOString(),
      }
    },
  }
}
