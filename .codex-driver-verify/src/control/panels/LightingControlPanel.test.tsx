import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { LightingControlPanel } from './LightingControlPanel'

it('показывает дефолты и передаёт выбранную настройку без изменения второй', () => {
  const onChange = vi.fn()
  const props = { isMainLightEnabled: false, isToolheadLightEnabled: false, isBusy: false,
    mainLightCommandBlockReason: null, toolheadLightCommandBlockReason: null,
    onMainLightToggle: vi.fn(), onToolheadLightToggle: vi.fn(), onLightPreferenceChange: onChange }
  const { rerender } = render(<LightingControlPanel {...props} />)
  expect(screen.getByRole('switch', { name: 'Свет при запуске принтера' })).not.toBeChecked()
  expect(screen.getByRole('switch', { name: 'Свет при начале печати' })).toBeChecked()
  fireEvent.click(screen.getByRole('switch', { name: 'Свет при запуске принтера' }))
  expect(onChange).toHaveBeenCalledWith('onStartup', true)
  rerender(<LightingControlPanel {...props} isBusy />)
  expect(screen.getByRole('switch', { name: 'Свет при начале печати' })).toBeDisabled()
})
