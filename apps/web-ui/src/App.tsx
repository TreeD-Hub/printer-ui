import { useMemo, useState } from 'react'
import {
  getPrinterCapabilities,
  normalizeHomedAxes,
  type ActionAvailability,
  type PrinterCapabilityContext,
  type PrinterCommandId,
  type PrinterSnapshot,
} from '@treed/printer-logic'

type SnapshotKey =
  | 'standby'
  | 'printing'
  | 'paused'
  | 'connecting'
  | 'degraded'
  | 'reconnecting'
  | 'offline'
  | 'shutdown'
type ScenarioLockId = 'homing' | 'calibrationMove'

type CapabilityRow = {
  group: string
  action: string
  availability: ActionAvailability
}

const SNAPSHOTS: Record<SnapshotKey, PrinterSnapshot> = {
  standby: {
    source: 'mock',
    connection: 'online',
    wifiSsid: 'Treed Lab',
    ipAddress: '192.168.1.40',
    state: 'standby',
    toolheadX: 120,
    toolheadY: 110,
    toolheadZ: 8,
    homedAxes: 'xyz',
    extruderTemp: 28,
    bedTemp: 30,
    modelFanPercent: 0,
    updatedAt: '2026-06-05T10:00:00.000Z',
    message: 'Mock standby snapshot',
  },
  printing: {
    source: 'mock',
    connection: 'online',
    wifiSsid: 'Treed Lab',
    ipAddress: '192.168.1.40',
    state: 'printing',
    toolheadX: 122.4,
    toolheadY: 98.1,
    toolheadZ: 12.6,
    homedAxes: 'xyz',
    extruderTemp: 214,
    bedTemp: 61,
    modelFanPercent: 45,
    updatedAt: '2026-06-05T10:03:00.000Z',
    message: 'Mock printing snapshot',
  },
  paused: {
    source: 'mock',
    connection: 'online',
    wifiSsid: 'Treed Lab',
    ipAddress: '192.168.1.40',
    state: 'paused',
    toolheadX: 122.4,
    toolheadY: 98.1,
    toolheadZ: 12.6,
    homedAxes: 'xyz',
    extruderTemp: 205,
    bedTemp: 58,
    modelFanPercent: 20,
    updatedAt: '2026-06-05T10:05:00.000Z',
    message: 'Mock paused snapshot',
  },
  connecting: {
    source: 'mock',
    connection: 'connecting',
    wifiSsid: 'Не подключено',
    ipAddress: '—',
    state: 'unknown',
    toolheadX: 0,
    toolheadY: 0,
    toolheadZ: 0,
    homedAxes: '',
    extruderTemp: 0,
    bedTemp: 0,
    modelFanPercent: 0,
    updatedAt: '2026-06-05T10:06:00.000Z',
    message: 'Mock connecting snapshot',
  },
  degraded: {
    source: 'mock',
    connection: 'degraded',
    wifiSsid: 'Treed Lab',
    ipAddress: '192.168.1.40',
    state: 'standby',
    toolheadX: 120,
    toolheadY: 110,
    toolheadZ: 8,
    homedAxes: 'xyz',
    extruderTemp: 28,
    bedTemp: 30,
    modelFanPercent: 0,
    updatedAt: '2026-06-05T10:07:00.000Z',
    message: 'Mock degraded snapshot',
  },
  reconnecting: {
    source: 'mock',
    connection: 'reconnecting',
    wifiSsid: 'Treed Lab',
    ipAddress: '192.168.1.40',
    state: 'unknown',
    toolheadX: 120,
    toolheadY: 110,
    toolheadZ: 8,
    homedAxes: 'xyz',
    extruderTemp: 28,
    bedTemp: 30,
    modelFanPercent: 0,
    updatedAt: '2026-06-05T10:08:00.000Z',
    message: 'Mock reconnecting snapshot',
  },
  offline: {
    source: 'mock',
    connection: 'offline',
    wifiSsid: 'Не подключено',
    ipAddress: '—',
    state: 'unknown',
    toolheadX: 0,
    toolheadY: 0,
    toolheadZ: 0,
    homedAxes: '',
    extruderTemp: 0,
    bedTemp: 0,
    modelFanPercent: 0,
    updatedAt: '2026-06-05T10:09:00.000Z',
    message: 'Mock offline snapshot',
  },
  shutdown: {
    source: 'mock',
    connection: 'shutdown',
    wifiSsid: 'Treed Lab',
    ipAddress: '192.168.1.40',
    state: 'shutdown',
    toolheadX: 120,
    toolheadY: 110,
    toolheadZ: 8,
    homedAxes: 'xyz',
    extruderTemp: 28,
    bedTemp: 30,
    modelFanPercent: 0,
    updatedAt: '2026-06-05T10:10:00.000Z',
    message: 'Mock shutdown snapshot',
  },
}

const SNAPSHOT_OPTIONS: Array<{ id: SnapshotKey; label: string }> = [
  { id: 'standby', label: 'Ожидание' },
  { id: 'printing', label: 'Печать' },
  { id: 'paused', label: 'Пауза' },
  { id: 'connecting', label: 'Подключение' },
  { id: 'degraded', label: 'Ограничено' },
  { id: 'reconnecting', label: 'Переподключение' },
  { id: 'offline', label: 'Офлайн' },
  { id: 'shutdown', label: 'Shutdown' },
]

const PENDING_COMMAND_OPTIONS: Array<{ id: PrinterCommandId | 'none'; label: string }> = [
  { id: 'none', label: 'Нет' },
  { id: 'home', label: 'home' },
  { id: 'cancel', label: 'cancel' },
]

const SCENARIO_LOCK_OPTIONS: Array<{ id: ScenarioLockId; label: string }> = [
  { id: 'homing', label: 'Homing' },
  { id: 'calibrationMove', label: 'Calibration move' },
]

function App() {
  const [snapshotKey, setSnapshotKey] = useState<SnapshotKey>('standby')
  const [pendingCommand, setPendingCommand] = useState<PrinterCommandId | 'none'>('none')
  const [scenarioLocks, setScenarioLocks] = useState<ScenarioLockId[]>([])

  const snapshot = SNAPSHOTS[snapshotKey]
  const context: PrinterCapabilityContext = {
    pendingCommand: pendingCommand === 'none' ? null : pendingCommand,
    scenarioLocks,
  }
  const capabilities = getPrinterCapabilities(snapshot, context)
  const homedAxes = normalizeHomedAxes(snapshot.homedAxes)

  const rows = useMemo(() => createCapabilityRows(capabilities), [capabilities])
  const blockedCount = rows.filter((row) => !row.availability.enabled).length

  function toggleScenarioLock(lockId: ScenarioLockId): void {
    setScenarioLocks((currentLocks) => {
      if (currentLocks.includes(lockId)) {
        return currentLocks.filter((item) => item !== lockId)
      }

      return [...currentLocks, lockId]
    })
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>Treed Web UI</h1>
          <p>Заглушка будущей вебморды. Не production UI.</p>
        </div>
        <div className={`connection-pill is-${snapshot.connection}`}>
          <span aria-hidden="true" />
          {snapshot.connection}
        </div>
      </header>

      <section className="workspace" aria-label="Capability playground">
        <aside className="control-rail">
          <div className="control-group">
            <h2>Snapshot</h2>
            <div className="segmented-list">
              {SNAPSHOT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={snapshotKey === option.id ? 'is-selected' : ''}
                  onClick={() => setSnapshotKey(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <h2>Pending command</h2>
            <div className="segmented-list">
              {PENDING_COMMAND_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={pendingCommand === option.id ? 'is-selected' : ''}
                  onClick={() => setPendingCommand(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <h2>Scenario locks</h2>
            <div className="toggle-stack">
              {SCENARIO_LOCK_OPTIONS.map((option) => (
                <label key={option.id} className="toggle-row">
                  <input
                    type="checkbox"
                    checked={scenarioLocks.includes(option.id)}
                    onChange={() => toggleScenarioLock(option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        </aside>

        <section className="snapshot-panel" aria-label="Printer snapshot">
          <div className="panel-head">
            <h2>Printer state</h2>
            <strong>{snapshot.state}</strong>
          </div>
          <dl className="metric-grid">
            <div>
              <dt>IP</dt>
              <dd>{snapshot.ipAddress}</dd>
            </div>
            <div>
              <dt>XYZ</dt>
              <dd>{snapshot.toolheadX.toFixed(1)} / {snapshot.toolheadY.toFixed(1)} / {snapshot.toolheadZ.toFixed(1)}</dd>
            </div>
            <div>
              <dt>Homed</dt>
              <dd>{formatHomedAxes(homedAxes)}</dd>
            </div>
            <div>
              <dt>Temp</dt>
              <dd>{snapshot.extruderTemp}° / {snapshot.bedTemp}°</dd>
            </div>
          </dl>
        </section>

        <section className="capability-panel" aria-label="Printer capabilities">
          <div className="panel-head">
            <h2>Capabilities</h2>
            <strong>{blockedCount} blocked</strong>
          </div>
          <div className="capability-table" role="table">
            <div className="table-row table-head" role="row">
              <span role="columnheader">Group</span>
              <span role="columnheader">Action</span>
              <span role="columnheader">State</span>
              <span role="columnheader">Reason</span>
            </div>
            {rows.map((row) => (
              <div key={`${row.group}-${row.action}`} className="table-row" role="row">
                <span role="cell">{row.group}</span>
                <span role="cell">{row.action}</span>
                <span role="cell" className={row.availability.enabled ? 'state-enabled' : 'state-blocked'}>
                  {row.availability.enabled ? 'enabled' : 'blocked'}
                </span>
                <span role="cell">{row.availability.reason ?? '—'}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}

function createCapabilityRows(capabilities: ReturnType<typeof getPrinterCapabilities>): CapabilityRow[] {
  return [
    { group: 'print', action: 'start', availability: capabilities.print.start },
    { group: 'print', action: 'pause', availability: capabilities.print.pause },
    { group: 'print', action: 'resume', availability: capabilities.print.resume },
    { group: 'print', action: 'cancel', availability: capabilities.print.cancel },
    { group: 'parking', action: 'all', availability: capabilities.parking.all },
    { group: 'parking', action: 'axis X', availability: capabilities.parking.axis.X },
    { group: 'parking', action: 'axis Y', availability: capabilities.parking.axis.Y },
    { group: 'parking', action: 'axis Z', availability: capabilities.parking.axis.Z },
    { group: 'motion', action: 'xy', availability: capabilities.motion.xy },
    { group: 'motion', action: 'z', availability: capabilities.motion.z },
    { group: 'motion', action: 'extruder', availability: capabilities.motion.extruder },
    { group: 'thermal', action: 'nozzle', availability: capabilities.thermal.nozzle },
    { group: 'thermal', action: 'bed', availability: capabilities.thermal.bed },
    { group: 'fan', action: 'model', availability: capabilities.fan.model },
    { group: 'safety', action: 'emergency stop', availability: capabilities.emergencyStop },
  ]
}

function formatHomedAxes(homedAxes: { X: boolean; Y: boolean; Z: boolean }): string {
  return (['X', 'Y', 'Z'] as const)
    .filter((axis) => homedAxes[axis])
    .join('') || '—'
}

export default App
