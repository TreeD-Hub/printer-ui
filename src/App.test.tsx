import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'

describe('App', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('renders layout according to landscape dashboard frame', async () => {
    render(<App />)

    expect(screen.getByTestId('screen-shell')).toBeInTheDocument()
    expect(screen.getByText('TreeD Принтер')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Печать')).toBeInTheDocument()
    })
    expect(screen.getByText('Обдув')).toBeInTheDocument()
    expect(
      screen.getByText((_, element) => {
        if (!element) {
          return false
        }
        return element.textContent === '215/220°C'
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /Основная навигация/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Уведомления' })).toBeInTheDocument()
    expect(screen.getByText('Ускорение')).toBeInTheDocument()
    expect(screen.getByText('Объемный расход')).toBeInTheDocument()
    expect(screen.getByText('Откат')).toBeInTheDocument()
    expect(screen.getByText('Z-offset')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'шаг babystep' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '0.1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '0.05' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '0.025' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Стоп' })).toBeInTheDocument()
  })

  it('handles pause command from action stack', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Пауза' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Пауза|Пауза.../i })).toBeInTheDocument()
    })
  })

  it('enables one-to-one preview mode via query flag', () => {
    window.history.replaceState({}, '', '/?view=1x1')
    render(<App />)

    const shell = screen.getByTestId('screen-shell')
    expect(shell.closest('main')).toHaveClass('is-one-to-one')
  })

  it('switches between screens from bottom navigation', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))

    expect(screen.getByTestId('screen-files')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Файлы' })).toBeInTheDocument()
    expect(window.location.search).toContain('screen=files')
  })

  it('opens Wi-Fi popup with network details and navigates to settings', () => {
    render(<App />)

    const wifiButton = screen.getByRole('button', { name: 'Статус Wi-Fi' })
    fireEvent.click(wifiButton)

    const wifiPopup = screen.getByTestId('top-popup-wifi')

    expect(screen.getByRole('dialog', { name: 'Состояние Wi-Fi' })).toBeInTheDocument()
    expect(wifiPopup.style.top).toBe('8px')
    expect(wifiPopup.style.left).not.toBe('')
    expect(wifiButton).toHaveClass('is-active')
    expect(screen.getByText('Wi-Fi сеть')).toBeInTheDocument()
    expect(screen.getByText('IP адрес')).toBeInTheDocument()
    expect(screen.getByText('Время')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Перейти в настройки Wi-Fi' }))

    expect(screen.getByTestId('screen-settings')).toBeInTheDocument()
    expect(wifiButton).not.toHaveClass('is-active')
  })

  it('shows cloud connectivity status and QR redirect to treed.pro', () => {
    render(<App />)

    const cloudButton = screen.getByRole('button', { name: 'Статус облака' })
    fireEvent.click(cloudButton)

    expect(screen.getByRole('dialog', { name: 'Состояние облака' })).toBeInTheDocument()
    expect(cloudButton).toHaveClass('is-active')
    expect(screen.getByText(/В сети|Не в сети/)).toBeInTheDocument()

    const redirectLink = screen.getByRole('link', { name: 'Открыть treed.pro для добавления устройства' })
    expect(redirectLink.getAttribute('href')).toContain('https://treed.pro')
  })

  it('shows placeholder response in power popup', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Питание' }))

    expect(screen.getByRole('dialog', { name: 'Выключение принтера' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Выключить принтер' }))

    expect(screen.getByText('Команда выключения пока не подключена к backend.')).toBeInTheDocument()
  })
})
