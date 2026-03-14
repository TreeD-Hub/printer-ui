import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'

describe('App', () => {
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

  it('switches between screens from bottom navigation', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))

    expect(screen.getByTestId('screen-files')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Файлы' })).toBeInTheDocument()
    expect(screen.getByText('Прокрутите вниз, чтобы найти нужную модель.')).toBeInTheDocument()
    expect(screen.queryByText(/Экран файлов подключен в каркас маршрутизации/i)).not.toBeInTheDocument()
    expect(screen.getAllByTestId('print-file-card')).toHaveLength(12)

    const sortByNameButton = screen.getByRole('button', { name: 'По имени' })
    const sortByAddedAtButton = screen.getByRole('button', { name: 'По добавлению' })

    expect(sortByNameButton).toHaveAttribute('aria-pressed', 'true')
    expect(sortByAddedAtButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByTestId('print-file-card')[0]).toHaveTextContent('bearing_bracket_mk2.gcode')

    fireEvent.click(sortByAddedAtButton)

    expect(sortByAddedAtButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByTestId('print-file-card')[0]).toHaveTextContent('fan_shroud_prototype.gcode')
    expect(screen.getByText('2 ч 15 мин')).toBeInTheDocument()
    expect(screen.getByText('34 г')).toBeInTheDocument()
  })

  it('opens print file modal and handles start and delete actions', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))

    const initialCards = screen.getAllByTestId('print-file-card')
    fireEvent.click(initialCards[0])

    const fileDialog = screen.getByRole('dialog', { name: 'Файл печати' })
    expect(fileDialog).toBeInTheDocument()
    expect(within(fileDialog).getByText('Время печати')).toBeInTheDocument()
    expect(within(fileDialog).getByText('Масса')).toBeInTheDocument()
    expect(within(fileDialog).getByText('Материал')).toBeInTheDocument()
    expect(within(fileDialog).getByRole('button', { name: 'Старт печати' })).toBeInTheDocument()
    expect(within(fileDialog).getByRole('button', { name: 'Удалить файл' })).toBeInTheDocument()

    fireEvent.click(within(fileDialog).getByRole('button', { name: 'Старт печати' }))

    await waitFor(() => {
      expect(screen.queryByTestId('print-file-modal')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByTestId('print-file-card')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Удалить файл' }))

    await waitFor(() => {
      expect(screen.queryByTestId('print-file-modal')).not.toBeInTheDocument()
      expect(screen.getAllByTestId('print-file-card')).toHaveLength(initialCards.length - 1)
    })
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
