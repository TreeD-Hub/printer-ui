import { useState } from 'react'
import { EddyCalibrationScreen } from './EddyCalibrationScreen'
import { PidCalibrationScreen } from './PidCalibrationScreen'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type { PrinterSnapshot } from '../core/transport/types'

export type MacrosContainerProps = {
  snapshot: PrinterSnapshot
  pendingCommand: PrinterCommandId | null
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  refreshEddyState: () => Promise<void>
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
}

export function MacrosContainer(props: MacrosContainerProps) {
  const [workflow, setWorkflow] = useState<'eddy' | 'pid' | null>(null)
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
          <EddyCalibrationScreen {...props} onBackToList={() => setWorkflow(null)} />
        ) : (
          <div className="macros-manager-list">
            <header className="macros-manager-list-head">
              <div className="macros-manager-title">
                <p>Макросы</p>
                <h1>Выберите калибровку</h1>
              </div>
            </header>

            <div className="macros-manager-workflows" data-testid="macros-manager-workflows">
              <button
                type="button"
                className="macros-manager-workflow"
                aria-label={`Калибровка датчика уровня ${completedRequiredCount}/5`}
                onClick={() => setWorkflow('eddy')}
              >
                <span>Калибровка датчика уровня</span>
                <em>Пошаговая настройка высоты, стола и карты поверхности.</em>
                <strong>{completedRequiredCount}/5</strong>
              </button>
              <button type="button" className="macros-manager-workflow" onClick={() => setWorkflow('pid')}>
                <span>PID-калибровка</span>
                <em>Сопло или стол: подготовка, нагрев, расчёт и результат.</em>
                <strong>PID</strong>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
