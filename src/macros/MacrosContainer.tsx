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
        <aside className="macros-manager-sidebar" aria-label="Менеджер макросов">
          <div className="macros-manager-title">
            <p>Макросы</p>
            <h1>Менеджер макросов</h1>
          </div>

          <div className="macros-manager-workflows" data-testid="macros-manager-workflows">
            <button
              type="button"
              className="macros-manager-workflow is-active"
              aria-current="true"
              aria-label={`Eddy Калибровка датчика ${completedRequiredCount}/5`}
            >
              <span>Eddy</span>
              <em>Калибровка датчика</em>
              <strong>{completedRequiredCount}/5</strong>
            </button>
          </div>

          <div className="macros-manager-status">
            <strong>{calibration.requiredDone ? 'Готово' : 'Настройка'}</strong>
            <span>5 обязательных шагов, автосохранение Z-offset отдельно.</span>
          </div>
        </aside>

        <EddyCalibrationScreen {...props} />
      </div>
    </section>
  )
}
