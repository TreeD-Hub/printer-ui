import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  DASHBOARD_VALUES,
  PROCESS_METRIC_DEFINITIONS,
  QUICK_METRIC_DEFINITIONS,
} from '../dashboard/config'
import type { PrintTuneModalProps } from './PrintTuneModal'
import {
  appendPrintTuneKeyboardDecimal,
  appendPrintTuneKeyboardDigit,
  normalizePrintTuneKeyboardValue,
  resolvePrintTuneKeyboardMeta,
  type PrintTuneGroupId,
  type PrintTuneNumericKeyboardTarget,
} from './printTuneKeyboard'

type UsePrintTuneControllerArgs = {
  hasActivePrint: boolean
}

type QuickMetric = {
  key: (typeof QUICK_METRIC_DEFINITIONS)[number]['key']
  label: string
  unit: string
  value: number
  valueClassName: (typeof QUICK_METRIC_DEFINITIONS)[number]['valueClassName']
}

type ProcessMetric = {
  key: (typeof PROCESS_METRIC_DEFINITIONS)[number]['key']
  label: string
  unit?: string
  value: number
}

type CreateModalValuesArgs = {
  fanPercent: number
  printFill: number
  displayLayerCurrent: number
  displayLayerTotal: number
}

type CreateModalHandlersArgs = {
  onFanPercentChange: (value: number) => void
}

export type UsePrintTuneControllerResult = {
  activeGroup: PrintTuneGroupId | null
  openGroup: (groupId: PrintTuneGroupId) => void
  closeGroup: () => void
  applyGroup: () => void
  closeKeyboard: () => void
  keyboard: PrintTuneModalProps['keyboard']
  createQuickMetrics: (fanPercent: number) => QuickMetric[]
  processMetrics: ProcessMetric[]
  adjustedEtaTime: string
  createModalValues: (args: CreateModalValuesArgs) => PrintTuneModalProps['values']
  createModalHandlers: (args: CreateModalHandlersArgs) => PrintTuneModalProps['handlers']
}

export function usePrintTuneController({
  hasActivePrint,
}: UsePrintTuneControllerArgs): UsePrintTuneControllerResult {
  const [activeGroup, setActiveGroup] = useState<PrintTuneGroupId | null>(null)
  const [volumetricFlowMm3S, setVolumetricFlowMm3S] = useState<number>(DASHBOARD_VALUES.volumetricFlowMm3S)
  const [flowPercent, setFlowPercent] = useState<number>(DASHBOARD_VALUES.flowPercent)
  const [speedMmS, setSpeedMmS] = useState<number>(DASHBOARD_VALUES.speedMmS)
  const [accelMmS2, setAccelMmS2] = useState<number>(DASHBOARD_VALUES.accelMmS2)
  const [kFactor, setKFactor] = useState<number>(DASHBOARD_VALUES.kFactorLaPa)
  const [retractMm, setRetractMm] = useState<number>(DASHBOARD_VALUES.retractMm)
  const [progressOffsetMin, setProgressOffsetMin] = useState<number>(0)
  const [pauseAtLayer, setPauseAtLayer] = useState<number>(Math.max(1, DASHBOARD_VALUES.layerCurrent + 5))
  const [keyboardTarget, setKeyboardTarget] = useState<PrintTuneNumericKeyboardTarget | null>(null)
  const [keyboardValue, setKeyboardValue] = useState<string>('')

  const closeKeyboard = useCallback((): void => {
    setKeyboardTarget(null)
    setKeyboardValue('')
  }, [])

  const openGroup = useCallback((groupId: PrintTuneGroupId): void => {
    setActiveGroup(groupId)
    closeKeyboard()
  }, [closeKeyboard])

  const closeGroup = useCallback((): void => {
    setActiveGroup(null)
    closeKeyboard()
  }, [closeKeyboard])

  const applyGroup = closeGroup

  const adjustedEtaTime = useMemo(
    () => shiftTimeLabelByMinutes(DASHBOARD_VALUES.etaTime, progressOffsetMin),
    [progressOffsetMin],
  )

  const createQuickMetrics = useCallback((fanPercent: number): QuickMetric[] => {
    const valueByKey = {
      volumetricFlow: volumetricFlowMm3S,
      fan: fanPercent,
      flow: flowPercent,
    } as const

    return QUICK_METRIC_DEFINITIONS.map((definition) => ({
      ...definition,
      value: valueByKey[definition.key],
    }))
  }, [flowPercent, volumetricFlowMm3S])

  const processMetrics = useMemo<ProcessMetric[]>(() => {
    const valueByKey = {
      speed: speedMmS,
      accel: accelMmS2,
      kFactor,
      retract: retractMm,
    } as const

    return PROCESS_METRIC_DEFINITIONS.map((definition) => ({
      ...definition,
      value: valueByKey[definition.key],
    }))
  }, [accelMmS2, kFactor, retractMm, speedMmS])

  const setKeyboardTargetValue = useCallback((target: PrintTuneNumericKeyboardTarget, value: number): void => {
    if (target === 'volumetricFlow') {
      setVolumetricFlowMm3S(value)
      return
    }
    if (target === 'flow') {
      setFlowPercent(value)
      return
    }
    if (target === 'speed') {
      setSpeedMmS(value)
      return
    }
    if (target === 'accel') {
      setAccelMmS2(value)
      return
    }
    if (target === 'kFactor') {
      setKFactor(value)
      return
    }
    if (target === 'retract') {
      setRetractMm(value)
      return
    }

    setPauseAtLayer(Math.round(clampValue(value, 1, DASHBOARD_VALUES.layerTotal)))
  }, [])

  const openKeyboard = useCallback((target: PrintTuneNumericKeyboardTarget): void => {
    setKeyboardTarget(target)
    setKeyboardValue('')
  }, [])

  const handleKeyboardDigit = useCallback((digit: string): void => {
    setKeyboardValue((currentValue) => appendPrintTuneKeyboardDigit(currentValue, digit))
  }, [])

  const handleKeyboardDecimal = useCallback((): void => {
    if (keyboardTarget === null) {
      return
    }

    const { allowDecimal } = resolvePrintTuneKeyboardMeta(keyboardTarget)
    if (!allowDecimal) {
      return
    }

    setKeyboardValue((currentValue) => appendPrintTuneKeyboardDecimal(currentValue, allowDecimal))
  }, [keyboardTarget])

  const handleKeyboardBackspace = useCallback((): void => {
    setKeyboardValue((currentValue) => currentValue.slice(0, -1))
  }, [])

  const handleKeyboardSubmit = useCallback((): void => {
    if (keyboardTarget === null) {
      return
    }

    if (keyboardValue.trim().length === 0) {
      return
    }

    const normalized = normalizePrintTuneKeyboardValue(
      keyboardValue,
      resolvePrintTuneKeyboardMeta(keyboardTarget),
    )
    if (normalized === null) {
      return
    }

    setKeyboardTargetValue(keyboardTarget, normalized)
    closeKeyboard()
  }, [closeKeyboard, keyboardTarget, keyboardValue, setKeyboardTargetValue])

  const keyboard = useMemo<PrintTuneModalProps['keyboard']>(() => ({
    target: keyboardTarget,
    value: keyboardValue,
    onOpen: openKeyboard,
    onClose: closeKeyboard,
    onDigit: handleKeyboardDigit,
    onDecimal: handleKeyboardDecimal,
    onBackspace: handleKeyboardBackspace,
    onSubmit: handleKeyboardSubmit,
  }), [
    closeKeyboard,
    handleKeyboardBackspace,
    handleKeyboardDecimal,
    handleKeyboardDigit,
    handleKeyboardSubmit,
    keyboardTarget,
    keyboardValue,
    openKeyboard,
  ])

  const createModalValues = useCallback(({
    fanPercent,
    printFill,
    displayLayerCurrent,
    displayLayerTotal,
  }: CreateModalValuesArgs): PrintTuneModalProps['values'] => ({
    volumetricFlowMm3S,
    fanPercent,
    flowPercent,
    speedMmS,
    accelMmS2,
    kFactor,
    retractMm,
    progressOffsetMin,
    pauseAtLayer,
    printFill,
    adjustedEtaTime,
    displayLayerCurrent,
    displayLayerTotal,
  }), [
    accelMmS2,
    adjustedEtaTime,
    flowPercent,
    kFactor,
    pauseAtLayer,
    progressOffsetMin,
    retractMm,
    speedMmS,
    volumetricFlowMm3S,
  ])

  const createModalHandlers = useCallback(({
    onFanPercentChange,
  }: CreateModalHandlersArgs): PrintTuneModalProps['handlers'] => ({
    onVolumetricFlowChange: setVolumetricFlowMm3S,
    onFanPercentChange,
    onFlowPercentChange: (nextValue) => setFlowPercent(Math.round(nextValue)),
    onSpeedChange: setSpeedMmS,
    onAccelChange: setAccelMmS2,
    onKFactorChange: setKFactor,
    onRetractChange: setRetractMm,
    onProgressOffsetChange: setProgressOffsetMin,
  }), [])

  useEffect(() => {
    if (!hasActivePrint) {
      setActiveGroup(null)
    }
  }, [hasActivePrint])

  return {
    activeGroup,
    openGroup,
    closeGroup,
    applyGroup,
    closeKeyboard,
    keyboard,
    createQuickMetrics,
    processMetrics,
    adjustedEtaTime,
    createModalValues,
    createModalHandlers,
  }
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function shiftTimeLabelByMinutes(timeLabel: string, offsetMinutes: number): string {
  const parts = timeLabel.split(':')
  if (parts.length !== 2) {
    return timeLabel
  }

  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return timeLabel
  }

  const sourceDate = new Date()
  sourceDate.setHours(hours, minutes, 0, 0)
  sourceDate.setMinutes(sourceDate.getMinutes() + Math.round(offsetMinutes))

  const nextHours = String(sourceDate.getHours()).padStart(2, '0')
  const nextMinutes = String(sourceDate.getMinutes()).padStart(2, '0')
  return `${nextHours}:${nextMinutes}`
}
