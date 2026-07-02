import { useEffect, useState } from 'react'
import { EDDY_TEST_Z_STEP_OPTIONS } from '@treed/printer-logic'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type {
  PrinterEddyCalibrationSnapshot,
  PrinterEddyCalibrationStep,
  PrinterSnapshot,
} from '../core/transport/types'
import { joinClassNames } from '../ui'

type EddyCalibrationScreenProps = {
  snapshot: PrinterSnapshot
  pendingCommand: PrinterCommandId | null
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
  onBackToList: () => void
}

type WizardStepId = 'primary' | 'temperature' | 'z0' | 'screws' | 'mesh' | 'autosave'

type WizardStep = {
  id: WizardStepId
  title: string
  done: (calibration: PrinterEddyCalibrationSnapshot, snapshot: PrinterSnapshot) => boolean
}

const WIZARD_STEPS: readonly WizardStep[] = [
  {
    id: 'primary',
    title: 'Первичная калибровка датчика',
    done: (calibration) => calibration.primaryDone,
  },
  {
    id: 'temperature',
    title: 'Температурная калибровка',
    done: (calibration) => calibration.temperatureDone,
  },
  {
    id: 'z0',
    title: 'Поиск Z0',
    done: (calibration) => calibration.z0Done,
  },
  {
    id: 'screws',
    title: 'Выравнивание винтов стола',
    done: (calibration) => calibration.screwsDone,
  },
  {
    id: 'mesh',
    title: 'Построение карты стола',
    done: (calibration) => calibration.meshDone,
  },
  {
    id: 'autosave',
    title: 'Автосохранение Z-offset',
    done: (_calibration, snapshot) => snapshot.v2.eddy.autosaveEnabled,
  },
]

const ACTIVE_STEP_INDEX: Record<PrinterEddyCalibrationStep, number> = {
  not_started: 0,
  primary: 0,
  temperature: 1,
  z0: 2,
  screws: 3,
  mesh: 4,
  complete: 5,
}

const PROMPT_LABELS: Record<PrinterEddyCalibrationSnapshot['operatorPrompt'], string> = {
  none: 'Готов к следующему действию',
  drive_current: 'Калибровка тока катушки',
  paper_test: 'Paper test: настройте высоту и нажмите ACCEPT',
  temperature_points: 'Ожидание температурных точек Eddy',
  verify_z0: 'Проверьте повторяемость Z0',
  adjust_screws: 'Регулируйте винты и повторяйте измерение',
  mesh_scan: 'Идет построение карты стола',
  restart: 'Ожидается перезапуск Klipper',
}

export function EddyCalibrationScreen({
  snapshot,
  pendingCommand,
  executeCommand,
  getCommandBlockReason,
  onBackToList,
}: EddyCalibrationScreenProps) {
  const calibration = snapshot.v2.eddy.calibration
  const [currentStepIndex, setCurrentStepIndex] = useState(() => ACTIVE_STEP_INDEX[calibration.activeStep])
  const currentStep = WIZARD_STEPS[currentStepIndex] ?? WIZARD_STEPS[0]
  const completedRequiredCount = WIZARD_STEPS.slice(0, 5).filter((step) => step.done(calibration, snapshot)).length

  useEffect(() => {
    if (calibration.activeStep !== 'not_started') {
      setCurrentStepIndex(ACTIVE_STEP_INDEX[calibration.activeStep])
    }
  }, [calibration.activeStep])

  function runCommand(args: ExecuteCommandArgs): void {
    const blockReason = getCommandBlockReason(args.command, args)
    if (blockReason !== null) {
      return
    }

    void executeCommand(args)
  }

  function isCommandBlocked(args: ExecuteCommandArgs): boolean {
    return pendingCommand === args.command || getCommandBlockReason(args.command, args) !== null
  }

  function renderCommandButton(label: string, args: ExecuteCommandArgs, tone: 'primary' | 'secondary' = 'primary') {
    return (
      <button
        type="button"
        className={joinClassNames('macros-eddy-command-btn', tone === 'secondary' && 'is-secondary')}
        disabled={isCommandBlocked(args)}
        onClick={() => runCommand(args)}
      >
        {label}
      </button>
    )
  }

  function renderCurrentStep() {
    switch (currentStep.id) {
      case 'primary':
        return (
          <>
            <div className="macros-eddy-action-row">
              {renderCommandButton('Калибровать ток', { command: 'eddyDriveCurrentCalibrate' })}
              {renderCommandButton('Начать paper test', { command: 'eddyPrimaryHeightStart' })}
              {renderCommandButton('ACCEPT и сохранить', { command: 'eddyPrimaryAcceptSave' }, 'secondary')}
            </div>
            <div className="macros-eddy-testz-panel">
              <p>TESTZ</p>
              <div className="macros-eddy-testz-grid">
                {EDDY_TEST_Z_STEP_OPTIONS.map((deltaMm) => {
                  const label = `${deltaMm > 0 ? '+' : ''}${deltaMm}`
                  const args: ExecuteCommandArgs = { command: 'eddyTestZ', deltaMm }

                  return (
                    <button
                      key={deltaMm}
                      type="button"
                      aria-label={`TESTZ ${label} мм`}
                      disabled={isCommandBlocked(args)}
                      onClick={() => runCommand(args)}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )
      case 'temperature':
        return (
          <div className="macros-eddy-action-row">
            {renderCommandButton('Запустить температурную калибровку', { command: 'eddyTemperatureStart' })}
            {renderCommandButton('ACCEPT и сохранить', { command: 'eddyTemperatureAcceptSave' }, 'secondary')}
          </div>
        )
      case 'z0':
        return (
          <div className="macros-eddy-action-row">
            {renderCommandButton('Запустить поиск Z0', { command: 'eddyCheckZ0' })}
          </div>
        )
      case 'screws':
        return (
          <div className="macros-eddy-action-row">
            {renderCommandButton('Запустить измерение винтов', { command: 'eddyScrewsTiltStart' })}
            {renderCommandButton('Винты выровнены', { command: 'eddyScrewsTiltDone' }, 'secondary')}
          </div>
        )
      case 'mesh':
        return (
          <div className="macros-eddy-action-row">
            {renderCommandButton('Построить карту стола', { command: 'eddyBedMeshCalibrate' })}
          </div>
        )
      case 'autosave': {
        const toggleArgs: ExecuteCommandArgs = {
          command: snapshot.v2.eddy.autosaveEnabled ? 'eddyAutosaveDisable' : 'eddyAutosaveEnable',
        }

        return (
          <div className="macros-eddy-action-row">
            {renderCommandButton(
              snapshot.v2.eddy.autosaveEnabled ? 'Отключить автосохранение' : 'Включить автосохранение',
              toggleArgs,
            )}
            {renderCommandButton('Проверить статус', { command: 'eddyAutosaveStatus' }, 'secondary')}
          </div>
        )
      }
    }
  }

  return (
    <article className="macros-eddy-workflow">
      <header className="macros-eddy-workflow-header">
        <button type="button" className="macros-eddy-back-btn" onClick={onBackToList}>
          К списку
        </button>
        <div className="macros-eddy-title-group">
          <p className="macros-eddy-kicker">Workflow</p>
          <h2>Калибровка датчика уровня</h2>
        </div>
        <div className="macros-eddy-summary" aria-label="Прогресс обязательной калибровки">
          <strong>{completedRequiredCount}/5</strong>
          <span>{calibration.requiredDone ? 'обязательные шаги готовы' : PROMPT_LABELS[calibration.operatorPrompt]}</span>
        </div>
      </header>

      <div className="macros-eddy-workflow-body">
        <main className="macros-eddy-step-screen">
          <div className="macros-eddy-step-copy">
            <p className="macros-eddy-step-count">Шаг {currentStepIndex + 1} из {WIZARD_STEPS.length}</p>
            <h2>{currentStep.title}</h2>
            <p>{PROMPT_LABELS[calibration.operatorPrompt]}</p>
          </div>
          <div className="macros-eddy-step-actions">
            {renderCurrentStep()}
          </div>
        </main>
      </div>

      <footer className="macros-eddy-footer">
        <button
          type="button"
          disabled={currentStepIndex === 0}
          onClick={() => setCurrentStepIndex((index) => Math.max(0, index - 1))}
        >
          Назад
        </button>
        <button
          type="button"
          disabled={currentStepIndex === WIZARD_STEPS.length - 1}
          onClick={() => setCurrentStepIndex((index) => Math.min(WIZARD_STEPS.length - 1, index + 1))}
        >
          Далее
        </button>
      </footer>
    </article>
  )
}
