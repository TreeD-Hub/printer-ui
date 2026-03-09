import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'

describe('App', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('renders layout according to landscape dashboard frame', async () => {
    render(<App />)

    expect(screen.getByTestId('screen-shell')).toBeInTheDocument()
    expect(screen.getByText('TreeD Printer')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Printing')).toBeInTheDocument()
    })
    expect(screen.getByText('Model Fan')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /Main Navigation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel Print' })).toBeInTheDocument()
  })

  it('handles pause command from action stack', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Pause|Pausing/i })).toBeInTheDocument()
    })
  })

  it('enables one-to-one preview mode via query flag', () => {
    window.history.replaceState({}, '', '/?view=1x1')
    render(<App />)

    const shell = screen.getByTestId('screen-shell')
    expect(shell.closest('main')).toHaveClass('is-one-to-one')
  })
})
