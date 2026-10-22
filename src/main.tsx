import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppErrorBoundary, installRuntimeDiagnostics } from './diagnostics'
import { initializeTheme } from './ui/theme'
import './index.css'

initializeTheme()
installRuntimeDiagnostics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
