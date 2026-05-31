import { useMemo } from 'react'
import { usePrinterStoreSelector } from '../core/store/printerStore'
import type { PrinterSnapshot } from '../core/transport/types'
import {
  resolvePrinterDisplayStatus,
  type PrinterDisplayStatus,
  type PrinterDisplayStatusInput,
} from './printerStatusState'

function selectPrinterDisplayStatusInput(snapshot: PrinterSnapshot): PrinterDisplayStatusInput {
  return {
    connection: snapshot.connection,
    message: snapshot.message,
    state: snapshot.state,
    printJob: {
      message: snapshot.printJob.message,
      state: snapshot.printJob.state,
    },
  }
}

function isPrinterDisplayStatusInputEqual(
  left: PrinterDisplayStatusInput,
  right: PrinterDisplayStatusInput,
): boolean {
  return (
    left.connection === right.connection &&
    left.message === right.message &&
    left.state === right.state &&
    left.printJob.message === right.printJob.message &&
    left.printJob.state === right.printJob.state
  )
}

export function usePrinterDisplayStatus(): PrinterDisplayStatus {
  const statusInput = usePrinterStoreSelector(
    selectPrinterDisplayStatusInput,
    isPrinterDisplayStatusInputEqual,
  )

  return useMemo(() => resolvePrinterDisplayStatus(statusInput), [statusInput])
}
