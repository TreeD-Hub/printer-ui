import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AppScreenContent } from './AppScreenContent'

vi.mock('../dashboard/DashboardContainer', () => ({ DashboardContainer: () => <div>Dashboard</div> }))
vi.mock('../control', () => ({ ControlContainer: () => null }))
vi.mock('../files', () => ({ FilesContainer: () => null }))
vi.mock('../settings', () => ({ SettingsContainer: () => null }))
vi.mock('../ui', () => ({ NavItemButton: ({ label }: { label: string }) => <button>{label}</button> }))
vi.mock('../macros', () => ({
  MacrosContainer: ({ onCalibrationActivityChange }: { onCalibrationActivityChange: (active: boolean) => void }) => (
    <section>
      <button onClick={() => onCalibrationActivityChange(true)}>Запустить</button>
      <button onClick={() => onCalibrationActivityChange(false)}>Готово</button>
    </section>
  ),
}))

afterEach(cleanup)

it('hides navigation and fills both canvas rows only during a calibration', () => {
  const props = {
    activeScreen: 'macros', isFilesScreenActive: false, hasActivePrint: false,
    dashboard: {}, control: {}, files: {}, settings: {}, macros: {}, onScreenSelect: vi.fn(),
  } as unknown as Parameters<typeof AppScreenContent>[0]
  const view = render(<AppScreenContent {...props} />)
  const content = view.container.querySelector('.content-grid')!
  expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeInTheDocument()
  expect(content).not.toHaveStyle({ gridRow: '1 / -1' })
  fireEvent.click(screen.getByRole('button', { name: 'Запустить' }))
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  expect(content).toHaveStyle({ gridRow: '1 / -1' })
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
  expect(screen.getByRole('navigation')).toBeInTheDocument()
  expect(content).not.toHaveStyle({ gridRow: '1 / -1' })
  fireEvent.click(screen.getByRole('button', { name: 'Запустить' }))
  view.rerender(<AppScreenContent {...props} activeScreen="dashboard" />)
  expect(screen.getByRole('navigation')).toBeInTheDocument()
  expect(content).not.toHaveStyle({ gridRow: '1 / -1' })
})
