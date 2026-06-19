import { type ReactNode, useEffect, useMemo, useState } from 'react'

import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
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
  extruderTemp: number
  bedTemp: number
  modelFanPercent: number
  thermalTargets: {
    nozzle: number
    bed: number
  }
}

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
  setPrintNozzleTargetTemp: (value: number) => void
  setPrintBedTargetTemp: (value: number) => void
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
  const [printNozzleTargetTemp, setPrintNozzleTargetTemp] = useState<number>(snapshot.thermalTargets.nozzle)
  const [printBedTargetTemp, setPrintBedTargetTemp] = useState<number>(snapshot.thermalTargets.bed)
  const [printFanPercent, setPrintFanPercent] = useState<number>(Math.round(snapshot.modelFanPercent))
  const [temperatureChartMode, setTemperatureChartMode] = useState<TemperatureChartMode>('both')
  const [temperatureKeyboardTarget, setTemperatureKeyboardTarget] = useState<TemperatureKeyboardTarget | null>(null)
  const [temperatureKeyboardValue, setTemperatureKeyboardValue] = useState<string>('')

  const dashboardTemperatureTargets = useMemo(
    () => ({
      nozzle: printNozzleTargetTemp,
      bed: printBedTargetTemp,
    }),
    [printBedTargetTemp, printNozzleTargetTemp],
  )

  const heatingCommandBlockReasons = useMemo<HeatingCommandBlockReasons>(() => ({
    nozzleTarget: getCommandBlockReason('setNozzleTarget'),
    bedTarget: getCommandBlockReason('setBedTarget'),
    turnOffHeaters: getCommandBlockReason('turnOffHeaters'),
  }), [getCommandBlockReason])
  const fanCommandBlockReason = getCommandBlockReason('setFanPercent')

  useEffect(() => {
    setPrintNozzleTargetTemp(snapshot.thermalTargets.nozzle)
  }, [snapshot.thermalTargets.nozzle])

  useEffect(() => {
    setPrintBedTargetTemp(snapshot.thermalTargets.bed)
  }, [snapshot.thermalTargets.bed])

  const nozzleTrendValues = useMemo(
    () => Array.from({ length: 24 }, (_, index) => {
      const ratio = (index + 1) / 24
      const wave = Math.sin((index / 4.2) + 0.7) * 2.2
      const projected = snapshot.extruderTemp + ((printNozzleTargetTemp - snapshot.extruderTemp) * ratio)
      return clampHeatingValue(projected + wave, 0, Math.max(printNozzleTargetTemp + 8, 230))
    }),
    [printNozzleTargetTemp, snapshot.extruderTemp],
  )
  const bedTrendValues = useMemo(
    () => Array.from({ length: 24 }, (_, index) => {
      const ratio = (index + 1) / 24
      const wave = Math.cos((index / 5.1) + 0.4) * 1.6
      const projected = snapshot.bedTemp + ((printBedTargetTemp - snapshot.bedTemp) * ratio)
      return clampHeatingValue(projected + wave, 0, Math.max(printBedTargetTemp + 6, 90))
    }),
    [printBedTargetTemp, snapshot.bedTemp],
  )
  const temperatureChartSeries = useMemo<TemperatureChartSeries[]>(
    () => [
      {
        id: 'nozzle',
        label: 'Сопло',
        tone: 'orange',
        values: nozzleTrendValues,
        target: printNozzleTargetTemp,
      },
      {
        id: 'bed',
        label: 'Стол',
        tone: 'green',
        values: bedTrendValues,
        target: printBedTargetTemp,
      },
    ],
    [bedTrendValues, nozzleTrendValues, printBedTargetTemp, printNozzleTargetTemp],
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

  function setTemperatureTargetValue(target: TemperatureKeyboardTarget, value: number): void {
    if (target === 'nozzle') {
      setPrintNozzleTargetTemp(value)
      return
    }

    setPrintBedTargetTemp(value)
  }

  function handleNozzleTargetChange(value: number): void {
    const normalized = Math.round(clampHeatingValue(value, 0, 300))
    setPrintNozzleTargetTemp(normalized)
    void executeCommand({ command: 'setNozzleTarget', targetCelsius: normalized })
  }

  function handleBedTargetChange(value: number): void {
    const normalized = Math.round(clampHeatingValue(value, 0, 300))
    setPrintBedTargetTemp(normalized)
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

  function handleTemperatureKeyboardSubmit(): void {
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

    const normalized = Math.round(clampHeatingValue(parsed, 0, 300))
    setTemperatureTargetValue(temperatureKeyboardTarget, normalized)
    void executeCommand({
      command: temperatureKeyboardTarget === 'nozzle' ? 'setNozzleTarget' : 'setBedTarget',
      targetCelsius: normalized,
    })
    closeTemperatureKeyboard()
  }

  function handleHeatingPresetApply(nozzle: number, bed: number): void {
    setPrintNozzleTargetTemp(nozzle)
    setPrintBedTargetTemp(bed)
    void executeCommand({ command: 'setHeatingTargets', nozzleCelsius: nozzle, bedCelsius: bed })
    closeTemperatureKeyboard()
  }

  function handleHeatingDisable(): void {
    setPrintNozzleTargetTemp(0)
    setPrintBedTargetTemp(0)
    void executeCommand({ command: 'turnOffHeaters' })
    closeTemperatureKeyboard()
  }

  function handleFanPercentChange(nextValue: number): void {
    const normalized = Math.round(clampHeatingValue(nextValue, 0, 100))
    setPrintFanPercent(normalized)
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
    setPrintNozzleTargetTemp,
    setPrintBedTargetTemp,
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
