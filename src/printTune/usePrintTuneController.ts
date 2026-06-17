import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  DASHBOARD_VALUES,
  PROCESS_METRIC_DEFINITIONS,
  QUICK_METRIC_DEFINITIONS,
} from '../dashboard/config'
import type { PrinterRuntimeTuneSnapshot } from '../core/transport/types'
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
  runtimeTune: PrinterRuntimeTuneSnapshot
  onPrintSpeedFactorPercentChange: (value: number) => void
  onPrintFlowFactorPercentChange: (value: number) => void
  onPrintAccelChange: (value: number) => void
  onPressureAdvanceChange: (value: number) => void
  onRetractionLengthChange: (value: number) => void
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
  runtimeTune,
  onPrintSpeedFactorPercentChange,
  onPrintFlowFactorPercentChange,
  onPrintAccelChange,
  onPressureAdvanceChange,
  onRetractionLengthChange,
}: UsePrintTuneControllerArgs): UsePrintTuneControllerResult {
  const [activeGroup, setActiveGroup] = useState<PrintTuneGroupId | null>(null)
  const [flowPercent, setFlowPercent] = useState<number>(runtimeTune.flowFactorPercent)
  const [speedFactorPercent, setSpeedFactorPercent] = useState<number>(runtimeTune.speedFactorPercent)
  const [accelMmS2, setAccelMmS2] = useState<number>(runtimeTune.accelMmS2)
  const [kFactor, setKFactor] = useState<number>(runtimeTune.pressureAdvance)
  const [retractMm, setRetractMm] = useState<number>(runtimeTune.retractLengthMm)
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

  const createQuickMetrics = useCallback((fanPercent: number): QuickMetric[] => {
    const valueByKey = {
      fan: fanPercent,
      flow: flowPercent,
    } as const

    return QUICK_METRIC_DEFINITIONS.map((definition) => ({
      ...definition,
      value: valueByKey[definition.key],
    }))
  }, [flowPercent])

  const processMetrics = useMemo<ProcessMetric[]>(() => {
    const valueByKey = {
      speed: speedFactorPercent,
      accel: accelMmS2,
      kFactor,
      retract: retractMm,
    } as const

    return PROCESS_METRIC_DEFINITIONS.map((definition) => ({
      ...definition,
      value: valueByKey[definition.key],
    }))
  }, [accelMmS2, kFactor, retractMm, speedFactorPercent])

  const setKeyboardTargetValue = useCallback((target: PrintTuneNumericKeyboardTarget, value: number): void => {
    if (target === 'flow') {
      const nextValue = Math.round(value)
      setFlowPercent(nextValue)
      onPrintFlowFactorPercentChange(nextValue)
      return
    }
    if (target === 'speed') {
      const nextValue = Math.round(value)
      setSpeedFactorPercent(nextValue)
      onPrintSpeedFactorPercentChange(nextValue)
      return
    }
    if (target === 'accel') {
      const nextValue = Math.round(value)
      setAccelMmS2(nextValue)
      onPrintAccelChange(nextValue)
      return
    }
    if (target === 'kFactor') {
      setKFactor(value)
      onPressureAdvanceChange(value)
      return
    }

    setRetractMm(value)
    onRetractionLengthChange(value)
  }, [
    onPressureAdvanceChange,
    onPrintAccelChange,
    onPrintFlowFactorPercentChange,
    onPrintSpeedFactorPercentChange,
    onRetractionLengthChange,
  ])

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
  }: CreateModalValuesArgs): PrintTuneModalProps['values'] => ({
    fanPercent,
    flowPercent,
    speedFactorPercent,
    accelMmS2,
    kFactor,
    retractMm,
  }), [
    accelMmS2,
    flowPercent,
    kFactor,
    retractMm,
    speedFactorPercent,
  ])

  const createModalHandlers = useCallback(({
    onFanPercentChange,
  }: CreateModalHandlersArgs): PrintTuneModalProps['handlers'] => ({
    onFanPercentChange,
    onFlowPercentChange: (nextValue) => {
      const normalized = Math.round(nextValue)
      setFlowPercent(normalized)
      onPrintFlowFactorPercentChange(normalized)
    },
    onSpeedFactorChange: (nextValue) => {
      const normalized = Math.round(nextValue)
      setSpeedFactorPercent(normalized)
      onPrintSpeedFactorPercentChange(normalized)
    },
    onAccelChange: (nextValue) => {
      const normalized = Math.round(nextValue)
      setAccelMmS2(normalized)
      onPrintAccelChange(normalized)
    },
    onKFactorChange: (nextValue) => {
      setKFactor(nextValue)
      onPressureAdvanceChange(nextValue)
    },
    onRetractChange: (nextValue) => {
      setRetractMm(nextValue)
      onRetractionLengthChange(nextValue)
    },
  }), [
    onPressureAdvanceChange,
    onPrintAccelChange,
    onPrintFlowFactorPercentChange,
    onPrintSpeedFactorPercentChange,
    onRetractionLengthChange,
  ])

  useEffect(() => {
    if (!hasActivePrint) {
      setActiveGroup(null)
    }
  }, [hasActivePrint])

  useEffect(() => {
    setFlowPercent(runtimeTune.flowFactorPercent)
    setSpeedFactorPercent(runtimeTune.speedFactorPercent)
    setAccelMmS2(runtimeTune.accelMmS2)
    setKFactor(runtimeTune.pressureAdvance)
    setRetractMm(runtimeTune.retractLengthMm)
  }, [
    runtimeTune.accelMmS2,
    runtimeTune.flowFactorPercent,
    runtimeTune.pressureAdvance,
    runtimeTune.retractLengthMm,
    runtimeTune.speedFactorPercent,
  ])

  return {
    activeGroup,
    openGroup,
    closeGroup,
    applyGroup,
    closeKeyboard,
    keyboard,
    createQuickMetrics,
    processMetrics,
    adjustedEtaTime: DASHBOARD_VALUES.etaTime,
    createModalValues,
    createModalHandlers,
  }
}
