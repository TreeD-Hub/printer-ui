import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SystemSettingsPage } from './SystemSettingsPage'
import { createLoadingMoonrakerSystemStatus } from './systemStatus'

describe('system settings reset', () => {
  it('requires confirmation and lets the user cancel without resetting', () => {
    const onReset = vi.fn().mockResolvedValue(undefined)
    render(<SystemSettingsPage
      activeSettingsGroup="system"
      onSettingsGroupChange={() => undefined}
      system={{ contractStatus: 'ready', runtimeStatus: 'ready', onExportDiagnostics: () => undefined,
        factoryReset: { canReset: true, isResetting: false, notice: '', onReset } }}
      systemStatus={{ status: createLoadingMoonrakerSystemStatus(), isRefreshing: false, refresh: () => undefined }}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить настройки' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onReset).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onReset).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить настройки' }))
    fireEvent.click(screen.getByRole('button', { name: /^Сбросить$/ }))
    expect(onReset).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
