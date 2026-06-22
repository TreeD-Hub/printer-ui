import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createMockSnapshot } from '../../mocks/runtime'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import { PRINT_FILE_LIBRARY } from '../printFiles'
import type { PrinterSnapshot } from '../core/transport/types'
import { usePrintSessionController } from './usePrintSessionController'

type ExecuteCommandMock = (args: ExecuteCommandArgs) => Promise<boolean>
type RefreshMock = () => Promise<void>

type TestHarnessProps = {
  snapshot?: PrinterSnapshot
  executeCommand?: ExecuteCommandMock
  getLastCommandError?: () => string
  commandError?: string
  printStartBlockReason?: string | null
  printCancelBlockReason?: string | null
  requiresCommandConfirmation?: (command: PrinterCommandId) => boolean
  refresh?: RefreshMock
  onOpenDashboard?: () => void
  deletePrintFile?: (path: string) => Promise<void>
}

function TestHarness({
  snapshot = createMockSnapshot(),
  executeCommand = vi.fn<ExecuteCommandMock>().mockResolvedValue(true),
  getLastCommandError = () => '',
  commandError = '',
  printStartBlockReason = null,
  printCancelBlockReason = null,
  requiresCommandConfirmation = () => true,
  refresh = vi.fn<RefreshMock>().mockResolvedValue(undefined),
  onOpenDashboard = vi.fn(),
  deletePrintFile,
}: TestHarnessProps) {
  const controller = usePrintSessionController({ snapshot, deletePrintFile })
  const actions = controller.createCommandHandlers({
    executeCommand,
    getLastCommandError,
    commandError,
    printStartBlockReason,
    printCancelBlockReason,
    requiresCommandConfirmation,
    refresh,
    onOpenDashboard,
  })

  return (
    <div>
      <span data-testid="files-count">{controller.files.length}</span>
      <span data-testid="selected-file">{controller.selectedPrintFile?.name ?? 'none'}</span>
      <span data-testid="active-file">{controller.displayPrintFileName ?? 'none'}</span>
      <span data-testid="active-state">{controller.effectiveActivePrintState}</span>
      <span data-testid="has-active-print">{String(controller.hasActivePrint)}</span>
      <span data-testid="is-paused">{String(controller.isPrintPaused)}</span>
      <span data-testid="runtime-active">{String(controller.commandRuntimePrintJob.isActive)}</span>
      <span data-testid="runtime-state">{controller.commandRuntimePrintJob.state}</span>
      <span data-testid="runtime-paused">{String(controller.commandRuntimePrintJob.isPaused)}</span>
      <span data-testid="notice">{controller.getFileStartNotice(printStartBlockReason) || 'none'}</span>
      <span data-testid="cancel-confirm">{String(controller.isPrintCancelConfirmOpen)}</span>

      <button type="button" onClick={() => controller.selectFile(PRINT_FILE_LIBRARY[0].id)}>
        select first
      </button>
      <button type="button" onClick={() => void actions.startSelectedFile()}>
        start selected
      </button>
      <button type="button" onClick={() => void actions.togglePause()}>
        toggle pause
      </button>
      <button type="button" onClick={() => void actions.requestStop()}>
        request stop
      </button>
      <button type="button" onClick={() => void actions.confirmStop()}>
        confirm stop
      </button>
      <button type="button" onClick={controller.deleteSelectedFile}>
        delete selected
      </button>
    </div>
  )
}

describe('usePrintSessionController', () => {
  it('starts a mock print and exposes runtime print job state for command blocking', async () => {
    const executeCommand = vi.fn<ExecuteCommandMock>().mockResolvedValue(true)
    const refresh = vi.fn<RefreshMock>().mockResolvedValue(undefined)
    const onOpenDashboard = vi.fn()

    render(
      <TestHarness
        executeCommand={executeCommand}
        refresh={refresh}
        onOpenDashboard={onOpenDashboard}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'select first' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'start selected' }))
    })

    expect(executeCommand).toHaveBeenCalledWith({
      command: 'start',
      filename: PRINT_FILE_LIBRARY[0].path,
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(onOpenDashboard).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('selected-file')).toHaveTextContent('none')
    expect(screen.getByTestId('active-file')).toHaveTextContent(PRINT_FILE_LIBRARY[0].name)
    expect(screen.getByTestId('has-active-print')).toHaveTextContent('true')
    expect(screen.getByTestId('runtime-active')).toHaveTextContent('true')
    expect(screen.getByTestId('runtime-state')).toHaveTextContent('printing')
  })

  it('keeps the file modal open on start failure and supports delete cleanup', async () => {
    render(
      <TestHarness
        executeCommand={vi.fn<ExecuteCommandMock>().mockResolvedValue(false)}
        getLastCommandError={() => 'Mock: start failed'}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'select first' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'start selected' }))
    })

    expect(screen.getByTestId('selected-file')).toHaveTextContent(PRINT_FILE_LIBRARY[0].name)
    expect(screen.getByTestId('active-file')).toHaveTextContent('none')
    expect(screen.getByTestId('notice')).toHaveTextContent('Mock: start failed')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'delete selected' }))
    })

    expect(screen.getByTestId('selected-file')).toHaveTextContent('none')
    expect(screen.getByTestId('files-count')).toHaveTextContent(String(PRINT_FILE_LIBRARY.length - 1))
  })

  it('toggles pause state and clears active print after confirmed cancel', async () => {
    render(<TestHarness />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'select first' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'start selected' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle pause' }))
    })

    expect(screen.getByTestId('active-state')).toHaveTextContent('paused')
    expect(screen.getByTestId('is-paused')).toHaveTextContent('true')
    expect(screen.getByTestId('runtime-paused')).toHaveTextContent('true')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'request stop' }))
    })

    expect(screen.getByTestId('cancel-confirm')).toHaveTextContent('true')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'confirm stop' }))
    })

    expect(screen.getByTestId('cancel-confirm')).toHaveTextContent('false')
    expect(screen.getByTestId('active-file')).toHaveTextContent('none')
    expect(screen.getByTestId('has-active-print')).toHaveTextContent('false')
    expect(screen.getByTestId('runtime-active')).toHaveTextContent('false')
  })

  it('does not fake live pause and cancel state before snapshot confirms it', async () => {
    const liveSnapshot: PrinterSnapshot = {
      ...createMockSnapshot(),
      source: 'live',
      state: 'printing',
      printJob: {
        ...createMockSnapshot().printJob,
        filename: PRINT_FILE_LIBRARY[0].name,
        filePath: PRINT_FILE_LIBRARY[0].path,
        state: 'printing',
        isActive: true,
        isPaused: false,
      },
    }

    render(<TestHarness snapshot={liveSnapshot} />)

    expect(screen.getByTestId('active-file')).toHaveTextContent(PRINT_FILE_LIBRARY[0].name)
    expect(screen.getByTestId('runtime-active')).toHaveTextContent('true')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle pause' }))
    })

    expect(screen.getByTestId('active-state')).toHaveTextContent('printing')
    expect(screen.getByTestId('is-paused')).toHaveTextContent('false')
    expect(screen.getByTestId('runtime-paused')).toHaveTextContent('false')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'confirm stop' }))
    })

    expect(screen.getByTestId('active-file')).toHaveTextContent(PRINT_FILE_LIBRARY[0].name)
    expect(screen.getByTestId('has-active-print')).toHaveTextContent('true')
    expect(screen.getByTestId('runtime-active')).toHaveTextContent('true')
  })

  it('deletes a live file through runtime and keeps the modal open on failure', async () => {
    const liveSnapshot: PrinterSnapshot = {
      ...createMockSnapshot(),
      source: 'live',
      printFiles: [PRINT_FILE_LIBRARY[0]],
    }
    const deletePrintFile = vi.fn<(path: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Moonraker delete failed'))
      .mockResolvedValueOnce(undefined)

    render(<TestHarness snapshot={liveSnapshot} deletePrintFile={deletePrintFile} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'select first' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'delete selected' }))
    })

    expect(deletePrintFile).toHaveBeenCalledWith(PRINT_FILE_LIBRARY[0].path)
    expect(screen.getByTestId('selected-file')).toHaveTextContent(PRINT_FILE_LIBRARY[0].name)
    expect(screen.getByTestId('notice')).toHaveTextContent('Moonraker delete failed')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'delete selected' }))
    })

    expect(screen.getByTestId('selected-file')).toHaveTextContent('none')
  })
})
