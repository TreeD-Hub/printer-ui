import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockSnapshot } from '../../mocks/runtime'
import { EddyCalibrationScreen } from './EddyCalibrationScreen'

afterEach(cleanup)

it('объясняет блокировку калибровки вместо ложной готовности и не выполняет команду', () => {
  const snapshot = createMockSnapshot()
  snapshot.v2.eddy.calibration.operatorPrompt = 'none'
  const reason = 'Калибровка недоступна во время печати.'
  const executeCommand = vi.fn().mockResolvedValue(true)
  render(
    <EddyCalibrationScreen
      snapshot={snapshot}
      pendingCommand={null}
      executeCommand={executeCommand}
      refreshEddyState={vi.fn().mockResolvedValue(undefined)}
      getCommandBlockReason={() => reason}
      onBackToList={vi.fn()}
    />,
  )
  expect(screen.getByRole('status')).toHaveTextContent(reason)
  expect(screen.queryByText('Готов к следующему действию')).not.toBeInTheDocument()
  const calibrate = screen.getByRole('button', { name: 'Калибровать ток' })
  expect(calibrate).toBeDisabled()
  fireEvent.click(calibrate)
  expect(executeCommand).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Далее' })).toBeEnabled()
})
