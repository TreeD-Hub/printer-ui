import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getPrinterFileNameFromPath,
  normalizePrinterFilePath,
} from '@treed/printer-logic'

import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type { PrinterSnapshot } from '../core/transport/types'
import { DASHBOARD_VALUES } from '../dashboard/config'
import { statusLabel } from '../dashboard/helpers'
import { PRINT_FILE_LIBRARY, type PrintFileItem } from '../printFiles'

type ActivePrintUiState = 'printing' | 'paused'
const DASHBOARD_FILE_NAME_VISIBLE_CHARS = 20

type CommandRuntimePrintJob = {
  filename?: string
  state: string
  isActive: boolean
  isPaused: boolean
}

type UsePrintSessionControllerArgs = {
  snapshot: PrinterSnapshot
  deletePrintFile?: (path: string) => Promise<void>
}

type CreateCommandHandlersArgs = {
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  getLastCommandError: () => string
  commandError: string
  printStartBlockReason: string | null
  printCancelBlockReason: string | null
  requiresCommandConfirmation: (command: PrinterCommandId) => boolean
  refresh: () => Promise<void>
  onOpenDashboard: () => void
}

type PrintSessionCommandHandlers = {
  startSelectedFile: () => Promise<boolean>
  togglePause: () => Promise<boolean>
  requestStop: () => Promise<boolean>
  confirmStop: () => Promise<boolean>
}

export type UsePrintSessionControllerResult = {
  files: PrintFileItem[]
  activePrintFile: PrintFileItem | null
  selectedPrintFile: PrintFileItem | null
  displayPrintFileName: string | null
  displayPrintFileNameScrollDistanceCh: number
  isDisplayPrintFileNameScrollable: boolean
  adjustedEtaTime: string
  activePrintUiState: ActivePrintUiState | null
  effectiveActivePrintState: string
  hasActivePrint: boolean
  isPrintPaused: boolean
  printPauseCommand: Extract<PrinterCommandId, 'pause' | 'resume'>
  printFill: number
  displayLayerCurrent: number
  displayLayerTotal: number
  commandRuntimePrintJob: CommandRuntimePrintJob
  isPrintCancelConfirmOpen: boolean
  selectFile: (fileId: string) => void
  closeFileModal: () => void
  deleteSelectedFile: () => Promise<boolean>
  closePrintCancelConfirm: () => void
  getFileStartNotice: (printStartBlockReason: string | null) => string
  createCommandHandlers: (args: CreateCommandHandlersArgs) => PrintSessionCommandHandlers
}

export function usePrintSessionController({
  snapshot,
  deletePrintFile,
}: UsePrintSessionControllerArgs): UsePrintSessionControllerResult {
  const [filesLibrary, setFilesLibrary] = useState<PrintFileItem[]>(() => [...PRINT_FILE_LIBRARY])
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [fileModalNotice, setFileModalNotice] = useState<string>('')
  const [activePrintFileName, setActivePrintFileName] = useState<string | null>(null)
  const [mockActivePrintFile, setMockActivePrintFile] = useState<PrintFileItem | null>(null)
  const [activePrintUiState, setActivePrintUiState] = useState<ActivePrintUiState | null>(null)
  const [isPrintCancelConfirmOpen, setIsPrintCancelConfirmOpen] = useState<boolean>(false)

  const files = snapshot.source === 'live' ? snapshot.printFiles : filesLibrary
  const selectedPrintFile = useMemo(() => {
    if (selectedFileId === null) {
      return null
    }

    return files.find((item) => item.id === selectedFileId) ?? null
  }, [files, selectedFileId])

  const liveActivePrintFile = useMemo(() => {
    if (snapshot.source !== 'live' || !snapshot.printJob.isActive) {
      return null
    }

    return findActivePrintFile(files, snapshot.printJob.filePath, snapshot.printJob.filename)
  }, [files, snapshot.printJob.filePath, snapshot.printJob.filename, snapshot.printJob.isActive, snapshot.source])
  const activePrintFile = snapshot.source === 'live' ? liveActivePrintFile : mockActivePrintFile
  const displayPrintFileName = snapshot.source === 'live' && snapshot.printJob.isActive
    ? (activePrintFile?.name ?? getPrinterFileNameFromPath(snapshot.printJob.filePath ?? snapshot.printJob.filename))
    : activePrintFileName
  const hasActivePrint = displayPrintFileName !== null
  const displayPrintFileNameScrollDistanceCh = Math.max(
    0,
    (displayPrintFileName?.length ?? 0) - DASHBOARD_FILE_NAME_VISIBLE_CHARS,
  )
  const isDisplayPrintFileNameScrollable = displayPrintFileNameScrollDistanceCh > 0
  const printFill = snapshot.source === 'live'
    ? Math.round(clampValue(snapshot.printJob.progress * 100, 0, 100))
    : Math.max(0, Math.min(100, DASHBOARD_VALUES.progressPercent))
  const adjustedEtaTime = getPrintEndTime(snapshot.updatedAt, activePrintFile, printFill)
  const displayLayerCurrent = snapshot.source === 'live'
    ? (snapshot.printJob.currentLayer ?? DASHBOARD_VALUES.layerCurrent)
    : DASHBOARD_VALUES.layerCurrent
  const displayLayerTotal = snapshot.source === 'live'
    ? (snapshot.printJob.totalLayer ?? DASHBOARD_VALUES.layerTotal)
    : DASHBOARD_VALUES.layerTotal
  const effectiveActivePrintState = snapshot.source === 'live'
    ? snapshot.printJob.state
    : hasActivePrint
      ? (activePrintUiState ?? snapshot.state)
      : snapshot.state
  const isPrintPaused = hasActivePrint && statusLabel(effectiveActivePrintState) === 'Пауза'
  const printPauseCommand: Extract<PrinterCommandId, 'pause' | 'resume'> = isPrintPaused ? 'resume' : 'pause'

  const commandRuntimePrintJob = useMemo<CommandRuntimePrintJob>(() => (
    snapshot.source === 'live'
      ? {
          state: snapshot.printJob.state,
          filename: snapshot.printJob.filename,
          isActive: snapshot.printJob.isActive,
          isPaused: snapshot.printJob.isPaused,
        }
      : {
          state: activePrintUiState ??
            (activePrintFileName === null ? snapshot.printJob.state : 'printing'),
          filename: activePrintFileName ?? snapshot.printJob.filename,
          isActive: activePrintFileName !== null,
          isPaused: activePrintUiState === 'paused',
        }
  ), [
    activePrintFileName,
    activePrintUiState,
    snapshot.printJob.isActive,
    snapshot.printJob.filename,
    snapshot.printJob.isPaused,
    snapshot.printJob.state,
    snapshot.source,
  ])

  const closeFileModal = useCallback((): void => {
    setSelectedFileId(null)
    setFileModalNotice('')
  }, [])

  const selectFile = useCallback((fileId: string): void => {
    setSelectedFileId(fileId)
    setFileModalNotice('')
  }, [])

  const closePrintCancelConfirm = useCallback((): void => {
    setIsPrintCancelConfirmOpen(false)
  }, [])

  const deleteSelectedFile = useCallback(async (): Promise<boolean> => {
    if (selectedPrintFile === null) {
      return false
    }

    if (snapshot.source === 'live') {
      if (deletePrintFile === undefined) {
        setFileModalNotice('Удаление файлов недоступно в текущем runtime.')
        return false
      }

      try {
        await deletePrintFile(selectedPrintFile.path)
      } catch (error) {
        setFileModalNotice(error instanceof Error ? error.message : 'Не удалось удалить файл.')
        return false
      }
    } else {
      setFilesLibrary((currentItems) => currentItems.filter((item) => item.id !== selectedPrintFile.id))
    }
    if (displayPrintFileName === selectedPrintFile.name || displayPrintFileName === selectedPrintFile.path) {
      setActivePrintFileName(null)
      setMockActivePrintFile(null)
      setActivePrintUiState(null)
    }
    closeFileModal()
    return true
  }, [closeFileModal, deletePrintFile, displayPrintFileName, selectedPrintFile, snapshot.source])

  const getFileStartNotice = useCallback((printStartBlockReason: string | null): string => (
    fileModalNotice || printStartBlockReason || ''
  ), [fileModalNotice])

  const createCommandHandlers = useCallback(({
    executeCommand,
    getLastCommandError,
    commandError,
    printStartBlockReason,
    printCancelBlockReason,
    requiresCommandConfirmation,
    refresh,
    onOpenDashboard,
  }: CreateCommandHandlersArgs): PrintSessionCommandHandlers => {
    async function startSelectedFile(): Promise<boolean> {
      if (selectedPrintFile === null) {
        return false
      }

      const ok = await executeCommand({
        command: 'start',
        filename: selectedPrintFile.path,
      })
      if (!ok) {
        setFileModalNotice(
          getLastCommandError() ||
          commandError ||
          printStartBlockReason ||
          'Старт печати не выполнен.',
        )
        return false
      }

      if (snapshot.source === 'mock') {
        setActivePrintFileName(selectedPrintFile.name)
        setMockActivePrintFile(selectedPrintFile)
        setActivePrintUiState('printing')
      }

      await refresh()
      onOpenDashboard()
      closeFileModal()
      return true
    }

    async function togglePause(): Promise<boolean> {
      const ok = await executeCommand({ command: printPauseCommand })
      if (ok) {
        setActivePrintUiState(isPrintPaused ? 'printing' : 'paused')
        await refresh()
      }

      return ok
    }

    async function confirmStop(): Promise<boolean> {
      const ok = await executeCommand({ command: 'cancel' })
      if (ok) {
        setActivePrintFileName(null)
        setMockActivePrintFile(null)
        setActivePrintUiState(null)
        await refresh()
        onOpenDashboard()
        closePrintCancelConfirm()
      }

      return ok
    }

    async function requestStop(): Promise<boolean> {
      if (printCancelBlockReason !== null) {
        return false
      }

      if (requiresCommandConfirmation('cancel')) {
        setIsPrintCancelConfirmOpen(true)
        return false
      }

      return confirmStop()
    }

    return {
      startSelectedFile,
      togglePause,
      requestStop,
      confirmStop,
    }
  }, [
    closeFileModal,
    closePrintCancelConfirm,
    isPrintPaused,
    printPauseCommand,
    selectedPrintFile,
    snapshot.source,
  ])

  useEffect(() => {
    if (!hasActivePrint || activePrintUiState === null) {
      return
    }

    if (snapshot.state.toLowerCase() === activePrintUiState) {
      setActivePrintUiState(null)
    }
  }, [activePrintUiState, hasActivePrint, snapshot.state])

  return {
    files,
    activePrintFile,
    selectedPrintFile,
    displayPrintFileName,
    displayPrintFileNameScrollDistanceCh,
    isDisplayPrintFileNameScrollable,
    adjustedEtaTime,
    activePrintUiState,
    effectiveActivePrintState,
    hasActivePrint,
    isPrintPaused,
    printPauseCommand,
    printFill,
    displayLayerCurrent,
    displayLayerTotal,
    commandRuntimePrintJob,
    isPrintCancelConfirmOpen,
    selectFile,
    closeFileModal,
    deleteSelectedFile,
    closePrintCancelConfirm,
    getFileStartNotice,
    createCommandHandlers,
  }
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function findActivePrintFile(
  files: readonly PrintFileItem[],
  filePath: string | null,
  filename: string,
): PrintFileItem | null {
  const normalizedCandidates = [filePath, filename]
    .filter((value): value is string => value !== null && value.trim().length > 0)
    .map((value) => normalizePrinterFilePath(value))

  if (normalizedCandidates.length === 0) {
    return null
  }

  return files.find((item) => {
    const itemPath = normalizePrinterFilePath(item.path)
    const itemName = normalizePrinterFilePath(item.name)

    return normalizedCandidates.some((candidate) => (
      candidate === itemPath ||
      candidate === itemName ||
      getPrinterFileNameFromPath(candidate) === item.name
    ))
  }) ?? null
}

function parsePrintTimeSeconds(printTime: string | undefined): number | null {
  if (printTime === undefined) {
    return null
  }

  const hoursMatch = /(\d+)\s*ч/i.exec(printTime)
  const minutesMatch = /(\d+)\s*мин/i.exec(printTime)
  const hours = hoursMatch === null ? 0 : Number(hoursMatch[1])
  const minutes = minutesMatch === null ? 0 : Number(minutesMatch[1])
  const seconds = ((hours * 60) + minutes) * 60

  return seconds > 0 ? seconds : null
}

function getPrintEndTime(updatedAt: string, activePrintFile: PrintFileItem | null, printFill: number): string {
  const totalSeconds = parsePrintTimeSeconds(activePrintFile?.printTime)
  if (totalSeconds === null) {
    return '—'
  }

  const baseTimeMs = Date.parse(updatedAt)
  if (Number.isNaN(baseTimeMs)) {
    return '—'
  }

  const remainingRatio = 1 - (clampValue(printFill, 0, 100) / 100)
  const endTime = new Date(baseTimeMs + Math.round(totalSeconds * remainingRatio * 1000))
  const hours = String(endTime.getHours()).padStart(2, '0')
  const minutes = String(endTime.getMinutes()).padStart(2, '0')

  return `${hours}:${minutes}`
}
