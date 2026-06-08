import { Component, type ErrorInfo, type ReactNode } from 'react'

export type RuntimeDiagnosticKind = 'react-render' | 'window-error' | 'unhandled-rejection'

export type RuntimeDiagnosticEntry = {
  id: string
  kind: RuntimeDiagnosticKind
  message: string
  stack: string | null
  detail: string | null
  at: string
}

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  entry: RuntimeDiagnosticEntry | null
}

export const DIAGNOSTIC_STORAGE_KEY = 'treed-shell.runtime-diagnostics'

const MAX_STORED_DIAGNOSTICS = 20

let diagnosticsInstalled = false

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }

  return 'Unknown runtime error'
}

function getErrorStack(error: unknown): string | null {
  return error instanceof Error && typeof error.stack === 'string' ? error.stack : null
}

function readStoredDiagnostics(): RuntimeDiagnosticEntry[] {
  try {
    const rawValue = window.localStorage.getItem(DIAGNOSTIC_STORAGE_KEY)
    if (rawValue === null) {
      return []
    }

    const parsed = JSON.parse(rawValue) as unknown
    return Array.isArray(parsed) ? parsed.filter(isRuntimeDiagnosticEntry) : []
  } catch {
    return []
  }
}

function isRuntimeDiagnosticEntry(value: unknown): value is RuntimeDiagnosticEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const candidate = value as Partial<RuntimeDiagnosticEntry>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.kind === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.at === 'string'
  )
}

function storeRuntimeDiagnostic(entry: RuntimeDiagnosticEntry): void {
  try {
    const nextEntries = [entry, ...readStoredDiagnostics()].slice(0, MAX_STORED_DIAGNOSTICS)
    window.localStorage.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify(nextEntries))
  } catch {
    // Storage can be unavailable in hardened WebView contexts.
  }
}

export function recordRuntimeDiagnostic(
  kind: RuntimeDiagnosticKind,
  error: unknown,
  detail: string | null = null,
): RuntimeDiagnosticEntry {
  const entry: RuntimeDiagnosticEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind,
    message: getErrorMessage(error),
    stack: getErrorStack(error),
    detail,
    at: new Date().toISOString(),
  }

  storeRuntimeDiagnostic(entry)
  console.error('[treed-shell runtime diagnostic]', entry)
  return entry
}

export function installRuntimeDiagnostics(): void {
  if (diagnosticsInstalled) {
    return
  }

  diagnosticsInstalled = true

  window.addEventListener('error', (event) => {
    const detail = [
      event.filename,
      event.lineno,
      event.colno,
    ]
      .filter((item) => item !== undefined && item !== null && `${item}`.length > 0)
      .join(':')

    recordRuntimeDiagnostic('window-error', event.error ?? event.message, detail || null)
  })

  window.addEventListener('unhandledrejection', (event) => {
    recordRuntimeDiagnostic('unhandled-rejection', event.reason)
  })
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    entry: null,
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const entry = recordRuntimeDiagnostic('react-render', error, errorInfo.componentStack ?? null)
    this.setState({ entry })
  }

  render(): ReactNode {
    if (this.state.entry !== null) {
      return (
        <main className="runtime-error-shell" role="alert" aria-live="assertive">
          <section className="runtime-error-panel">
            <p className="runtime-error-kicker">Runtime diagnostic</p>
            <h1>Ошибка интерфейса</h1>
            <p>{this.state.entry.message}</p>
            <dl>
              <div>
                <dt>Тип</dt>
                <dd>{this.state.entry.kind}</dd>
              </div>
              <div>
                <dt>Время</dt>
                <dd>{this.state.entry.at}</dd>
              </div>
            </dl>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
