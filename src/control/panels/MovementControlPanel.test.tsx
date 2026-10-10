import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockSnapshot } from '../../../mocks/runtime'
import { setPrinterSnapshot } from '../../core/store/printerStore'
import type { MovementControlPanelProps } from '../types'
import { MovementControlPanel } from './MovementControlPanel'

function createProps(overrides: Partial<MovementControlPanelProps> = {}): MovementControlPanelProps {
  return {
    pendingCommand: null,
    isMotionBusy: false,
    isFilamentBusy: false,
    activeControlFlashKey: null,
    movementMode: 'buttons',
    moveStepKey: '50',
    commandBlockReasons: {
      serviceMode: null,
      parking: {
        all: null,
        axis: {
          X: null,
          Y: null,
          Z: null,
        },
        zBottom: null,
      },
      moveAxis: {
        X: {
          negative: null,
          positive: null,
        },
        Y: {
          negative: null,
          positive: null,
        },
        Z: {
          negative: null,
          positive: null,
        },
      },
      disableMotors: null,
      loadFilament: null,
      unloadFilament: null,
    },
    zBounds: {
      min: 0,
      max: 255,
    },
    onParkingTargetSelect: vi.fn().mockResolvedValue(true),
    onServiceModeToggle: vi.fn().mockResolvedValue(true),
    onMotorsDisable: vi.fn().mockResolvedValue(true),
    onMovementModeChange: vi.fn(),
    onMoveStepChange: vi.fn(),
    onAxisMove: vi.fn().mockResolvedValue(true),
    onFilamentMove: vi.fn().mockResolvedValue(true),
    getLastCommandError: vi.fn(() => ''),
    ...overrides,
  }
}

beforeEach(() => {
  act(() => {
    setPrinterSnapshot(createMockSnapshot())
  })
})

describe('MovementControlPanel', () => {
  it('runs service parking and locks the button while motion is pending', async () => {
    const onServiceModeToggle = vi.fn().mockResolvedValue(true)
    const { rerender } = render(<MovementControlPanel {...createProps({ onServiceModeToggle })} />)
    fireEvent.click(screen.getByTestId('service-mode-button'))
    expect(onServiceModeToggle).toHaveBeenCalledTimes(1)

    rerender(<MovementControlPanel {...createProps({
      onServiceModeToggle, isMotionBusy: true, pendingCommand: 'serviceMode',
    })} />)
    expect(screen.getByTestId('service-mode-button')).toBeDisabled()
    expect(screen.getByTestId('service-mode-button')).toHaveTextContent('Парковка')
    fireEvent.click(screen.getByTestId('service-mode-button'))
    expect(onServiceModeToggle).toHaveBeenCalledTimes(1)
  })

  it('shows the service lock reason without sending a command', () => {
    const props = createProps()
    props.commandBlockReasons.serviceMode = 'Сервисный режим недоступен во время печати.'
    render(<MovementControlPanel {...props} />)
    fireEvent.click(screen.getByTestId('service-mode-button'))
    expect(props.onServiceModeToggle).not.toHaveBeenCalled()
    expect(screen.getByTestId('movement-lock-popup')).toHaveTextContent('во время печати')
  })

  it('shows a failed service parking instead of success', async () => {
    render(<MovementControlPanel {...createProps({
      onServiceModeToggle: vi.fn().mockResolvedValue(false),
      getLastCommandError: () => 'DIAG не сработал',
    })} />)
    fireEvent.click(screen.getByTestId('service-mode-button'))
    await waitFor(() => {
      expect(screen.getByTestId('movement-lock-popup')).toHaveTextContent('DIAG не сработал')
    })
  })

  it('maps Z up and down buttons to inverted bed movement commands', () => {
    const onAxisMove = vi.fn().mockResolvedValue(true)

    render(<MovementControlPanel {...createProps({ onAxisMove })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Сдвиг Z вниз' }))
    expect(onAxisMove).toHaveBeenCalledWith('Z', 50)

    fireEvent.click(screen.getByRole('button', { name: 'Сдвиг Z вверх' }))
    expect(onAxisMove).toHaveBeenCalledWith('Z', -50)
  })

  it('opens Z parking choice and routes upper and lower sensors separately', async () => {
    const onParkingTargetSelect = vi.fn().mockResolvedValue(true)
    render(<MovementControlPanel {...createProps({ onParkingTargetSelect })} />)

    fireEvent.click(screen.getByTestId('parking-axis-Z'))
    expect(screen.getByTestId('z-parking-dialog')).toBeInTheDocument()
    expect(onParkingTargetSelect).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('z-parking-upper'))
    await waitFor(() => {
      expect(onParkingTargetSelect).toHaveBeenCalledWith('axis', 'Z', 'upper')
    })

    fireEvent.click(screen.getByTestId('parking-axis-Z'))
    fireEvent.click(screen.getByTestId('z-parking-lower'))
    await waitFor(() => {
      expect(onParkingTargetSelect).toHaveBeenCalledWith('axis', 'Z', 'lower')
    })
  })

  it('shows live nozzle temperature in the coordinate summary', () => {
    const snapshot = createMockSnapshot()
    snapshot.extruderTemp = 214.7
    act(() => {
      setPrinterSnapshot(snapshot)
    })

    render(<MovementControlPanel {...createProps()} />)

    expect(screen.getByTestId('axis-nozzle-temp')).toHaveTextContent('215°C')

    const updatedSnapshot = createMockSnapshot()
    updatedSnapshot.extruderTemp = 222.3
    act(() => {
      setPrinterSnapshot(updatedSnapshot)
    })

    expect(screen.getByTestId('axis-nozzle-temp')).toHaveTextContent('222°C')
  })

  it('requires confirmation before releasing motors and respects motion locks', async () => {
    const onMotorsDisable = vi.fn().mockResolvedValue(true)
    const { rerender } = render(
      <MovementControlPanel {...createProps({ onMotorsDisable })} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Отключить моторы' }))

    expect(onMotorsDisable).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Освободить моторы?' })).toHaveTextContent(
      'Z или портал могут просесть',
    )

    fireEvent.click(screen.getByTestId('motors-release-confirm'))
    expect(onMotorsDisable).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByTestId('motors-release-confirm-dialog')).not.toBeInTheDocument()
    })

    rerender(<MovementControlPanel {...createProps({ isMotionBusy: true, onMotorsDisable })} />)
    expect(screen.getByRole('button', { name: 'Отключить моторы' })).toBeDisabled()
  })

  it('shows the block reason instead of opening Release confirmation', () => {
    const onMotorsDisable = vi.fn().mockResolvedValue(true)
    const props = createProps({ onMotorsDisable })
    props.commandBlockReasons.disableMotors = 'Идет парковка осей'

    render(<MovementControlPanel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Отключить моторы' }))

    expect(screen.queryByTestId('motors-release-confirm-dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('movement-lock-popup')).toHaveTextContent('Идет парковка осей')
    expect(onMotorsDisable).not.toHaveBeenCalled()
  })
})
