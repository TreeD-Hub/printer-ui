import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getTreeDCommandBlockReason, type TreeDCommandRuntimeContext } from '../../core/commands'
import { normalizeMoonrakerRuntimeSnapshot, type MoonrakerPrinterObjectsStatus } from '../../core/transport/moonrakerNormalizer'
import { subscribeToMoonrakerStatus } from '../../core/transport/moonrakerWebSocketClient'
import { getPrinterConnectionState, type PrinterSnapshot } from '../../core/transport/types'
import { DriverModeControlPanel, type DriverControlsProps } from './DriverModeControlPanel'

const contract = {
  contract_version: '1.0', profile: 'treed_v2_corexy_v1', required_macros: '', capability_driver_mode: 1,
}
const availableObjects = ['webhooks', 'print_stats', 'treed_driver_mode',
  'gcode_macro _TREED_UI_CONTRACT', 'gcode_macro TREED_UI_SET_DRIVER_MODE']
const readyStatus: MoonrakerPrinterObjectsStatus = {
  webhooks: {state: 'ready'}, print_stats: {state: 'standby'},
  'gcode_macro _TREED_UI_CONTRACT': contract,
  treed_driver_mode: {contract_version: '1.0', mode: 'normal', state: 'ready',
    available_modes: ['normal', 'quiet'], needs_restart: false},
}
const faultStatus: MoonrakerPrinterObjectsStatus = {
  ...readyStatus, webhooks: {state: 'shutdown'},
  treed_driver_mode: {contract_version: '1.0', mode: null, state: 'fault',
    available_modes: ['normal', 'quiet'], needs_restart: true, message: 'SPI: откат не подтверждён'},
}

class Socket {
  onopen: (() => void) | null = null
  onmessage: ((event: {data: string}) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  send(raw: string) {
    const request = JSON.parse(raw)
    const result = request.method === 'server.info' ? {klippy_state: 'ready'}
      : request.method === 'printer.objects.list' ? {objects: availableObjects}
        : request.method === 'printer.objects.query' ? {status: {'gcode_macro _TREED_UI_CONTRACT': contract}}
          : {eventtime: 1, status: readyStatus}
    this.message({id: request.id, result})
  }
  message(value: unknown) { this.onmessage?.({data: JSON.stringify(value)}) }
  close() {}
}

function controlsFor(snapshot: PrinterSnapshot, actions: Pick<DriverControlsProps, 'onApply' | 'onRestart'>): DriverControlsProps {
  const context: TreeDCommandRuntimeContext = {
    source: 'live', connection: getPrinterConnectionState(snapshot), capabilities: snapshot.capabilities,
    transportState: snapshot.transport.state, klippyState: snapshot.klippy.state,
    uiContractStatus: snapshot.uiContract.status, printJob: snapshot.printJob,
    operationPhase: snapshot.operationPhase, driverMode: snapshot.driverMode,
  }
  return {
    mode: snapshot.capabilities.driverMode ? snapshot.driverMode : undefined, pendingCommands: {},
    getCommandBlockReason: (command, args) => getTreeDCommandBlockReason(command, context, args),
    getLastCommandError: () => 'SPI: переключение не удалось', ...actions,
  }
}

describe('Восстановление режима XYZ после shutdown', () => {
  it('проходит настоящий lifecycle WebSocket, HTTP fault и ручной перезапуск в том же окне', async () => {
    let socket!: Socket
    let snapshot!: PrinterSnapshot
    function SocketCtor() { socket = new Socket(); return socket }
    const subscription = subscribeToMoonrakerStatus({
      onSnapshot: value => { snapshot = value }, onConnectionChange: () => {},
    }, {moonrakerUrl: 'http://moonraker.local', WebSocketCtor: SocketCtor as unknown as typeof WebSocket})
    try {
      socket.onopen?.()
      const actions = {onApply: vi.fn().mockResolvedValue(false), onRestart: vi.fn().mockResolvedValue(true)}
      const view = render(<DriverModeControlPanel controls={controlsFor(snapshot, actions)} kind="drivers" />)
      fireEvent.click(screen.getByRole('button', {name: 'Тихий'}))
      await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Применить'})) })

      socket.message({method: 'notify_klippy_shutdown'})
      expect(snapshot.capabilities.driverMode).toBeUndefined()
      view.rerender(<DriverModeControlPanel controls={controlsFor(snapshot, actions)} kind="drivers" />)
      expect(screen.getByRole('dialog')).toHaveTextContent('тихий режим')
      expect(screen.getByRole('button', {name: 'Применить'})).toBeDisabled()
      expect(screen.queryByRole('button', {name: 'Перезапустить Klipper'})).toBeNull()

      // После отказа App запрашивает полный HTTP snapshot, включая fault и handshake.
      snapshot = normalizeMoonrakerRuntimeSnapshot({eventtime: 2, status: faultStatus}, {availableObjects})
      view.rerender(<DriverModeControlPanel controls={controlsFor(snapshot, actions)} kind="drivers" />)
      expect(screen.getByRole('button', {name: 'Перезапустить Klipper'})).toBeEnabled()
      expect(actions.onRestart).not.toHaveBeenCalled()

      // Повторная потеря контракта не теряет требование перезапуска и не обходит допуск.
      socket.message({method: 'notify_klippy_disconnected'})
      view.rerender(<DriverModeControlPanel controls={controlsFor(snapshot, actions)} kind="drivers" />)
      expect(screen.getByRole('button', {name: 'Перезапустить Klipper'})).toBeDisabled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      snapshot = normalizeMoonrakerRuntimeSnapshot({eventtime: 3, status: faultStatus}, {availableObjects})
      view.rerender(<DriverModeControlPanel controls={controlsFor(snapshot, actions)} kind="drivers" />)
      fireEvent.click(screen.getByRole('button', {name: 'Перезапустить Klipper'}))
      await waitFor(() => expect(actions.onRestart).toHaveBeenCalledOnce())

      socket.message({method: 'notify_klippy_disconnected'})
      view.rerender(<DriverModeControlPanel controls={{...controlsFor(snapshot, actions), isRestarting: true}} kind="drivers" />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('button', {name: 'Перезапустить Klipper'})).toBeDisabled()
      socket.message({method: 'notify_klippy_ready'})
      view.rerender(<DriverModeControlPanel controls={{...controlsFor(snapshot, actions), isRestarting: true}} kind="drivers" />)
      expect(screen.getByRole('button', {name: 'Применить'})).toBeDisabled()
      view.rerender(<DriverModeControlPanel controls={controlsFor(snapshot, actions)} kind="drivers" />)
      expect(screen.getByRole('button', {name: 'Применить'})).toBeEnabled()
      expect(screen.getByRole('dialog')).toHaveTextContent('тихий режим')
      expect(actions.onApply).toHaveBeenCalledTimes(1)
      expect(actions.onRestart).toHaveBeenCalledTimes(1)
    } finally { subscription.close() }
  })
})
