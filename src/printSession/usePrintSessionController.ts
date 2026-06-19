import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type { PrinterSnapshot } from '../core/transport/types'
import { DASHBOARD_VALUES } from '../dashboard/config'
import { statusLabel } from '../dashboard/helpers'
import { PRINT_FILE_LIBRARY, type PrintFileItem } from '../printFiles'

type ActivePrintUiState = 'printing' | 'paused'

type CommandRuntimePrintJob = {
  state: string
  isActive: boolean
  isPaused: boolean
}

type UsePrintSessionControllerArgs = {
  snapshot: PrinterSnapshot
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
  selectedPrintFile: PrintFileItem | null
  displayPrintFileName: string | null
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
  deleteSelectedFile: () => void
  closePrintCancelConfirm: () => void
  getFileStartNotice: (printStartBlockReason: string | null) => string
  createCommandHandlers: (args: CreateCommandHandlersArgs) => PrintSessionCommandHandlers
}

export function usePrintSessionController({
  snapshot,
}: UsePrintSessionControllerArgs): UsePrintSessionControllerResult {
  const [filesLibrary, setFilesLibrary] = useState<PrintFileItem[]>(() => [...PRINT_FILE_LIBRARY])
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [fileModalNotice, setFileModalNotice] = useState<string>('')
  const [activePrintFileName, setActivePrintFileName] = useState<string | null>(null)
  const [activePrintUiState, setActivePrintUiState] = useState<ActivePrintUiState | null>(null)
  const [isPrintCancelConfirmOpen, setIsPrintCancelConfirmOpen] = useState<boolean>(false)

  const files = snapshot.source === 'live' ? snapshot.printFiles : filesLibrary
  const selectedPrintFile = useMemo(() => {
    if (selectedFileId === null) {
      return null
    }

    return files.find((item) => item.id === selectedFileId) ?? null
  }, [files, selectedFileId])

  const displayPrintFileName = snapshot.source === 'live' && snapshot.printJob.isActive
    ? snapshot.printJob.filename
    : activePrintFileName
  const hasActivePrint = displayPrintFileName !== null
  const printFill = snapshot.source === 'live'
    ? Math.round(clampValue(snapshot.printJob.progress * 100, 0, 100))
    : Math.max(0, Math.min(100, DASHBOARD_VALUES.progressPercent))
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
          isActive: snapshot.printJob.isActive,
          isPaused: snapshot.printJob.isPaused,
        }
      : {
          state: activePrintUiState ??
            (activePrintFileName === null ? snapshot.printJob.state : 'printing'),
          isActive: activePrintFileName !== null,
          isPaused: activePrintUiState === 'paused',
        }
  ), [
    activePrintFileName,
    activePrintUiState,
    snapshot.printJob.isActive,
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

  const deleteSelectedFile = useCallback((): void => {
    if (selectedPrintFile === null) {
      return
    }

    if (displayPrintFileName === selectedPrintFile.name || displayPrintFileName === selectedPrintFile.path) {
      setActivePrintFileName(null)
      setActivePrintUiState(null)
    }
    if (snapshot.source !== 'live') {
      setFilesLibrary((currentItems) => currentItems.filter((item) => item.id !== selectedPrintFile.id))
    }
    closeFileModal()
  }, [closeFileModal, displayPrintFileName, selectedPrintFile, snapshot.source])

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
    selectedPrintFile,
    displayPrintFileName,
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
