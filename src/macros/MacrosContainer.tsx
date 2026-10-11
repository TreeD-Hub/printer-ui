import { useState } from 'react'
import { EddyCalibrationScreen } from './EddyCalibrationScreen'
import { CalibrationProcedures } from './CalibrationProcedures'
import { PidCalibrationScreen } from './PidCalibrationScreen'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type { PrinterSnapshot } from '../core/transport/types'

export type MacrosContainerProps = {
  snapshot: PrinterSnapshot
  pendingCommand: PrinterCommandId | null
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  refreshEddyState: () => Promise<boolean>
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
}

export function MacrosContainer(props: MacrosContainerProps) {
  const [workflow, setWorkflow] = useState<'eddy' | 'pid' | null>(null)
  const [eddyProcedure, setEddyProcedure] = useState<'overview' | 'screws' | 'mesh' | 'firstLayer'>('overview')
  const calibration = props.snapshot.v2.eddy.calibration
  const completedRequiredCount = [
    calibration.primaryDone,
    calibration.temperatureDone,
    calibration.z0Done,
    calibration.screwsDone,
    calibration.meshDone,
  ].filter(Boolean).length

  return (
    <section className="macros-screen" data-testid="screen-macros">
      <div className="macros-manager" data-testid="macros-manager">
        {workflow === 'pid' ? (
          <PidCalibrationScreen {...props} onBackToList={() => setWorkflow(null)} />
        ) : workflow === 'eddy' ? (
          <EddyCalibrationScreen {...props} initialProcedure={eddyProcedure} onBackToList={() => setWorkflow(null)} />
        ) : (
          <CalibrationProcedures
            {...props}
            completedRequiredCount={completedRequiredCount}
            onOpenPid={() => setWorkflow('pid')}
            onOpenEddy={(procedure) => { setEddyProcedure(procedure); setWorkflow('eddy') }}
          />
        )}
      </div>
    </section>
  )
}
