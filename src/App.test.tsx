import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { getPrinterSnapshot, setPrinterSnapshot } from './core/store/printerStore'
import {
  clearMockCommandFailure,
  clearMockNetworkRuntime,
  clearMockTransportSnapshot,
  createMockSnapshot,
  getMockCommandOperations,
  getMockNetworkOperations,
  setMockCommandFailure,
  setMockNetworkStatus,
  setMockTransportSnapshot,
} from '../mocks/runtime'
import type { PrinterSnapshot } from './core/transport/types'

function applyPrinterSnapshot(nextSnapshot: PrinterSnapshot): void {
  setMockTransportSnapshot(nextSnapshot)
  act(() => {
    setPrinterSnapshot(nextSnapshot)
  })
}

beforeEach(() => {
  act(() => {
    setPrinterSnapshot(createMockSnapshot())
  })
})

afterEach(() => {
  cleanup()
  clearMockCommandFailure()
  clearMockNetworkRuntime()
  clearMockTransportSnapshot()
})

describe('App', () => {
  it('renders idle placeholder on dashboard before print start', async () => {
    render(<App />)

    expect(screen.getByTestId('screen-shell')).toBeInTheDocument()
    expect(screen.getByText('TreeD')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Статус Wi-Fi' })).toBeInTheDocument()
    expect(screen.getByTestId('screen-dashboard-idle')).toBeInTheDocument()
    expect(screen.getByText(/Экосистема/i)).toBeInTheDocument()
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
  }, 10000)

  it('returns to waiting state after print cancel', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))
    fireEvent.click(screen.getAllByTestId('print-file-card')[0])

    await waitFor(() => {
      expect((screen.getByTestId('print-file-start-button') as HTMLButtonElement).disabled).toBe(false)
    })

    fireEvent.click(screen.getByTestId('print-file-start-button'))

    await waitFor(() => {
      expect(screen.queryByTestId('print-file-modal')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Стоп' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Стоп' }))
    expect(screen.getByTestId('print-cancel-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('print-cancel-confirm-button'))

    await waitFor(() => {
      expect(screen.getByTestId('screen-dashboard-idle')).toBeInTheDocument()
    })
    expect(screen.getByTestId('screen-dashboard-idle')).toBeInTheDocument()
  })

  it('switches print state between pause and print from the pause button', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))
    fireEvent.click(screen.getAllByTestId('print-file-card')[0])

    await waitFor(() => {
      expect((screen.getByTestId('print-file-start-button') as HTMLButtonElement).disabled).toBe(false)
    })

    fireEvent.click(screen.getByTestId('print-file-start-button'))

    await waitFor(() => {
      expect(screen.queryByTestId('print-file-modal')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Стоп' })).toBeInTheDocument()
    })

    const actionButtons = screen.getAllByRole('button')
    const pauseActionButton = actionButtons.find((button) => button.getAttribute('aria-label') === 'Пауза')

    expect(pauseActionButton).toBeDefined()
    expect(pauseActionButton?.querySelector('.ui-icon-mask')).toHaveStyle({
      maskImage: expect.stringContaining('action-pause.svg'),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Пауза' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Продолжить' })).toBeInTheDocument()
    })

    const resumeActionButton = screen.getByRole('button', { name: 'Продолжить' })
    expect(resumeActionButton.querySelector('.ui-icon-mask')).toHaveStyle({
      maskImage: expect.stringContaining('action-resume.svg'),
    })

    fireEvent.click(resumeActionButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Пауза' })).toBeInTheDocument()
    })
  }, 20000)

  it('opens numeric keyboard for temperature input and applies value', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))
    fireEvent.click(screen.getAllByTestId('print-file-card')[0])
    fireEvent.click(screen.getByTestId('print-file-start-button'))

    await waitFor(() => {
      expect(screen.getByTestId('print-tune-group-nozzle')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('print-tune-group-nozzle'))

    const nozzleInput = screen.getByTestId('print-tune-temp-nozzle-input') as HTMLInputElement
    fireEvent.focus(nozzleInput)
    expect(screen.getByRole('button', { name: 'Ввод' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Стереть' }))
    fireEvent.click(screen.getByRole('button', { name: 'Стереть' }))
    fireEvent.click(screen.getByRole('button', { name: 'Стереть' }))
    fireEvent.click(screen.getByRole('button', { name: 'Цифра 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Цифра 4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Цифра 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ввод' }))

    await waitFor(() => {
      expect((screen.getByTestId('print-tune-temp-nozzle-input') as HTMLInputElement).value).toBe('240')
    })
    expect(screen.queryByRole('button', { name: 'Ввод' })).not.toBeInTheDocument()
  }, 20000)

  it('routes print tune speed and Z-offset controls through printer commands', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))
    fireEvent.click(screen.getAllByTestId('print-file-card')[0])
    fireEvent.click(screen.getByTestId('print-file-start-button'))

    await waitFor(() => {
      expect(screen.getByTestId('print-tune-group-speed')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('print-tune-group-speed'))
    fireEvent.click(screen.getByTestId('print-tune-speed-plus'))

    await waitFor(() => {
      expect(getMockCommandOperations()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            command: 'setPrintSpeedFactorPercent',
            percent: 105,
          }),
        ]),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    fireEvent.click(screen.getByRole('button', { name: 'Babystep плюс 0.05' }))

    await waitFor(() => {
      expect(getMockCommandOperations()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            command: 'adjustZOffset',
            deltaMm: 0.05,
          }),
        ]),
      )
    })
  }, 20000)

  it('switches between screens from bottom navigation', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))

    expect(screen.getByTestId('screen-files')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Статус Wi-Fi' })).not.toBeInTheDocument()
    expect(screen.getByText('Прокрутите вниз, чтобы найти нужную модель.')).toBeInTheDocument()
    expect(screen.queryByText(/Экран файлов подключен в каркас маршрутизации/i)).not.toBeInTheDocument()
    expect(screen.getAllByTestId('print-file-card')).toHaveLength(12)

    const sortByNameButton = screen.getByRole('button', { name: 'По имени' })
    const sortByAddedAtButton = screen.getByRole('button', { name: 'По дате' })

    expect(sortByNameButton).toHaveAttribute('aria-pressed', 'true')
    expect(sortByAddedAtButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByTestId('print-file-card')[0]).toHaveTextContent('bearing_bracket_mk2.gcode')

    fireEvent.click(sortByAddedAtButton)

    expect(sortByAddedAtButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByTestId('print-file-card')[0]).toHaveTextContent('fan_shroud_prototype.gcode')
    expect(screen.getByText('2 ч 15 мин')).toBeInTheDocument()
    expect(screen.getByText('34 г')).toBeInTheDocument()
  }, 10000)

  it('renders control widgets and switches parking mode to specific axis', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Управление' }))

    expect(screen.getByTestId('screen-control')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Статус Wi-Fi' })).not.toBeInTheDocument()
    expect(screen.getByTestId('control-group-movement')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('control-menu-mode-toggle')).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByTestId('control-menu-mode-toggle'))
    expect(screen.getByTestId('control-menu-mode-toggle')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByTestId('control-menu-mode-toggle'))
    expect(screen.getByTestId('control-menu-mode-toggle')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('control-active-tab-label')).toHaveTextContent('Перемещение')
    expect(screen.getByRole('heading', { name: 'Парковка' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Сервисный режим' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Подсветка' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Оси' })).toBeInTheDocument()
    expect(screen.queryByTestId('parking-action-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('service-mode-button')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Отключить моторы' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Загрузить филамент' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Выгрузить филамент' })).toBeInTheDocument()

    const parkingAllButton = screen.getByTestId('parking-mode-all')
    const parkingAxisXButton = screen.getByTestId('parking-axis-X')

    expect(parkingAllButton).toHaveAttribute('aria-pressed', 'false')
    expect(parkingAxisXButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(parkingAxisXButton)

    expect(parkingAllButton).toHaveAttribute('aria-pressed', 'false')
    expect(parkingAxisXButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Парковка оси X' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(parkingAxisXButton).toHaveAttribute('aria-pressed', 'false')
    }, { timeout: 1500 })

    const serviceModeButton = screen.getByTestId('service-mode-button')
    fireEvent.click(serviceModeButton)
    expect(serviceModeButton).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => {
      expect(serviceModeButton).toHaveAttribute('aria-pressed', 'false')
    }, { timeout: 1500 })

    fireEvent.click(screen.getByTestId('control-group-heating'))
    expect(screen.getByTestId('control-active-tab-label')).toHaveTextContent('Нагрев')
    expect(screen.getByRole('heading', { name: 'Сопло' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Стол' })).toBeInTheDocument()
    expect(screen.getByTestId('control-heating-nozzle-input')).toBeInTheDocument()
    expect(screen.getByTestId('control-heating-bed-input')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('control-group-fans'))
    expect(screen.getByTestId('control-active-tab-label')).toHaveTextContent('Вентиляторы')
    expect(screen.getByRole('heading', { name: 'Обдув модели' })).toBeInTheDocument()
    expect(screen.getByTestId('control-fan-slider')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('control-group-lighting'))
    expect(screen.getByTestId('control-active-tab-label')).toHaveTextContent('Освещение')
    expect(screen.getByRole('heading', { name: 'Подсветка' })).toBeInTheDocument()
    expect(screen.getByTestId('control-light-main')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('control-light-toolhead')).toHaveAttribute('aria-pressed', 'false')
    const mainLightButton = screen.getByTestId('control-light-main')
    fireEvent.click(mainLightButton)
    expect(mainLightButton).toHaveAttribute('aria-pressed', 'true')

    const toolheadLightButton = screen.getByTestId('control-light-toolhead')
    fireEvent.click(toolheadLightButton)
    expect(toolheadLightButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByTestId('control-group-movement'))
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
  }, 20000)

  it('blocks axis movement during active print with shared command catalog reason', async () => {
    render(<App />)

    await waitFor(() => {
      expect(getPrinterSnapshot().connection).toBe('online')
    })

    const previousSnapshot = getPrinterSnapshot()

    try {
      applyPrinterSnapshot({
        ...previousSnapshot,
        source: 'live',
        state: 'printing',
        printJob: {
          ...previousSnapshot.printJob,
          filename: 'bearing_bracket_mk2.gcode',
          state: 'printing',
          isActive: true,
          isPaused: false,
        },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Управление' }))

      const moveXPlusButton = screen.getByRole('button', { name: 'Сдвиг X в плюс' })
      expect(moveXPlusButton.getAttribute('aria-disabled')).toBe('true')

      fireEvent.click(moveXPlusButton)

      expect((await screen.findByTestId('movement-lock-popup')).textContent).toContain(
        'Перемещение оси: движение недоступно во время печати.',
      )

      await waitFor(() => {
        expect(screen.getByTestId('motors-disable-button')).toHaveAttribute('aria-disabled', 'true')
      })

      fireEvent.click(screen.getByTestId('motors-disable-button'))

      await waitFor(() => {
        expect(
          screen
            .getAllByTestId('movement-lock-popup')
            .some((popup) => popup.textContent?.includes('Отключить моторы: движение недоступно во время печати.')),
        ).toBe(true)
      })
    } finally {
      applyPrinterSnapshot(previousSnapshot)
    }
  })

  it('blocks parking during active print with shared command catalog reason', async () => {
    render(<App />)

    await waitFor(() => {
      expect(getPrinterSnapshot().connection).toBe('online')
    })

    const previousSnapshot = getPrinterSnapshot()

    try {
      applyPrinterSnapshot({
        ...previousSnapshot,
        source: 'live',
        state: 'printing',
        printJob: {
          ...previousSnapshot.printJob,
          filename: 'bearing_bracket_mk2.gcode',
          state: 'printing',
          isActive: true,
          isPaused: false,
        },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Управление' }))

      const parkingAllButton = screen.getByTestId('parking-mode-all')
      expect(parkingAllButton.getAttribute('aria-disabled')).toBe('true')

      fireEvent.click(parkingAllButton)

      expect((await screen.findByTestId('movement-lock-popup')).textContent).toContain(
        'Home all: движение недоступно во время печати.',
      )
    } finally {
      applyPrinterSnapshot(previousSnapshot)
    }
  })

  it('blocks heating presets without thermal capability with shared command catalog reason', async () => {
    render(<App />)

    await waitFor(() => {
      expect(getPrinterSnapshot().connection).toBe('online')
    })

    const previousSnapshot = getPrinterSnapshot()

    try {
      applyPrinterSnapshot({
        ...previousSnapshot,
        capabilities: {
          ...previousSnapshot.capabilities,
          thermal: false,
        },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Управление' }))
      fireEvent.click(screen.getByTestId('control-group-heating'))

      const plaPresetButton = screen.getByTestId('control-heating-preset-pla')
      expect(plaPresetButton.getAttribute('aria-disabled')).toBe('true')

      fireEvent.click(plaPresetButton)

      expect((await screen.findByTestId('heating-lock-popup')).textContent).toContain(
        'Нагрев сопла: capability «нагрев» не подтвержден.',
      )
    } finally {
      applyPrinterSnapshot(previousSnapshot)
    }
  })

  it('blocks fan controls without fan capability with shared command catalog reason', async () => {
    render(<App />)

    await waitFor(() => {
      expect(getPrinterSnapshot().connection).toBe('online')
    })

    const previousSnapshot = getPrinterSnapshot()

    try {
      applyPrinterSnapshot({
        ...previousSnapshot,
        capabilities: {
          ...previousSnapshot.capabilities,
          fan: false,
        },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Управление' }))
      fireEvent.click(screen.getByTestId('control-group-fans'))

      const increaseFanButton = screen.getByRole('button', { name: 'Увеличить скорость вентилятора на 5 процентов' })
      expect(increaseFanButton.getAttribute('aria-disabled')).toBe('true')

      fireEvent.click(increaseFanButton)

      expect((await screen.findByTestId('fan-lock-popup')).textContent).toContain(
        'Обдув модели: capability «обдув» не подтвержден.',
      )
    } finally {
      applyPrinterSnapshot(previousSnapshot)
    }
  })

  it('keeps macros tab empty after removing temporary implementation', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Макросы' }))

    expect(screen.getByTestId('screen-macros')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Макросы' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('screen-macros').textContent).toBe('')
    expect(screen.queryByTestId('macros-group-bedMesh')).not.toBeInTheDocument()
    expect(screen.queryByTestId('macros-bed-manual-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('macros-bed-auto-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('macros-bed-zoffset-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('macros-bed-map-workspace')).not.toBeInTheDocument()
    expect(screen.queryByTestId('macros-bed-intro-modal')).not.toBeInTheDocument()
    expect(screen.queryByTestId('macros-zoffset-value')).not.toBeInTheDocument()
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
    expect(screen.getByTestId('print-progress-summary')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))
    fireEvent.click(screen.getAllByTestId('print-file-card')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Удалить файл' }))

    await waitFor(() => {
      expect(screen.queryByTestId('print-file-modal')).not.toBeInTheDocument()
      expect(screen.getAllByTestId('print-file-card')).toHaveLength(initialCards.length - 1)
    })
  }, 10000)

  it('shows shared command catalog reason when print start is blocked', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))
    fireEvent.click(screen.getAllByTestId('print-file-card')[0])
    fireEvent.click(screen.getByTestId('print-file-start-button'))

    await waitFor(() => {
      expect(screen.queryByTestId('print-file-modal')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Стоп' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))
    fireEvent.click(screen.getAllByTestId('print-file-card')[0])

    const fileDialog = screen.getByRole('dialog', { name: 'Файл печати' })
    const startButton = within(fileDialog).getByRole('button', { name: 'Старт печати' })

    expect(startButton).toBeDisabled()
    expect(within(fileDialog).getByTestId('print-file-start-notice')).toHaveTextContent(
      'Старт печати: уже есть активная печать.',
    )
  }, 10000)

  it('keeps print file modal open and shows command error when print start fails', async () => {
    setMockCommandFailure('start', 'Mock: start failed')
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Файлы' }))
    fireEvent.click(screen.getAllByTestId('print-file-card')[0])
    fireEvent.click(screen.getByTestId('print-file-start-button'))

    await waitFor(() => {
      expect(screen.getByTestId('print-file-modal')).toBeInTheDocument()
      expect(screen.getByTestId('print-file-start-notice')).toHaveTextContent('Mock: start failed')
    })
    expect(screen.queryByRole('button', { name: 'Стоп' })).not.toBeInTheDocument()
  }, 10000)

  it('opens Wi-Fi popup with network details and navigates to settings', async () => {
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
    expect(screen.queryByRole('button', { name: 'Статус Wi-Fi' })).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-group-network')).toHaveAttribute('aria-pressed', 'true')
    const wifiSearchInput = screen.getByTestId('settings-network-search') as HTMLInputElement
    expect(wifiSearchInput).toBeDisabled()
    fireEvent.focus(wifiSearchInput)
    expect(screen.queryByTestId('settings-wifi-search-keyboard')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-keyboard-layer')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-wifi-search-keyboard')).not.toBeInTheDocument()

    expect(screen.getByTestId('settings-network-scan')).toBeDisabled()
    expect(screen.queryByTestId('settings-network-item-office-main-5g')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-network-connect-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-network-forget-button')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('settings-network-notice')).toHaveTextContent('network bridge недоступен')
    })
    expect(screen.queryByText('Текущая сеть')).not.toBeInTheDocument()
    expect(screen.queryByTestId('top-popup-wifi')).not.toBeInTheDocument()
  })

  it('enables Wi-Fi controls through host network runtime and opens password keyboard', async () => {
    setMockNetworkStatus({
      available: true,
      ssid: null,
      ipAddress: null,
      message: 'Mock network bridge ready',
      networks: [
        {
          id: 'office-main-5g',
          ssid: 'Office_Main_5G',
          signalPercent: 73,
          security: 'wpa2',
          saved: true,
          connected: false,
        },
      ],
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    fireEvent.click(screen.getByTestId('settings-group-network'))

    await waitFor(() => {
      expect(screen.getByTestId('settings-network-scan')).not.toBeDisabled()
    })

    fireEvent.click(screen.getByTestId('settings-network-item-office-main-5g'))
    const passwordInput = screen.getByTestId('settings-network-password-input') as HTMLInputElement
    fireEvent.focus(passwordInput)
    expect(screen.getByTestId('settings-wifi-keyboard')).toBeInTheDocument()

    fireEvent.change(passwordInput, { target: { value: '12345678' } })
    fireEvent.click(screen.getByTestId('settings-network-connect-button'))

    await waitFor(() => {
      expect(getMockNetworkOperations()).toContain('connect:Office_Main_5G')
    })
  })

  it('renders extended settings sections and handles interactions', async () => {
    render(<App />)

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

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
    expect(screen.getByTestId('settings-cloud-connect-toggle')).toBeDisabled()
    expect(screen.getByTestId('settings-cloud-ai-toggle')).toBeDisabled()
    expect(screen.getByText(/cloud capability не подтвержден/i)).toBeInTheDocument()
    expect(screen.getByText('Выключен')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-group-device'))
    expect(screen.getByRole('heading', { name: 'Об устройстве' })).toBeInTheDocument()
    expect(screen.getByText('Rock Pi / Armbian Debian 12')).toBeInTheDocument()
    expect(screen.getByText('Octopus Pro CAN')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-group-updates'))
    expect(screen.getByTestId('settings-check-updates-button')).toBeDisabled()
    expect(screen.getByText(/update capability не подтвержден/i)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-group-console'))
    const consoleInput = screen.getByTestId('settings-console-input') as HTMLTextAreaElement
    fireEvent.focus(consoleInput)
    expect(screen.getByTestId('settings-console-keyboard')).toBeInTheDocument()
    expect(screen.getByTestId('settings-keyboard-layer')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-console-quick-0'))
    expect(consoleInput.value).toBe('G28')

    fireEvent.click(screen.getByTestId('settings-console-send-button'))
    expect(screen.getByTestId('settings-console-notice')).toHaveTextContent('подтверждения')

    fireEvent.click(screen.getByTestId('settings-console-send-button'))
    await waitFor(() => {
      expect(screen.getByTestId('settings-console-notice')).toHaveTextContent('Команда отправлена: G28')
      expect(getMockCommandOperations()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ command: 'consoleGcode', gcode: 'G28' }),
        ]),
      )
    })
    expect(screen.getByText('G28', { selector: 'strong' })).toBeInTheDocument()
  })

  it('shows disabled cloud capability state instead of QR redirect', () => {
    render(<App />)

    const cloudButton = screen.getByRole('button', { name: 'Статус облака' })
    fireEvent.click(cloudButton)

    expect(screen.getByRole('dialog', { name: 'Состояние облака' })).toBeInTheDocument()
    expect(cloudButton).toHaveClass('is-active')
    expect(screen.getByText('Недоступно')).toBeInTheDocument()
    expect(screen.getByText(/cloud capability не подтвержден/i)).toBeInTheDocument()

    expect(screen.queryByRole('link', { name: 'Открыть treed.pro для добавления устройства' })).not.toBeInTheDocument()
  })

  it('shows disabled power capability state in power popup', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Питание' }))

    expect(screen.getByRole('dialog', { name: 'Питание и перезапуск' })).toBeInTheDocument()

    const rebootHostButton = screen.getByRole('button', { name: 'Перезагрузить host' })
    const shutdownHostButton = screen.getByRole('button', { name: 'Выключить host' })

    expect(rebootHostButton).toHaveAttribute('aria-disabled', 'true')
    expect(rebootHostButton).toHaveAttribute('title', 'Перезагрузка host: capability «питание host» не подтвержден.')
    expect(shutdownHostButton).toHaveAttribute('aria-disabled', 'true')
    expect(shutdownHostButton).toHaveAttribute('title', 'Выключение host: capability «питание host» не подтвержден.')
  })

  it('requires repeated confirm before enabled power and service commands execute', async () => {
    render(<App />)

    await waitFor(() => {
      expect(getPrinterSnapshot().connection).toBe('online')
    })

    const enableSystemCapabilities = () => {
      const snapshot = getPrinterSnapshot()
      applyPrinterSnapshot({
        ...snapshot,
        capabilities: {
          ...snapshot.capabilities,
          power: true,
          systemPower: true,
          serviceCommands: true,
        },
      })
    }

    enableSystemCapabilities()

    fireEvent.click(screen.getByRole('button', { name: 'Питание' }))

    const restartKlipperButton = screen.getByRole('button', { name: 'Restart Klipper' })

    expect(restartKlipperButton).not.toBeDisabled()
    expect(restartKlipperButton).toHaveAttribute('aria-disabled', 'false')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Выключить host' })).toHaveAttribute('aria-disabled', 'false')
    })

    const shutdownHostButton = screen.getByRole('button', { name: 'Выключить host' })
    const commandCountBeforeConfirm = getMockCommandOperations().length
    fireEvent.click(shutdownHostButton)
    expect(getMockCommandOperations()).toHaveLength(commandCountBeforeConfirm)
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить: Выключить host' }))

    await waitFor(() => {
      expect(getMockCommandOperations()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            command: 'shutdownHost',
          }),
        ]),
      )
    })
    expect(screen.getByText('Команда отправлена: Выключить host.')).toBeInTheDocument()
  })
})
