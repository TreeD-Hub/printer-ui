import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePrinterCommands } from './core/commands'
import { usePrinterSnapshot } from './core/store/usePrinterSnapshot'
import {
  BABYSTEP_STEP_OPTIONS,
  BOTTOM_NAV_ITEMS,
  DASHBOARD_VALUES,
  PROCESS_METRIC_DEFINITIONS,
  QUICK_METRIC_DEFINITIONS,
  type ScreenId,
  TEMPERATURE_METRIC_DEFINITIONS,
  TOP_STATUS_BUTTONS,
  type TopStatusButtonId,
} from './dashboard/config'
import {
  calculatePreviewZoom,
  clampPercent,
  resolvePreviewSettings,
  rounded,
  statusLabel,
} from './dashboard/helpers'
import {
  ActionSquareButton,
  NavItemButton,
  PlainMetric,
  PrintPreviewIcon,
  StatusIconButton,
  TemperatureMetric,
} from './ui'
import './App.css'

const SCREEN_QUERY_KEY = 'screen'
const DEFAULT_SCREEN: ScreenId = 'dashboard'
const CLOUD_LINK_URL = 'https://treed.pro'
const CLOUD_QR_IMAGE_URL = 'https://api.qrserver.com/v1/create-qr-code/?size=144x144&data=https%3A%2F%2Ftreed.pro'
const TOP_POPUP_MAX_WIDTH = 360
const TOP_POPUP_GAP = 8
const TOP_POPUP_SIDE_PADDING = 8
const TOP_POPUP_ARROW_EDGE = 18
const FALLBACK_SCREEN_WIDTH = 960
const TOP_BAR_BUTTON_SIZE = 56
const TOP_BAR_BUTTON_GAP = 8
const TOP_BAR_RIGHT_PADDING = 24
const TOP_BAR_POPUP_TITLES: Record<TopStatusButtonId, string> = {
  wifi: 'Состояние Wi-Fi',
  cloud: 'Состояние облака',
  notifications: 'Уведомления',
  power: 'Выключение принтера',
}
type TopPopupPosition = {
  top: number
  left: number
  arrowLeft: number
}

function resolveFallbackAnchorCenterX(id: TopStatusButtonId, screenWidth: number): number {
  const buttonIndex = TOP_STATUS_BUTTONS.findIndex((item) => item.id === id)
  const buttonsFromRight = TOP_STATUS_BUTTONS.length - 1 - Math.max(0, buttonIndex)
  return (
    screenWidth -
    TOP_BAR_RIGHT_PADDING -
    (TOP_BAR_BUTTON_SIZE / 2) -
    (buttonsFromRight * (TOP_BAR_BUTTON_SIZE + TOP_BAR_BUTTON_GAP))
  )
}

const SCREEN_PLACEHOLDERS: Record<Exclude<ScreenId, 'dashboard'>, { title: string; description: string }> = {
  control: {
    title: 'Управление',
    description: 'Раздел управления принтером подключен в навигацию и готов к наполнению рабочими блоками.',
  },
  files: {
    title: 'Файлы',
    description: 'Экран файлов подключен в каркас маршрутизации. Здесь будет список G-code и операции запуска печати.',
  },
  macros: {
    title: 'Макросы',
    description: 'Экран макросов подключен в каркас маршрутизации. Здесь будут быстрые сценарии и сервисные команды.',
  },
  settings: {
    title: 'Настройки',
    description: 'Экран настроек подключен в каркас маршрутизации. Здесь будут параметры UI и подключения к Moonraker.',
  },
}

function resolveScreenFromSearch(search: string): ScreenId {
  const value = (new URLSearchParams(search).get(SCREEN_QUERY_KEY) ?? '').toLowerCase()
  if (BOTTOM_NAV_ITEMS.some((item) => item.id === value)) {
    return value as ScreenId
  }
  return DEFAULT_SCREEN
}

function syncScreenToUrl(screen: ScreenId): void {
  if (typeof window === 'undefined') {
    return
  }

  const params = new URLSearchParams(window.location.search)
  if (screen === DEFAULT_SCREEN) {
    params.delete(SCREEN_QUERY_KEY)
  } else {
    params.set(SCREEN_QUERY_KEY, screen)
  }

  const search = params.toString()
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`

  if (nextUrl !== currentUrl) {
    window.history.replaceState(window.history.state, '', nextUrl)
  }
}

function App() {
  const { snapshot, refresh } = usePrinterSnapshot()
  const { pendingCommand, executeCommand } = usePrinterCommands()
  const screenShellRef = useRef<HTMLElement | null>(null)
  const topButtonRefs = useRef<Record<TopStatusButtonId, HTMLButtonElement | null>>({
    wifi: null,
    cloud: null,
    notifications: null,
    power: null,
  })
  const [babystepStep, setBabystepStep] = useState<number>(BABYSTEP_STEP_OPTIONS[1])
  const [activeTopPopup, setActiveTopPopup] = useState<TopStatusButtonId | null>(null)
  const [powerPopupNotice, setPowerPopupNotice] = useState<string>('')
  const [topPopupPosition, setTopPopupPosition] = useState<TopPopupPosition | null>(null)
  const [activeScreen, setActiveScreen] = useState<ScreenId>(() =>
    resolveScreenFromSearch(typeof window === 'undefined' ? '' : window.location.search),
  )
  const previewSettings = useMemo(
    () => resolvePreviewSettings(typeof window === 'undefined' ? '' : window.location.search),
    [],
  )
  const hasPreviewScale = previewSettings.mode !== 'none'
  const previewZoom = useMemo(
    () =>
      calculatePreviewZoom(
        previewSettings,
        typeof window === 'undefined' ? 1 : (window.devicePixelRatio ?? 1),
      ),
    [previewSettings],
  )
  const previewStyle: CSSProperties | undefined = hasPreviewScale
    ? ({ '--preview-zoom': String(previewZoom) } as CSSProperties)
    : undefined

  const printFill = Math.max(0, Math.min(100, DASHBOARD_VALUES.progressPercent))
  const isBusy = pendingCommand !== null
  const activeNavIndex = Math.max(
    0,
    BOTTOM_NAV_ITEMS.findIndex((item) => item.id === activeScreen),
  )
  const formattedSnapshotTime = useMemo(() => {
    const parsed = new Date(snapshot.updatedAt)
    if (Number.isNaN(parsed.getTime())) {
      return '—'
    }
    return parsed.toLocaleTimeString('ru-RU')
  }, [snapshot.updatedAt])
  const connectionLabel = snapshot.connection === 'online' ? 'Подключено' : 'Офлайн'
  const wifiSsidLabel = snapshot.connection === 'online' ? snapshot.wifiSsid : 'Не подключено'
  const wifiIpLabel = snapshot.connection === 'online' ? snapshot.ipAddress : '—'
  const cloudStatusLabel = snapshot.connection === 'online' ? 'В сети' : 'Не в сети'

  const temperatureValueByKey = {
    nozzle: snapshot.extruderTemp,
    bed: snapshot.bedTemp,
  } as const

  const temperatureMetrics = TEMPERATURE_METRIC_DEFINITIONS.map((definition) => {
    const currentValue = temperatureValueByKey[definition.key]

    return {
      ...definition,
      current: rounded(currentValue),
      fillPercent: clampPercent(currentValue, definition.target),
    }
  })

  const quickMetricValueByKey = {
    volumetricFlow: DASHBOARD_VALUES.volumetricFlowMm3S,
    fan: rounded(snapshot.modelFanPercent),
    flow: DASHBOARD_VALUES.flowPercent,
  } as const

  const quickMetrics = QUICK_METRIC_DEFINITIONS.map((definition) => ({
    ...definition,
    value: quickMetricValueByKey[definition.key],
  }))

  const processMetricValueByKey = {
    speed: DASHBOARD_VALUES.speedMmS,
    accel: DASHBOARD_VALUES.accelMmS2,
    kFactor: DASHBOARD_VALUES.kFactorLaPa,
    retract: DASHBOARD_VALUES.retractMm,
  } as const

  const processMetrics = PROCESS_METRIC_DEFINITIONS.map((definition) => ({
    ...definition,
    value: processMetricValueByKey[definition.key],
  }))

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePopstate = () => {
      setActiveScreen(resolveScreenFromSearch(window.location.search))
    }

    window.addEventListener('popstate', handlePopstate)
    return () => {
      window.removeEventListener('popstate', handlePopstate)
    }
  }, [])

  useEffect(() => {
    syncScreenToUrl(activeScreen)
  }, [activeScreen])

  const closeTopPopup = useCallback(() => {
    setActiveTopPopup(null)
    setTopPopupPosition(null)
  }, [])

  const resolveTopPopupPosition = useCallback((id: TopStatusButtonId): TopPopupPosition => {
    const shellElement = screenShellRef.current
    const anchorButton = topButtonRefs.current[id]
    const shellRect = shellElement?.getBoundingClientRect()
    const anchorRect = anchorButton?.getBoundingClientRect()
    const shellWidth = shellRect && shellRect.width > 0 ? shellRect.width : FALLBACK_SCREEN_WIDTH
    const popupWidth = Math.min(TOP_POPUP_MAX_WIDTH, shellWidth - (TOP_POPUP_SIDE_PADDING * 2))

    const anchorCenterX =
      shellRect && anchorRect && shellRect.width > 0 && anchorRect.width > 0
        ? anchorRect.left - shellRect.left + (anchorRect.width / 2)
        : resolveFallbackAnchorCenterX(id, shellWidth)

    let left = anchorCenterX - (popupWidth / 2)
    left = Math.max(TOP_POPUP_SIDE_PADDING, Math.min(left, shellWidth - popupWidth - TOP_POPUP_SIDE_PADDING))

    const arrowLeft = Math.max(
      TOP_POPUP_ARROW_EDGE,
      Math.min(anchorCenterX - left, popupWidth - TOP_POPUP_ARROW_EDGE),
    )

    return {
      top: TOP_POPUP_GAP,
      left,
      arrowLeft,
    }
  }, [])

  const openTopPopup = useCallback(
    (id: TopStatusButtonId) => {
      if (activeTopPopup === id) {
        closeTopPopup()
        return
      }
      setPowerPopupNotice('')
      setTopPopupPosition(resolveTopPopupPosition(id))
      setActiveTopPopup(id)
    },
    [activeTopPopup, closeTopPopup, resolveTopPopupPosition],
  )

  const openWifiSettings = useCallback(() => {
    setActiveScreen('settings')
    closeTopPopup()
  }, [closeTopPopup])

  useEffect(() => {
    if (activeTopPopup === null || typeof window === 'undefined') {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTopPopup()
      }
    }

    const handleResize = () => {
      setTopPopupPosition(resolveTopPopupPosition(activeTopPopup))
    }

    window.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', handleResize)
    }
  }, [activeTopPopup, closeTopPopup, resolveTopPopupPosition])

  function setTopButtonRef(id: TopStatusButtonId, node: HTMLButtonElement | null): void {
    topButtonRefs.current[id] = node
  }

  function handlePowerShutdownPlaceholder(): void {
    setPowerPopupNotice('Команда выключения пока не подключена к backend.')
  }

  async function handlePause(): Promise<void> {
    const ok = await executeCommand({ command: 'pause' })
    if (ok) {
      await refresh()
    }
  }

  async function handleStop(): Promise<void> {
    const ok = await executeCommand({ command: 'cancel' })
    if (ok) {
      await refresh()
    }
  }

  return (
    <main className={`app-root ${hasPreviewScale ? 'is-one-to-one' : ''}`} style={previewStyle}>
      <section className="screen-shell" data-testid="screen-shell" ref={screenShellRef}>
        <header className="top-bar">
          <div className="brand-wrap">
            <h1>TreeD Принтер</h1>
            <span className="print-state">{statusLabel(snapshot.state)}</span>
          </div>
          <div className="top-icons" aria-label="иконки статуса">
            {TOP_STATUS_BUTTONS.map((item) => (
              <StatusIconButton
                key={item.id}
                icon={item.icon}
                label={item.label}
                tone={item.tone}
                showNotificationDot={item.showNotificationDot}
                className={activeTopPopup === item.id ? 'is-active' : undefined}
                aria-haspopup="dialog"
                aria-expanded={activeTopPopup === item.id}
                onClick={() => openTopPopup(item.id)}
                ref={(node) => setTopButtonRef(item.id, node)}
              />
            ))}
          </div>
        </header>

        <div className="content-grid">
          {activeScreen === 'dashboard' ? (
            <>
              <section className="job-card">
                <div className="preview-panel">
                  <div className="preview-inner">
                    <PrintPreviewIcon />
                  </div>
                </div>

                <div className="job-info">
                  <p className="job-name">{DASHBOARD_VALUES.fileName}</p>

                  <div className="job-metrics">
                    <div>
                      <p className="label">Прогресс</p>
                      <p className="job-main-value">{DASHBOARD_VALUES.progressPercent}%</p>
                    </div>
                    <div className="job-metrics-right">
                      <p className="label">Конец</p>
                      <p className="job-main-value">{DASHBOARD_VALUES.etaTime}</p>
                    </div>
                  </div>

                  <div className="job-meter">
                    <div className="job-meter-fill" style={{ width: `${printFill}%` }} />
                  </div>

                  <div className="job-layer-row">
                    <span className="label">Слой</span>
                    <strong>
                      {DASHBOARD_VALUES.layerCurrent} / {DASHBOARD_VALUES.layerTotal}
                    </strong>
                  </div>
                </div>
              </section>

              <section className="right-column">
                <div className="stats-actions-row">
                  <article className="stats-card">
                    <div className="temp-grid">
                      {temperatureMetrics.map((metric) => (
                        <TemperatureMetric
                          key={metric.label}
                          label={metric.label}
                          current={metric.current}
                          target={metric.target}
                          meterTone={metric.meterTone}
                          fillPercent={metric.fillPercent}
                        />
                      ))}
                    </div>

                    <div className="three-up-grid">
                      {quickMetrics.map((metric) => (
                        <PlainMetric
                          key={metric.label}
                          label={metric.label}
                          value={metric.value}
                          unit={metric.unit}
                          valueClassName={metric.valueClassName}
                        />
                      ))}
                    </div>
                  </article>

                  <div className="action-stack" role="group" aria-label="действия печати">
                    <ActionSquareButton
                      icon="actionPause"
                      label={pendingCommand === 'pause' ? 'Пауза...' : 'Пауза'}
                      onClick={() => void handlePause()}
                      disabled={isBusy}
                    />
                    <ActionSquareButton
                      icon="actionStopCritical"
                      tone="danger"
                      label={pendingCommand === 'cancel' ? 'Стоп...' : 'Стоп'}
                      onClick={() => void handleStop()}
                      disabled={isBusy}
                    />
                  </div>
                </div>

                <div className="process-row">
                  <article className="process-card">
                    <div className="process-grid">
                      {processMetrics.map((metric) => (
                        <PlainMetric
                          key={metric.label}
                          label={metric.label}
                          value={metric.value}
                          unit={metric.unit}
                          valueClassName="process-value"
                        />
                      ))}
                    </div>
                  </article>

                  <aside className="zoffset-card">
                    <div className="zoffset-head">
                      <p className="label">Z-offset</p>
                      <p className="value zoffset-value">
                        {DASHBOARD_VALUES.zOffsetMm.toFixed(2)}<span>мм</span>
                      </p>
                    </div>
                    <div
                      className="step-selector"
                      role="group"
                      aria-label="шаг babystep"
                    >
                      {BABYSTEP_STEP_OPTIONS.map((step) => (
                        <button
                          key={step}
                          type="button"
                          className={`step-btn ${babystepStep === step ? 'is-active' : ''}`}
                          onClick={() => setBabystepStep(step)}
                          aria-pressed={babystepStep === step}
                        >
                          {step}
                        </button>
                      ))}
                    </div>
                    <div className="babystep-controls" role="group" aria-label="управление babystep">
                      <button
                        type="button"
                        className="babystep-btn"
                        aria-label={`Babystep минус ${babystepStep}`}
                      >
                        -
                      </button>
                      <button
                        type="button"
                        className="babystep-btn"
                        aria-label={`Babystep плюс ${babystepStep}`}
                      >
                        +
                      </button>
                    </div>
                  </aside>
                </div>
              </section>
            </>
          ) : (
            <section className="screen-placeholder" data-testid={`screen-${activeScreen}`}>
              <h2 className="screen-placeholder-title">{SCREEN_PLACEHOLDERS[activeScreen].title}</h2>
              <p className="screen-placeholder-body">{SCREEN_PLACEHOLDERS[activeScreen].description}</p>
            </section>
          )}
        </div>

        <nav
          className="bottom-nav"
          aria-label="Основная навигация"
          style={{ '--nav-active-index': String(activeNavIndex) } as CSSProperties}
        >
          <span className="bottom-nav-indicator" aria-hidden="true" />
          {BOTTOM_NAV_ITEMS.map((item) => (
            <NavItemButton
              key={item.id}
              label={item.label}
              icon={item.icon}
              active={item.id === activeScreen}
              aria-current={item.id === activeScreen ? 'page' : undefined}
              onClick={() => setActiveScreen(item.id)}
            />
          ))}
        </nav>

        {activeTopPopup !== null ? (
          <div className="top-popup-layer" role="presentation" onClick={closeTopPopup}>
            <section
              className="top-popup-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="top-popup-title"
              data-testid={`top-popup-${activeTopPopup}`}
              style={
                topPopupPosition
                  ? ({
                      top: `${topPopupPosition.top}px`,
                      left: `${topPopupPosition.left}px`,
                      '--top-popup-arrow-left': `${topPopupPosition.arrowLeft}px`,
                    } as CSSProperties)
                  : undefined
              }
              onClick={(event) => event.stopPropagation()}
            >
              <header className="top-popup-head">
                <h2 id="top-popup-title">{TOP_BAR_POPUP_TITLES[activeTopPopup]}</h2>
                <button type="button" className="top-popup-close" aria-label="Закрыть окно" onClick={closeTopPopup}>
                  ×
                </button>
              </header>

              {activeTopPopup === 'wifi' ? (
                <div className="top-popup-content">
                  <dl className="top-popup-kv">
                    <div>
                      <dt>Статус сети</dt>
                      <dd>{connectionLabel}</dd>
                    </div>
                    <div>
                      <dt>Wi-Fi сеть</dt>
                      <dd>{wifiSsidLabel}</dd>
                    </div>
                    <div>
                      <dt>IP адрес</dt>
                      <dd>{wifiIpLabel}</dd>
                    </div>
                    <div>
                      <dt>Время</dt>
                      <dd>{formattedSnapshotTime}</dd>
                    </div>
                  </dl>
                  <div className="top-popup-actions">
                    <button type="button" className="top-popup-action" onClick={openWifiSettings}>
                      Перейти в настройки Wi-Fi
                    </button>
                  </div>
                </div>
              ) : null}

              {activeTopPopup === 'cloud' ? (
                <div className="top-popup-content">
                  <dl className="top-popup-kv">
                    <div>
                      <dt>Состояние</dt>
                      <dd>{cloudStatusLabel}</dd>
                    </div>
                  </dl>
                  <a
                    className="top-popup-qr-link"
                    href={CLOUD_LINK_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Открыть treed.pro для добавления устройства"
                  >
                    <img
                      className="top-popup-qr-image"
                      src={CLOUD_QR_IMAGE_URL}
                      alt="QR-код для перехода на treed.pro"
                    />
                    <span>Сканируйте QR или откройте treed.pro</span>
                  </a>
                </div>
              ) : null}

              {activeTopPopup === 'notifications' ? (
                <div className="top-popup-content">
                  <p className="top-popup-note">Последнее сообщение от принтера:</p>
                  <ul className="top-popup-list">
                    <li>{snapshot.message}</li>
                  </ul>
                  <p className="top-popup-secondary">Новые системные уведомления будут добавляться в этот список.</p>
                </div>
              ) : null}

              {activeTopPopup === 'power' ? (
                <div className="top-popup-content">
                  <p className="top-popup-warning">
                    Выключение принтера остановит текущую задачу и потребует ручного запуска питания.
                  </p>
                  <div className="top-popup-actions">
                    <button type="button" className="top-popup-action top-popup-action-danger" onClick={handlePowerShutdownPlaceholder}>
                      Выключить принтер
                    </button>
                    <button type="button" className="top-popup-action" onClick={closeTopPopup}>
                      Отмена
                    </button>
                  </div>
                  {powerPopupNotice ? <p className="top-popup-secondary">{powerPopupNotice}</p> : null}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default App
