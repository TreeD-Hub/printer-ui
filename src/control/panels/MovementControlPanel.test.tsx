import { act, fireEvent, render, screen } from '@testing-library/react'
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
    moveStepKey: '100',
    commandBlockReasons: {
      parking: {
        all: null,
        axis: {
          X: null,
          Y: null,
          Z: null,
        },
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
    onServiceModeToggle: vi.fn(),
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
  it('maps Z up and down buttons to inverted bed movement commands', () => {
    const onAxisMove = vi.fn().mockResolvedValue(true)

    render(<MovementControlPanel {...createProps({ onAxisMove })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Сдвиг Z вниз' }))
    expect(onAxisMove).toHaveBeenCalledWith('Z', 100)

    fireEvent.click(screen.getByRole('button', { name: 'Сдвиг Z вверх' }))
    expect(onAxisMove).toHaveBeenCalledWith('Z', -100)
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
})
