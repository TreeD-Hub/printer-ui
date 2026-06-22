import { type ReactNode, useEffect, useMemo, useState } from 'react'

import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type { PrinterConnectionState } from '../core/transport/types'
import type { PrinterLimits } from '@treed/printer-logic'
import type {
  FanControlPanelProps,
  HeatingCommandBlockReasons,
  HeatingControlPanelProps,
  HeatingControlRow,
  TemperatureChartSeries,
  TemperatureKeyboardTarget,
} from '../control/types'
import type { PrintTuneModalProps, TemperatureChartMode } from '../printTune'

type HeatingSnapshot = {
  connection?: PrinterConnectionState
  extruderTemp: number
  bedTemp: number
  modelFanPercent: number
  thermalTargets: {
    nozzle: number
    bed: number
  }
  limits: PrinterLimits
}

type TemperatureHistoryPoint = {
  nozzle: number
  bed: number
}

const MAX_TEMPERATURE_HISTORY_POINTS = 48
const COMMAND_BUSY_REASON = 'Команда уже выполняется.'

type UseHeatingFanControllerArgs = {
  snapshot: HeatingSnapshot
  isBusy: boolean
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
  closePrintTuneKeyboard: () => void
}

export type UseHeatingFanControllerResult = {
  printNozzleTargetTemp: number
  printBedTargetTemp: number
  printFanPercent: number
  dashboardTemperatureTargets: {
    nozzle: number
    bed: number
  }
  temperatureChartSeries: TemperatureChartSeries[]
  heatingProps: HeatingControlPanelProps
  fanProps: FanControlPanelProps
  printTuneTemperatureProps: PrintTuneModalProps['temperature']
  temperatureChartMode: TemperatureChartMode
  setTemperatureChartMode: (mode: TemperatureChartMode) => void
  handleTemperatureKeyboardDigit: (digit: string) => void
  handleTemperatureKeyboardBackspace: () => void
  handleTemperatureKeyboardSubmit: () => void
  openTemperatureKeyboard: (target: TemperatureKeyboardTarget) => void
  closeTemperatureKeyboard: () => void
  handleFanPercentChange: (nextValue: number) => void
}

export function useHeatingFanController({
  snapshot,
  isBusy,
  executeCommand,
  getCommandBlockReason,
  closePrintTuneKeyboard,
}: UseHeatingFanControllerArgs): UseHeatingFanControllerResult {
  const [temperatureChartMode, setTemperatureChartMode] = useState<TemperatureChartMode>('both')
  const [temperatureKeyboardTarget, setTemperatureKeyboardTarget] = useState<TemperatureKeyboardTarget | null>(null)
  const [temperatureKeyboardValue, setTemperatureKeyboardValue] = useState<string>('')
  const [temperatureHistory, setTemperatureHistory] = useState<TemperatureHistoryPoint[]>(() => (
    isTemperatureSnapshotConnected(snapshot) ? [createTemperatureHistoryPoint(snapshot)] : []
  ))
  const printNozzleTargetTemp = snapshot.thermalTargets.nozzle
  const printBedTargetTemp = snapshot.thermalTargets.bed
  const printFanPercent = Math.round(snapshot.modelFanPercent)

  const dashboardTemperatureTargets = useMemo(
    () => ({
      nozzle: printNozzleTargetTemp,
      bed: printBedTargetTemp,
    }),
    [printBedTargetTemp, printNozzleTargetTemp],
  )

  const heatingCommandBlockReasons = useMemo<HeatingCommandBlockReasons>(() => {
    const busyReason = isBusy ? COMMAND_BUSY_REASON : null

    return {
      nozzleTarget: busyReason ?? getCommandBlockReason('setNozzleTarget'),
      bedTarget: busyReason ?? getCommandBlockReason('setBedTarget'),
      turnOffHeaters: busyReason ?? getCommandBlockReason('turnOffHeaters'),
    }
  }, [getCommandBlockReason, isBusy])
  const fanCommandBlockReason = isBusy ? COMMAND_BUSY_REASON : getCommandBlockReason('setFanPercent')

  useEffect(() => {
    if (!isTemperatureSnapshotConnected(snapshot)) {
      return
    }

    const nextPoint = createTemperatureHistoryPoint(snapshot)
    setTemperatureHistory((currentHistory) => {
      const lastPoint = currentHistory.at(-1)
      if (lastPoint?.nozzle === nextPoint.nozzle && lastPoint.bed === nextPoint.bed) {
        return currentHistory
      }

      return [...currentHistory, nextPoint].slice(-MAX_TEMPERATURE_HISTORY_POINTS)
    })
  }, [snapshot])

  const temperatureChartSeries = useMemo<TemperatureChartSeries[]>(
    () => [
      {
        id: 'nozzle',
        label: 'Сопло',
        tone: 'orange',
        values: temperatureHistory.map((point) => point.nozzle),
        target: printNozzleTargetTemp,
      },
      {
        id: 'bed',
        label: 'Стол',
        tone: 'green',
        values: temperatureHistory.map((point) => point.bed),
        target: printBedTargetTemp,
      },
    ],
    [printBedTargetTemp, printNozzleTargetTemp, temperatureHistory],
  )

  const heatingControlRows: HeatingControlRow[] = [
    {
      id: 'nozzle',
      keyboardTarget: 'nozzle',
      icon: 'metricNozzle',
      uiLabel: 'Сопло',
      tone: 'orange',
      current: snapshot.extruderTemp,
      target: printNozzleTargetTemp,
      onTargetChange: handleNozzleTargetChange,
      testIdPrefix: 'control-heating-nozzle',
    },
    {
      id: 'bed',
      keyboardTarget: 'bed',
      icon: 'metricBed',
      uiLabel: 'Стол',
      tone: 'green',
      current: snapshot.bedTemp,
      target: printBedTargetTemp,
      onTargetChange: handleBedTargetChange,
      testIdPrefix: 'control-heating-bed',
    },
  ]

  function handleNozzleTargetChange(value: number): void {
    const normalized = Math.round(clampHeatingValue(value, 0, 300))
    void executeCommand({ command: 'setNozzleTarget', targetCelsius: normalized })
  }

  function handleBedTargetChange(value: number): void {
    const normalized = Math.round(clampHeatingValue(value, 0, 300))
    void executeCommand({ command: 'setBedTarget', targetCelsius: normalized })
  }

  function openTemperatureKeyboard(target: TemperatureKeyboardTarget): void {
    closePrintTuneKeyboard()
    setTemperatureKeyboardTarget(target)
    setTemperatureKeyboardValue('')
  }

  function closeTemperatureKeyboard(): void {
    setTemperatureKeyboardTarget(null)
    setTemperatureKeyboardValue('')
  }

  function handleTemperatureKeyboardDigit(digit: string): void {
    setTemperatureKeyboardValue((current) => {
      const next = `${current}${digit}`.replace(/^0+(?=\d)/, '')
      return next.slice(0, 3)
    })
  }

  function handleTemperatureKeyboardBackspace(): void {
    setTemperatureKeyboardValue((current) => current.slice(0, -1))
  }

  async function handleTemperatureKeyboardSubmit(): Promise<void> {
    if (temperatureKeyboardTarget === null) {
      return
    }

    if (temperatureKeyboardValue.trim().length === 0) {
      return
    }

    const parsed = Number(temperatureKeyboardValue)
    if (Number.isNaN(parsed)) {
      return
    }

    const maxCelsius = temperatureKeyboardTarget === 'nozzle'
      ? snapshot.limits.nozzleMaxC
      : snapshot.limits.bedMaxC
    const normalized = Math.round(clampHeatingValue(parsed, 0, maxCelsius))
    const ok = await executeCommand({
      command: temperatureKeyboardTarget === 'nozzle' ? 'setNozzleTarget' : 'setBedTarget',
      targetCelsius: normalized,
    })
    if (ok) {
      closeTemperatureKeyboard()
    }
  }

  async function handleHeatingPresetApply(nozzle: number, bed: number): Promise<void> {
    const ok = await executeCommand({ command: 'setHeatingTargets', nozzleCelsius: nozzle, bedCelsius: bed })
    if (ok) {
      closeTemperatureKeyboard()
    }
  }

  async function handleHeatingDisable(): Promise<void> {
    const ok = await executeCommand({ command: 'turnOffHeaters' })
    if (ok) {
      closeTemperatureKeyboard()
    }
  }

  function handleFanPercentChange(nextValue: number): void {
    const normalized = Math.round(clampHeatingValue(nextValue, 0, 100))
    void executeCommand({ command: 'setFanPercent', percent: normalized })
  }

  function renderTemperatureKeyboardPanel(className = ''): ReactNode {
    return (
      <aside className={`print-temp-keyboard-side ${className}`.trim()} aria-label="Цифровая клавиатура температуры">
        <div className="print-temp-keyboard-head">
          <p className="print-temp-keyboard-label">Температура</p>
          <button
            type="button"
            className="print-cancel-modal-close print-temp-keyboard-close"
            aria-label="Закрыть клавиатуру температуры"
            onClick={closeTemperatureKeyboard}
          >
            ×
          </button>
        </div>
        <p className="print-temp-keyboard-display">
          {temperatureKeyboardValue}
          {temperatureKeyboardValue.length > 0 ? <span> °C</span> : null}
        </p>
        <div className="print-temp-keyboard-grid">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              className="settings-network-btn print-temp-keyboard-key"
              onClick={() => handleTemperatureKeyboardDigit(digit)}
              aria-label={`Цифра ${digit}`}
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            className="settings-network-btn print-temp-keyboard-key"
            onClick={handleTemperatureKeyboardBackspace}
          >
            Стереть
          </button>
          <button
            type="button"
            className="settings-network-btn print-temp-keyboard-key"
            onClick={() => handleTemperatureKeyboardDigit('0')}
            aria-label="Цифра 0"
          >
            0
          </button>
          <span className="print-temp-keyboard-spacer" aria-hidden="true" />
        </div>
        <button
          type="button"
          className="settings-network-btn settings-network-btn-primary print-temp-keyboard-submit"
          onClick={handleTemperatureKeyboardSubmit}
        >
          Ввод
        </button>
      </aside>
    )
  }

  const heatingProps: HeatingControlPanelProps = {
    rows: heatingControlRows,
    chartSeries: temperatureChartSeries,
    temperatureKeyboardTarget,
    temperatureKeyboardValue,
    printNozzleTargetTemp,
    printBedTargetTemp,
    commandBlockReasons: heatingCommandBlockReasons,
    renderTemperatureKeyboardPanel,
    onTemperatureKeyboardOpen: openTemperatureKeyboard,
    onHeatingPresetApply: handleHeatingPresetApply,
    onHeatingDisable: handleHeatingDisable,
  }

  const fanProps: FanControlPanelProps = {
    printFanPercent,
    isBusy,
    commandBlockReason: fanCommandBlockReason,
    onFanPercentChange: handleFanPercentChange,
  }

  const printTuneTemperatureProps: PrintTuneModalProps['temperature'] = {
    currentNozzleTemp: snapshot.extruderTemp,
    currentBedTemp: snapshot.bedTemp,
    nozzleTargetTemp: printNozzleTargetTemp,
    bedTargetTemp: printBedTargetTemp,
    chartMode: temperatureChartMode,
    chartSeries: temperatureChartSeries,
    keyboardTarget: temperatureKeyboardTarget,
    keyboardValue: temperatureKeyboardValue,
    renderKeyboardPanel: renderTemperatureKeyboardPanel,
    onKeyboardOpen: openTemperatureKeyboard,
    onChartModeChange: setTemperatureChartMode,
    onNozzleTargetChange: handleNozzleTargetChange,
    onBedTargetChange: handleBedTargetChange,
  }

  return {
    printNozzleTargetTemp,
    printBedTargetTemp,
    printFanPercent,
    dashboardTemperatureTargets,
    temperatureChartSeries,
    heatingProps,
    fanProps,
    printTuneTemperatureProps,
    temperatureChartMode,
    setTemperatureChartMode,
    handleTemperatureKeyboardDigit,
    handleTemperatureKeyboardBackspace,
    handleTemperatureKeyboardSubmit,
    openTemperatureKeyboard,
    closeTemperatureKeyboard,
    handleFanPercentChange,
  }
}

function clampHeatingValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isTemperatureSnapshotConnected(snapshot: HeatingSnapshot): boolean {
  return snapshot.connection === undefined || snapshot.connection === 'online' || snapshot.connection === 'degraded'
}

function createTemperatureHistoryPoint(snapshot: HeatingSnapshot): TemperatureHistoryPoint {
  return {
    nozzle: snapshot.extruderTemp,
    bed: snapshot.bedTemp,
  }
}
