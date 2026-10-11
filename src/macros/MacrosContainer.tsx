import { useState } from 'react'
import { EddyCalibrationScreen } from './EddyCalibrationScreen'
import { CalibrationProcedures } from './CalibrationProcedures'
import { PidCalibrationScreen } from './PidCalibrationScreen'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type { PrinterSnapshot, PrinterShaperResonanceReport } from '../core/transport/types'

export type MacrosContainerProps = {
  snapshot: PrinterSnapshot
  pendingCommand: PrinterCommandId | null
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  refreshEddyState: () => Promise<boolean>
  fetchShaperResonances?: (mode: 'full' | 'light') => Promise<PrinterShaperResonanceReport>
  onCalibrationActivityChange?: (active: boolean) => void
  onCalibrationViewChange?: (active: boolean) => void
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
}

export function MacrosContainer(props: MacrosContainerProps) {
  const [workflow, setWorkflow] = useState<'eddy' | 'pid' | null>(null)
  const [catalogFolder, setCatalogFolder] = useState<'root' | 'eddy'>('root')
  const [eddyProcedure, setEddyProcedure] = useState<'overview' | 'screws' | 'mesh' | 'firstLayer'>('overview')
  const closeWorkflow = () => {
    props.onCalibrationViewChange?.(false)
    setWorkflow(null)
  }
  const openPid = () => {
    setWorkflow('pid')
  }
  const openEddy = (procedure: typeof eddyProcedure) => {
    props.onCalibrationViewChange?.(true)
    setEddyProcedure(procedure)
    setWorkflow('eddy')
  }

  return (
    <section className="macros-screen" data-testid="screen-macros">
      <div className="macros-manager" data-testid="macros-manager">
        {workflow === 'pid' ? (
          <PidCalibrationScreen {...props} onBackToList={closeWorkflow} />
        ) : workflow === 'eddy' ? (
          <EddyCalibrationScreen {...props} initialProcedure={eddyProcedure} onBackToList={closeWorkflow} />
        ) : (
          <CalibrationProcedures
            {...props}
            catalogFolder={catalogFolder}
            onCatalogFolderChange={setCatalogFolder}
            onOpenPid={openPid}
            onOpenEddy={openEddy}
          />
        )}
      </div>
    </section>
  )
}
