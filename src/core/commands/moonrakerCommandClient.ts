import { moonrakerUrl } from '../../config'
import {
  getTreeDCommandArgumentError,
  TREED_V2_COREXY_V1_LIMITS,
  type PrinterLimits,
} from '@treed/printer-logic'
import { MoonrakerTransportError } from '../transport/moonrakerClient'
import type {
  CommandClient,
  CommandResult,
  CommandUnsupportedResult,
  ExecuteCommandArgs,
} from './types'

type CommandCapabilityOptions = {
  power?: boolean
}

type MoonrakerCommandClientOptions = {
  moonrakerUrl?: string
  fetchImpl?: typeof fetch
  fetchTimeoutMs?: number
  capabilities?: CommandCapabilityOptions
  limits?: PrinterLimits
}

type MoonrakerEnvelope = {
  result?: unknown
  error?: {
    message?: string
  }
}

const DEFAULT_COMMAND_FETCH_TIMEOUT_MS = 8_000

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function parseMoonrakerError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as MoonrakerEnvelope
    if (payload.error?.message) {
      return payload.error.message
    }
  } catch {
    // Ignore parse errors and return HTTP status below.
  }

  return `HTTP ${response.status}`
}

async function parseMoonrakerEnvelope(response: Response): Promise<MoonrakerEnvelope | null> {
  try {
    return (await response.json()) as MoonrakerEnvelope
  } catch {
    return null
  }
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function callMoonraker(
  path: string,
  body: unknown,
  options: Required<Pick<MoonrakerCommandClientOptions, 'fetchImpl' | 'fetchTimeoutMs' | 'moonrakerUrl'>>,
  command?: ExecuteCommandArgs['command'],
): Promise<void> {
  const controller = new AbortController()
  let didTimeout = false
  const logContext = {
    command,
    path,
    body,
  }
  const timeoutId = window.setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, options.fetchTimeoutMs)
  const init: RequestInit = {
    method: 'POST',
    signal: controller.signal,
  }

  if (body !== undefined) {
    init.headers = {
      'Content-Type': 'application/json',
    }
    init.body = JSON.stringify(body)
  }

  let response: Response
  console.debug('[treed-command] sending', logContext)
  try {
    response = await options.fetchImpl(`${options.moonrakerUrl}${path}`, init)
  } catch (error) {
    if (didTimeout || isAbortError(error)) {
      const timeoutError = new MoonrakerTransportError('timeout', `Moonraker request timed out after ${options.fetchTimeoutMs}ms`)
      console.error('[treed-command] failed', {
        ...logContext,
        error: timeoutError.message,
      })
      throw timeoutError
    }

    console.error('[treed-command] failed', {
      ...logContext,
      error: formatUnknownError(error),
    })
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const error = new Error(await parseMoonrakerError(response))
    console.error('[treed-command] failed', {
      ...logContext,
      error: error.message,
    })
    throw error
  }

  const payload = await parseMoonrakerEnvelope(response)
  if (payload?.error?.message) {
    const error = new Error(payload.error.message)
    console.error('[treed-command] failed', {
      ...logContext,
      error: error.message,
    })
    throw error
  }

  console.debug('[treed-command] accepted', {
    ...logContext,
    response: payload,
  })
}

function sendScript(
  script: string,
  options: Required<Pick<MoonrakerCommandClientOptions, 'fetchImpl' | 'fetchTimeoutMs' | 'moonrakerUrl'>>,
  command?: ExecuteCommandArgs['command'],
): Promise<void> {
  return callMoonraker('/printer/gcode/script', { script }, options, command)
}

function mapFanPercentToM106(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent))
  return Math.round((clamped / 100) * 255)
}

function buildUnsupportedResult(command: ExecuteCommandArgs['command'], message: string): CommandUnsupportedResult {
  return {
    command,
    ok: false,
    kind: 'unsupported',
    message,
    at: new Date().toISOString(),
  }
}

function commandSuccessMessage(args: ExecuteCommandArgs): string {
  switch (args.command) {
    case 'start':
      return `Print started: ${args.filename}`
    case 'pause':
      return 'Pause request sent'
    case 'resume':
      return 'Resume request sent'
    case 'cancel':
      return 'Cancel request sent'
    case 'emergencyStop':
      return 'Emergency stop sent'
    case 'home':
    case 'homeAll':
      return 'G28 sent'
    case 'homeXY':
      return 'G28 X Y sent'
    case 'homeZ':
      return '_TREED_EDDY_HOME_Z sent'
    case 'moveAxis':
      return `Move ${args.axis}${args.distanceMm}mm sent`
    case 'setNozzleTarget':
      return `Nozzle target set to ${args.targetCelsius}C`
    case 'setBedTarget':
      return `Bed target set to ${args.targetCelsius}C`
    case 'setHeatingTargets':
      return `Heating targets set to nozzle ${args.nozzleCelsius}C, bed ${args.bedCelsius}C`
    case 'turnOffHeaters':
      return 'Heaters off sent'
    case 'setFanPercent':
      return `Fan set to ${args.percent}%`
    case 'setPrintSpeedFactorPercent':
      return `Print speed factor set to ${args.percent}%`
    case 'setPrintFlowFactorPercent':
      return `Print flow factor set to ${args.percent}%`
    case 'setPrintAccel':
      return `Print acceleration set to ${args.accelMmS2}mm/s²`
    case 'setPressureAdvance':
      return `Pressure advance set to ${args.advance}`
    case 'setRetractionLength':
      return `Retraction length set to ${args.retractLengthMm}mm`
    case 'adjustZOffset':
      return `Z-offset adjusted by ${args.deltaMm}mm`
    case 'loadFilament':
      return 'LOAD_FILAMENT sent'
    case 'unloadFilament':
      return 'UNLOAD_FILAMENT sent'
    case 'zParkZeroEddy':
      return 'TREED_Z_PARK_ZERO_EDDY sent'
    case 'shaperCalibrateLight':
      return 'TREED_SHAPER_CALIBRATE_LIGHT sent'
    case 'shaperCalibrateFull':
      return 'TREED_SHAPER_CALIBRATE_FULL sent'
    case 'xyMotionTest':
      return 'TREED_XY_MOTION_TEST sent'
    case 'disableMotors':
      return 'M84 sent'
    case 'consoleGcode':
      return 'Console G-code sent'
    case 'rebootHost':
      return 'Host reboot sent'
    case 'restartKlipper':
      return 'Klipper restart sent'
    case 'firmwareRestart':
      return 'Firmware restart sent'
    case 'restartMoonraker':
      return 'Moonraker restart sent'
    case 'shutdownHost':
      return 'Host shutdown sent'
    default:
      return 'Command sent'
  }
}

function formatFilamentScript(command: 'LOAD_FILAMENT' | 'UNLOAD_FILAMENT', args: Extract<ExecuteCommandArgs, { command: 'loadFilament' | 'unloadFilament' }>): string {
  const parts: string[] = [command]

  if (typeof args.lengthMm === 'number' && Number.isFinite(args.lengthMm)) {
    parts.push(`LENGTH=${args.lengthMm}`)
  }

  if (typeof args.speedMmS === 'number' && Number.isFinite(args.speedMmS)) {
    parts.push(`SPEED=${args.speedMmS}`)
  }

  return parts.join(' ')
}

function executeMoonrakerCommand(
  args: ExecuteCommandArgs,
  options: Required<Pick<MoonrakerCommandClientOptions, 'fetchImpl' | 'moonrakerUrl'>> & {
    fetchTimeoutMs: number
    capabilities: CommandCapabilityOptions
    limits: PrinterLimits
  },
): Promise<void> | CommandUnsupportedResult {
  const argumentError = getTreeDCommandArgumentError(args, options.limits)
  if (argumentError !== null) {
    throw new Error(argumentError)
  }

  switch (args.command) {
    case 'start': {
      const filename = args.filename.trim()

      if (!filename) {
        throw new Error('Please provide a file name to start printing')
      }

      return callMoonraker(
        `/printer/print/start?filename=${encodeURIComponent(filename)}`,
        undefined,
        options,
        args.command,
      )
    }
    case 'pause':
      return callMoonraker('/printer/print/pause', undefined, options, args.command)
    case 'resume':
      return callMoonraker('/printer/print/resume', undefined, options, args.command)
    case 'cancel':
      return callMoonraker('/printer/print/cancel', undefined, options, args.command)
    case 'emergencyStop':
      return callMoonraker('/printer/emergency_stop', undefined, options, args.command)
    case 'home':
    case 'homeAll':
      return sendScript('G28', options, args.command)
    case 'homeXY':
      return sendScript('G28 X Y', options, args.command)
    case 'homeZ':
      return sendScript('_TREED_EDDY_HOME_Z', options, args.command)
    case 'moveAxis': {
      const feedRateMmPerMin = args.feedRateMmPerMin ?? (args.speedMmS === undefined ? undefined : args.speedMmS * 60)
      const feedRate = feedRateMmPerMin !== undefined ? ` FEEDRATE=${feedRateMmPerMin}` : ''
      return sendScript(
        `TREED_UI_MOVE_AXIS AXIS=${args.axis} DISTANCE=${args.distanceMm}${feedRate}`,
        options,
        args.command,
      )
    }
    case 'setNozzleTarget':
      return sendScript(`${args.wait ? 'M109' : 'M104'} S${args.targetCelsius}`, options, args.command)
    case 'setBedTarget':
      return sendScript(`${args.wait ? 'M190' : 'M140'} S${args.targetCelsius}`, options, args.command)
    case 'setHeatingTargets':
      return sendScript(`M104 S${args.nozzleCelsius}\nM140 S${args.bedCelsius}`, options, args.command)
    case 'turnOffHeaters':
      return sendScript('TURN_OFF_HEATERS', options, args.command)
    case 'setFanPercent':
      return sendScript(`M106 S${mapFanPercentToM106(args.percent)}`, options, args.command)
    case 'setPrintSpeedFactorPercent':
      return sendScript(`TREED_UI_SET_SPEED_FACTOR PERCENT=${args.percent}`, options, args.command)
    case 'setPrintFlowFactorPercent':
      return sendScript(`TREED_UI_SET_FLOW_FACTOR PERCENT=${args.percent}`, options, args.command)
    case 'setPrintAccel':
      return sendScript(`TREED_UI_SET_ACCEL ACCEL=${args.accelMmS2}`, options, args.command)
    case 'setPressureAdvance':
      return sendScript(`TREED_UI_SET_PRESSURE_ADVANCE ADVANCE=${args.advance}`, options, args.command)
    case 'setRetractionLength':
      return sendScript(`TREED_UI_SET_RETRACTION RETRACT_LENGTH=${args.retractLengthMm}`, options, args.command)
    case 'adjustZOffset':
      return sendScript(`TREED_UI_ADJUST_Z_OFFSET DELTA=${args.deltaMm}`, options, args.command)
    case 'loadFilament':
      return sendScript(formatFilamentScript('LOAD_FILAMENT', args), options, args.command)
    case 'unloadFilament':
      return sendScript(formatFilamentScript('UNLOAD_FILAMENT', args), options, args.command)
    case 'zParkZeroEddy':
      return sendScript('TREED_Z_PARK_ZERO_EDDY', options, args.command)
    case 'shaperCalibrateLight':
      return sendScript('TREED_SHAPER_CALIBRATE_LIGHT', options, args.command)
    case 'shaperCalibrateFull':
      return sendScript('TREED_SHAPER_CALIBRATE_FULL', options, args.command)
    case 'xyMotionTest':
      return sendScript('TREED_XY_MOTION_TEST', options, args.command)
    case 'disableMotors':
      return sendScript('M84', options, args.command)
    case 'consoleGcode':
      return sendScript((args.script ?? args.gcode ?? '').trim(), options, args.command)
    case 'rebootHost':
      if (options.capabilities.power !== true) {
        return buildUnsupportedResult(args.command, 'Host reboot is not supported through this Moonraker client')
      }
      return callMoonraker('/machine/reboot', undefined, options, args.command)
    case 'restartKlipper':
      return callMoonraker('/printer/restart', undefined, options, args.command)
    case 'firmwareRestart':
      return callMoonraker('/printer/firmware_restart', undefined, options, args.command)
    case 'restartMoonraker':
      return callMoonraker('/server/restart', undefined, options, args.command)
    case 'shutdownHost':
      if (options.capabilities.power === true) {
        return callMoonraker('/machine/shutdown', undefined, options, args.command)
      }
      return buildUnsupportedResult(
        args.command,
        'Shutdown host is not supported through this Moonraker client',
      )
  }
}

export function createMoonrakerCommandClient(options: MoonrakerCommandClientOptions = {}): CommandClient {
  const clientOptions = {
    moonrakerUrl: options.moonrakerUrl ?? moonrakerUrl,
    fetchImpl: options.fetchImpl ?? fetch,
    fetchTimeoutMs: options.fetchTimeoutMs ?? DEFAULT_COMMAND_FETCH_TIMEOUT_MS,
    capabilities: options.capabilities ?? {},
    limits: options.limits ?? TREED_V2_COREXY_V1_LIMITS,
  }

  return {
    async execute(args: ExecuteCommandArgs): Promise<CommandResult> {
      const outcome = executeMoonrakerCommand(args, clientOptions)

      if ('ok' in outcome) {
        return outcome
      }

      await outcome

      return {
        command: args.command,
        ok: true,
        status: 'accepted',
        message: commandSuccessMessage(args),
        at: new Date().toISOString(),
      }
    },
  }
}
