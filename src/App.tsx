import { type CSSProperties, type ReactNode, useMemo } from 'react'
import { usePrinterCommands } from './core/commands'
import { usePrinterSnapshot } from './core/store/usePrinterSnapshot'
import './App.css'

const NOZZLE_TARGET = 220
const BED_TARGET = 60
const SPEED_PERCENT = 100
const FLOW_PERCENT = 95
const FILE_NAME = 'test_cube_v2.gcode'
const PROGRESS_PERCENT = 67
const ETA_TIME = '12:34'
const LAYER_CURRENT = 145
const LAYER_TOTAL = 218
const SCREEN_WIDTH = 960
const SCREEN_HEIGHT = 544
const CSS_PPI = 96
const DEFAULT_PHYSICAL_DIAGONAL = 5

function clampPercent(current: number, target: number): number {
  if (target <= 0) {
    return 0
  }

  const value = (current / target) * 100
  return Math.max(0, Math.min(100, value))
}

function rounded(value: number): string {
  return `${Math.round(value)}`
}

function statusLabel(raw: string): string {
  if (!raw) {
    return 'Printing'
  }

  const lower = raw.toLowerCase()

  switch (lower) {
    case 'printing':
      return 'Printing'
    case 'standby':
      return 'Standby'
    case 'paused':
      return 'Paused'
    case 'complete':
      return 'Complete'
    default:
      return raw.charAt(0).toUpperCase() + raw.slice(1)
  }
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 8.2a14.7 14.7 0 0 1 19 0" />
      <path d="M5.9 12a9.4 9.4 0 0 1 12.2 0" />
      <path d="M9.3 15.7a4.3 4.3 0 0 1 5.4 0" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function CloudIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 18h9a4 4 0 0 0 .2-8 5.4 5.4 0 0 0-10.5 1.7A3.5 3.5 0 0 0 7 18Z" />
    </svg>
  )
}

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5v7.1" />
      <path d="M7 6.2a8.5 8.5 0 1 0 10 0" />
    </svg>
  )
}

function PrintPreviewIcon() {
  return (
    <svg viewBox="0 0 132 132" aria-hidden="true">
      <path d="M19 34 79 17l10 78-60 17z" className="preview-frame" />
      <path d="M48 48 67 36 86 48 67 60z" className="preview-cube" />
      <path d="M48 48v34l19 12V60z" className="preview-cube" />
      <path d="M86 48v34L67 94V60z" className="preview-cube" />
    </svg>
  )
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1.3" />
      <rect x="14" y="4" width="6" height="6" rx="1.3" />
      <rect x="4" y="14" width="6" height="6" rx="1.3" />
      <rect x="14" y="14" width="6" height="6" rx="1.3" />
    </svg>
  )
}

function ControlIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 8h12a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-1l-2.1-3H9.1L7 17H6a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3Z" />
      <path d="M8.5 12h3" />
      <path d="M10 10.5v3" />
      <circle cx="15.8" cy="11.3" r=".9" fill="currentColor" stroke="none" />
      <circle cx="17.8" cy="13.3" r=".9" fill="currentColor" stroke="none" />
    </svg>
  )
}

function FilesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8.8a2 2 0 0 1 2-2h5l2-2h7a2 2 0 0 1 2 2v10.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

function MacrosIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m13 2.8-4.4 8.3h3.8L9.8 21.2 18.5 10h-4.1l2.6-7.2Z" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 9a3 3 0 1 1-3 3 3 3 0 0 1 3-3Z" />
      <path d="m4.5 13.6-.9-3.2 1.9-.9c.2-.6.5-1.2.9-1.7L5.6 5l2.4-1.8 1.7 1.2c.6-.2 1.2-.4 1.8-.5L12 2h3l.5 1.9c.6.1 1.2.3 1.8.5L19 3.2 21.4 5l-.8 2.8c.4.5.7 1.1.9 1.7l1.9.9-.9 3.2-2 .2a7.4 7.4 0 0 1-1 1.6l.8 2.9-2.4 1.7-1.7-1.1a7.7 7.7 0 0 1-1.8.5L15 22h-3l-.5-1.9a7.7 7.7 0 0 1-1.8-.5L8 20.7l-2.4-1.7.8-2.9a7.4 7.4 0 0 1-1-1.6z" />
    </svg>
  )
}

type NavItemProps = {
  label: string
  active?: boolean
  icon: ReactNode
}

function NavItem({ label, active = false, icon }: NavItemProps) {
  return (
    <button type="button" className={`nav-item ${active ? 'is-active' : ''}`}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

type PreviewMode = 'none' | '1x1' | 'physical'

type PreviewSettings = {
  mode: PreviewMode
  diagonalInches?: number
}

function resolvePreviewSettings(): PreviewSettings {
  if (typeof window === 'undefined') {
    return { mode: 'none' }
  }

  const params = new URLSearchParams(window.location.search)
  const view = (params.get('view') ?? '').toLowerCase()

  if (view === '1x1') {
    return { mode: '1x1' }
  }

  if (view === 'physical-5') {
    return { mode: 'physical', diagonalInches: 5 }
  }

  if (view === 'physical-6') {
    return { mode: 'physical', diagonalInches: 6 }
  }

  if (view === 'physical') {
    const rawDiagonal = Number(params.get('diag'))
    if (Number.isFinite(rawDiagonal) && rawDiagonal > 0) {
      return { mode: 'physical', diagonalInches: rawDiagonal }
    }
    return { mode: 'physical', diagonalInches: DEFAULT_PHYSICAL_DIAGONAL }
  }

  return { mode: 'none' }
}

function calculatePreviewZoom(settings: PreviewSettings): number {
  if (settings.mode === 'none' || typeof window === 'undefined') {
    return 1
  }

  const ratio = window.devicePixelRatio || 1
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 1
  }

  if (settings.mode === '1x1') {
    return 1 / ratio
  }

  const diagonalInches = settings.diagonalInches ?? DEFAULT_PHYSICAL_DIAGONAL
  const targetPpi = Math.sqrt(SCREEN_WIDTH ** 2 + SCREEN_HEIGHT ** 2) / diagonalInches
  const desktopPpiApprox = CSS_PPI * ratio
  const zoom = desktopPpiApprox / targetPpi
  return Math.max(0.2, Math.min(2, zoom))
}

function App() {
  const { snapshot, refresh } = usePrinterSnapshot()
  const { pendingCommand, executeCommand } = usePrinterCommands()
  const previewSettings = useMemo(() => resolvePreviewSettings(), [])
  const hasPreviewScale = previewSettings.mode !== 'none'
  const previewZoom = useMemo(() => calculatePreviewZoom(previewSettings), [previewSettings])
  const previewStyle: CSSProperties | undefined = hasPreviewScale
    ? ({ '--preview-zoom': String(previewZoom) } as CSSProperties)
    : undefined

  const nozzleFill = useMemo(
    () => clampPercent(snapshot.extruderTemp, NOZZLE_TARGET),
    [snapshot.extruderTemp],
  )
  const bedFill = useMemo(() => clampPercent(snapshot.bedTemp, BED_TARGET), [snapshot.bedTemp])
  const printFill = useMemo(() => Math.max(0, Math.min(100, PROGRESS_PERCENT)), [])

  const isBusy = pendingCommand !== null

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
      <section className="screen-shell" data-testid="screen-shell">
        <header className="top-bar">
          <div className="brand-wrap">
            <h1>TreeD Printer</h1>
            <span className="print-state">{statusLabel(snapshot.state)}</span>
          </div>
          <div className="top-icons" aria-label="status icons">
            <WifiIcon />
            <CloudIcon />
            <button type="button" className="power-btn" aria-label="Power actions">
              <PowerIcon />
            </button>
          </div>
        </header>

        <div className="content-grid">
          <section className="job-card">
            <div className="preview-panel">
              <div className="preview-inner">
                <PrintPreviewIcon />
              </div>
            </div>

            <div className="job-info">
              <p className="job-name">{FILE_NAME}</p>

              <div className="job-metrics">
                <div>
                  <p className="label">Progress</p>
                  <p className="job-main-value">{PROGRESS_PERCENT}%</p>
                </div>
                <div className="job-metrics-right">
                  <p className="label">ETA</p>
                  <p className="job-main-value">{ETA_TIME}</p>
                </div>
              </div>

              <div className="job-meter">
                <div className="job-meter-fill" style={{ width: `${printFill}%` }} />
              </div>

              <div className="job-layer-row">
                <span className="label">Layer</span>
                <strong>
                  {LAYER_CURRENT} / {LAYER_TOTAL}
                </strong>
              </div>
            </div>
          </section>

          <section className="right-column">
            <div className="stats-actions-row">
              <article className="stats-card">
                <div className="temp-grid">
                  <div className="metric">
                    <p className="label">Nozzle</p>
                    <p className="value temp">
                      {rounded(snapshot.extruderTemp)}<span>°C</span>
                    </p>
                    <p className="hint">Target: {NOZZLE_TARGET}°C</p>
                    <div className="meter orange">
                      <div className="fill" style={{ width: `${nozzleFill}%` }} />
                    </div>
                  </div>

                  <div className="metric">
                    <p className="label">Bed</p>
                    <p className="value temp">
                      {rounded(snapshot.bedTemp)}<span>°C</span>
                    </p>
                    <p className="hint">Target: {BED_TARGET}°C</p>
                    <div className="meter green">
                      <div className="fill" style={{ width: `${bedFill}%` }} />
                    </div>
                  </div>
                </div>

                <div className="three-up-grid">
                  <div className="metric compact">
                    <p className="label">Speed</p>
                    <p className="value percent">
                      {SPEED_PERCENT}<span>%</span>
                    </p>
                  </div>
                  <div className="metric compact">
                    <p className="label">Model Fan</p>
                    <p className="value percent">
                      {rounded(snapshot.modelFanPercent)}<span>%</span>
                    </p>
                  </div>
                  <div className="metric compact">
                    <p className="label">Flow</p>
                    <p className="value percent">
                      {FLOW_PERCENT}<span>%</span>
                    </p>
                  </div>
                </div>
              </article>

              <div className="action-stack" role="group" aria-label="print actions">
                <button
                  type="button"
                  className="stack-action action-pause"
                  onClick={() => void handlePause()}
                  disabled={isBusy}
                >
                  {pendingCommand === 'pause' ? 'Pausing' : 'Pause'}
                </button>
                <button
                  type="button"
                  className="stack-action action-cancel"
                  onClick={() => void handleStop()}
                  disabled={isBusy}
                >
                  {pendingCommand === 'cancel' ? 'Canceling' : 'Cancel Print'}
                </button>
              </div>
            </div>
          </section>
        </div>

        <nav className="bottom-nav" aria-label="Main Navigation">
          <NavItem label="Dashboard" icon={<DashboardIcon />} active />
          <NavItem label="Control" icon={<ControlIcon />} />
          <NavItem label="Files" icon={<FilesIcon />} />
          <NavItem label="Macros" icon={<MacrosIcon />} />
          <NavItem label="Settings" icon={<SettingsIcon />} />
        </nav>
      </section>
    </main>
  )
}

export default App


