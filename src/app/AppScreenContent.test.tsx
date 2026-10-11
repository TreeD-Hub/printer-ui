import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AppScreenContent } from './AppScreenContent'

vi.mock('../dashboard/DashboardContainer', () => ({ DashboardContainer: () => <div>Dashboard</div> }))
vi.mock('../control', () => ({ ControlContainer: () => null }))
vi.mock('../files', () => ({ FilesContainer: () => null }))
vi.mock('../settings', () => ({ SettingsContainer: () => null }))
vi.mock('../ui', () => ({ NavItemButton: ({ label }: { label: string }) => <button>{label}</button> }))
vi.mock('../macros', () => ({
  MacrosContainer: ({ onCalibrationActivityChange, onCalibrationViewChange }: { onCalibrationActivityChange: (active: boolean) => void; onCalibrationViewChange: (active: boolean) => void }) => (
    <section>
      <button onClick={() => onCalibrationActivityChange(true)}>Начать активность</button>
      <button onClick={() => onCalibrationActivityChange(false)}>Завершить активность</button>
      <button onClick={() => onCalibrationViewChange(true)}>Открыть калибровку</button>
      <button onClick={() => onCalibrationViewChange(false)}>Выйти из калибровки</button>
    </section>
  ),
}))

afterEach(cleanup)

it('supports immediate workflow fullscreen and preserves activity-based fullscreen', () => {
  const props = {
    activeScreen: 'macros', isFilesScreenActive: false, hasActivePrint: false,
    dashboard: {}, control: {}, files: {}, settings: {}, macros: {}, onScreenSelect: vi.fn(),
  } as unknown as Parameters<typeof AppScreenContent>[0]
  const view = render(<AppScreenContent {...props} />)
  const content = view.container.querySelector('.content-grid')!
  expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeInTheDocument()
  expect(content).not.toHaveStyle({ gridRow: '1 / -1' })
  fireEvent.click(screen.getByRole('button', { name: 'Открыть калибровку' }))
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  expect(content).toHaveStyle({ gridRow: '1 / -1' })
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из калибровки' }))
  expect(screen.getByRole('navigation')).toBeInTheDocument()
  expect(content).not.toHaveStyle({ gridRow: '1 / -1' })
  fireEvent.click(screen.getByRole('button', { name: 'Начать активность' }))
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  expect(content).toHaveStyle({ gridRow: '1 / -1' })
  fireEvent.click(screen.getByRole('button', { name: 'Завершить активность' }))
  expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeInTheDocument()
  expect(content).not.toHaveStyle({ gridRow: '1 / -1' })
  fireEvent.click(screen.getByRole('button', { name: 'Открыть калибровку' }))
  view.rerender(<AppScreenContent {...props} activeScreen="dashboard" />)
  expect(screen.getByRole('navigation')).toBeInTheDocument()
  expect(content).not.toHaveStyle({ gridRow: '1 / -1' })
})
