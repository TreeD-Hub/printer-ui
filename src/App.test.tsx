import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders idle placeholder on dashboard before print start', async () => {
    render(<App />)

    expect(screen.getByTestId('screen-shell')).toBeInTheDocument()
    expect(screen.getByText('TreeD Принтер')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('top-bar-screen-label')).toHaveTextContent('Ожидание печати')
    })
    expect(screen.getByTestId('screen-dashboard-idle')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ожидание печати' })).not.toBeInTheDocument()
    const idleNotesInput = screen.getByTestId('idle-notes-input') as HTMLTextAreaElement
    expect(idleNotesInput.value.length).toBeGreaterThan(0)
    fireEvent.focus(idleNotesInput)
    expect(screen.getByTestId('idle-notes-keyboard')).toBeInTheDocument()
    idleNotesInput.setSelectionRange(idleNotesInput.value.length, idleNotesInput.value.length)
    fireEvent.click(screen.getByRole('button', { name: /Символ о/i }))
    expect(idleNotesInput.value.endsWith('о')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть клавиатуру' }))
    expect(screen.queryByTestId('idle-notes-keyboard')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /Основная навигация/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Уведомления' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Пауза' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Стоп' })).not.toBeInTheDocument()
  })

  it('returns to waiting state after print cancel', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))
    fireEvent.click(screen.getAllByTestId('print-file-card')[0])
    fireEvent.click(screen.getByTestId('print-file-start-button'))

    await waitFor(() => {
      expect(screen.queryByTestId('print-file-modal')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByTestId('top-bar-screen-label')).toHaveTextContent('Печать')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Стоп' }))
    expect(screen.getByTestId('print-cancel-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('print-cancel-confirm-button'))

    await waitFor(() => {
      expect(screen.getByTestId('top-bar-screen-label')).toHaveTextContent('Ожидание печати')
    })
    expect(screen.getByTestId('screen-dashboard-idle')).toBeInTheDocument()
  })

  it('switches between screens from bottom navigation', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))

    expect(screen.getByTestId('screen-files')).toBeInTheDocument()
    expect(screen.getByTestId('top-bar-screen-label')).toHaveTextContent('Файлы')
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

  it('renders control widgets and switches parking mode to specific axis', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Управление' }))

    expect(screen.getByTestId('screen-control')).toBeInTheDocument()
    expect(screen.getByTestId('top-bar-screen-label')).toHaveTextContent('Управление')
    expect(screen.getByRole('heading', { name: 'Парковка' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Сервисный режим' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Управление обдувом' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Перемещение по осям' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Парковка по всем осям' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отключить моторы' })).toBeInTheDocument()
    expect(screen.getByTestId('model-fan-slider')).toBeInTheDocument()

    const parkingAllButton = screen.getByTestId('parking-mode-all')
    const parkingAxisButton = screen.getByTestId('parking-mode-axis')

    expect(parkingAllButton).toHaveAttribute('aria-pressed', 'true')
    expect(parkingAxisButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(parkingAxisButton)

    expect(parkingAxisButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('parking-axis-X')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Парковка оси X' })).toBeInTheDocument()

    const moveButtonsMode = screen.getByTestId('move-mode-buttons')
    const moveJoystickMode = screen.getByTestId('move-mode-joystick')

    expect(moveButtonsMode).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Сдвиг Y в плюс' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сдвиг X в минус' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сдвиг X в плюс' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сдвиг Y в минус' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сдвиг Z в плюс' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сдвиг Z в минус' })).toBeInTheDocument()
    expect(screen.getByTestId('move-step-1')).toBeInTheDocument()
    expect(screen.getByTestId('axis-coordinates')).toBeInTheDocument()

    fireEvent.click(moveJoystickMode)

    expect(moveJoystickMode).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('axis-joystick')).toBeInTheDocument()
    expect(screen.getByTestId('axis-z-slider')).toBeInTheDocument()
    expect(screen.queryByTestId('move-step-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('axis-coordinates')).toBeInTheDocument()
    expect(screen.getByText(/Скорость XY/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Отключить моторы' }))
    expect(screen.queryByText('Команда отключения моторов пока не подключена.')).not.toBeInTheDocument()
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
    expect(screen.getByTestId('top-bar-screen-label')).toHaveTextContent('Печать')

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))
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
    expect(within(wifiPopup).getByText('Время')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Перейти в настройки Wi-Fi' }))

    expect(screen.getByTestId('screen-settings')).toBeInTheDocument()
    expect(screen.getByTestId('top-bar-screen-label')).toHaveTextContent('Настройки')
    expect(screen.getByTestId('settings-group-network')).toHaveAttribute('aria-pressed', 'true')
    const wifiSearchInput = screen.getByTestId('settings-network-search') as HTMLInputElement
    fireEvent.focus(wifiSearchInput)
    expect(screen.getByTestId('settings-console-keyboard')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('settings-keyboard-layer'))
    expect(screen.queryByTestId('settings-console-keyboard')).not.toBeInTheDocument()

    fireEvent.change(wifiSearchInput, { target: { value: 'Office' } })
    fireEvent.click(screen.getByTestId('settings-network-item-office-main-5g'))
    const wifiPasswordInput = screen.getByTestId('settings-network-password-input') as HTMLInputElement
    fireEvent.change(wifiPasswordInput, { target: { value: '12345678' } })
    fireEvent.focus(wifiPasswordInput)
    expect(screen.getByTestId('settings-wifi-keyboard')).toBeInTheDocument()
    expect(screen.getByTestId('settings-keyboard-layer')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Символ q/i }))
    expect(wifiPasswordInput.value).toBe('12345678q')
    expect(screen.getByTestId('settings-wifi-keyboard-preview')).toHaveTextContent('12345678q')
    fireEvent.click(screen.getByTestId('settings-keyboard-layer'))
    expect(screen.queryByTestId('settings-wifi-keyboard')).not.toBeInTheDocument()
    expect(screen.queryByText('Текущая сеть')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('settings-network-connect-button'))
    expect(screen.getByTestId('settings-network-notice')).toHaveTextContent('Подключено к Office_Main_5G.')
    expect(wifiButton).not.toHaveClass('is-active')
  })

  it('renders extended settings sections and handles interactions', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    expect(screen.getByTestId('screen-settings')).toBeInTheDocument()
    const settingsMenu = screen.getByRole('navigation', { name: 'Группы настроек' })
    expect(within(settingsMenu).getAllByRole('button')[0]).toHaveTextContent('Сеть')

    fireEvent.click(screen.getByTestId('settings-group-interface'))
    expect(screen.getByRole('heading', { name: 'Интерфейс' })).toBeInTheDocument()
    expect(screen.getByTestId('settings-dark-theme-toggle')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('settings-max-performance-toggle')).toHaveAttribute('aria-pressed', 'false')
    expect((screen.getByRole('combobox', { name: 'Спящий режим' }) as HTMLSelectElement).value).toBe('5 мин')
    expect(
      within(screen.getByRole('combobox', { name: 'Временная зона UTC' })).getAllByRole('option').length,
    ).toBeGreaterThan(20)

    fireEvent.click(screen.getByTestId('settings-max-performance-toggle'))
    expect(document.querySelector('.app-root')).toHaveClass('is-performance-mode')

    fireEvent.click(screen.getByTestId('settings-group-notifications'))
    expect(screen.getByRole('heading', { name: 'Уведомления' })).toBeInTheDocument()
    expect(screen.getByTestId('settings-notifications-enabled-toggle')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Печать завершена')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-group-cloud'))
    fireEvent.click(screen.getByTestId('settings-cloud-connect-toggle'))
    fireEvent.click(screen.getByTestId('settings-cloud-ai-toggle'))
    expect(screen.getByText('Подключение к сервису AI-контроля ошибок активно.')).toBeInTheDocument()
    expect(screen.getByText('Включен')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-group-device'))
    expect(screen.getByRole('heading', { name: 'Об устройстве' })).toBeInTheDocument()
    expect(screen.getByText('TreeD Shell Controller')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-group-updates'))
    fireEvent.click(screen.getByTestId('settings-check-updates-button'))
    expect(screen.getByText('Доступна версия 0.1.1.')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-group-console'))
    const consoleInput = screen.getByTestId('settings-console-input') as HTMLTextAreaElement
    fireEvent.focus(consoleInput)
    expect(screen.getByTestId('settings-console-keyboard')).toBeInTheDocument()
    expect(screen.getByTestId('settings-keyboard-layer')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-console-quick-0'))
    expect(consoleInput.value).toBe('G28')

    fireEvent.click(screen.getByTestId('settings-console-send-button'))
    expect(screen.getByTestId('settings-console-notice')).toHaveTextContent('Команда отправлена: G28')
    expect(screen.getByText('G28', { selector: 'strong' })).toBeInTheDocument()
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
