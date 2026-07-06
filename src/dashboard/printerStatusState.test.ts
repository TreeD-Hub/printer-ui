import { describe, expect, it } from 'vitest'
import { resolvePrinterDisplayStatus, type PrinterDisplayStatusInput } from './printerStatusState'

function createInput(message: string): PrinterDisplayStatusInput {
  return {
    connection: 'online',
    message,
    state: 'ready',
    printJob: {
      message: '',
      state: 'standby',
    },
  }
}

describe('resolvePrinterDisplayStatus', () => {
  it('keeps active CAN diagnostics out of the error state', () => {
    expect(resolvePrinterDisplayStatus(
      createInput('CAN active, EBB CAN active, can0 ERROR-ACTIVE'),
    )).toMatchObject({
      label: 'Ожидание печати',
      severity: 'normal',
      notification: null,
    })
  })

  it.each([
    'can0 down',
    'CAN bus-off',
    'EBB CAN missing',
    'CAN timeout',
  ])('keeps a real CAN failure in the error state: %s', (message) => {
    expect(resolvePrinterDisplayStatus(createInput(message))).toMatchObject({
      label: 'Ошибка CAN-шины',
      severity: 'error',
    })
  })
})
