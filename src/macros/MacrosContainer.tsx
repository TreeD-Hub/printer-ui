import { useState } from 'react'
import { EddyCalibrationScreen } from './EddyCalibrationScreen'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type { PrinterSnapshot } from '../core/transport/types'

export type MacrosContainerProps = {
  snapshot: PrinterSnapshot
  pendingCommand: PrinterCommandId | null
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
}

export function MacrosContainer(props: MacrosContainerProps) {
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false)
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
        {isCalibrationOpen ? (
          <EddyCalibrationScreen {...props} onBackToList={() => setIsCalibrationOpen(false)} />
        ) : (
          <div className="macros-manager-list">
            <header className="macros-manager-list-head">
              <div className="macros-manager-title">
                <p>Макросы</p>
                <h1>Выберите проход</h1>
              </div>
            </header>

            <div className="macros-manager-workflows" data-testid="macros-manager-workflows">
              <button
                type="button"
                className="macros-manager-workflow"
                aria-label={`Калибровка датчика уровня ${completedRequiredCount}/5`}
                onClick={() => setIsCalibrationOpen(true)}
              >
                <span>Калибровка датчика уровня</span>
                <em>Пошаговая настройка высоты, стола и карты поверхности.</em>
                <strong>{completedRequiredCount}/5</strong>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
