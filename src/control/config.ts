import type { AxisId, SettingsMenuOption } from '../ui'
import type { ControlGroupId, ControlOption, MoveStepOption, MovementMode } from './types'

type HeatingPreset = {
  id: string
  label: string
  nozzle: number
  bed: number
}

type FanPreset = {
  id: string
  label: string
  value: number
}

export const CONTROL_GROUP_OPTIONS: Array<SettingsMenuOption<ControlGroupId>> = [
  { id: 'movement', label: 'Перемещение', icon: 'movement' },
  { id: 'heating', label: 'Нагрев', icon: 'heat' },
  { id: 'fans', label: 'Вентиляторы', icon: 'fan' },
  { id: 'lighting', label: 'Освещение', icon: 'light' },
  { id: 'filament', label: 'Датчик нити', icon: 'filament' },
  { id: 'drivers', label: 'Драйверы', icon: 'drivers' },
  { id: 'maintenance', label: 'Т.О', icon: 'maintenance' },
  { id: 'camera', label: 'Камера AI', icon: 'camera' },
]

export const CONTROL_PARKING_AXIS_OPTIONS: Array<ControlOption<AxisId>> = [
  { id: 'X', label: 'X' },
  { id: 'Y', label: 'Y' },
  { id: 'Z', label: 'Z' },
]

export const CONTROL_MOVEMENT_MODE_OPTIONS: Array<ControlOption<MovementMode>> = [
  { id: 'buttons', label: 'Крестовина' },
]

export const CONTROL_MOVE_STEP_OPTIONS: MoveStepOption[] = [
  { id: '1', label: '1 мм', valueMm: 1 },
  { id: '10', label: '10 мм', valueMm: 10 },
  { id: '25', label: '25 мм', valueMm: 25 },
  { id: '50', label: '50 мм', valueMm: 50 },
]

export const CONTROL_HEATING_PRESET_OPTIONS: HeatingPreset[] = [
  { id: 'pla', label: 'PLA', nozzle: 210, bed: 60 },
  { id: 'abs', label: 'ABS', nozzle: 245, bed: 100 },
  { id: 'petg', label: 'PETG', nozzle: 235, bed: 80 },
]

export const CONTROL_FAN_PRESET_OPTIONS: FanPreset[] = [
  { id: 'off', label: 'Откл.', value: 0 },
  { id: 'low', label: 'Низкий', value: 25 },
  { id: 'medium', label: 'Средний', value: 50 },
  { id: 'high', label: 'Высокий', value: 75 },
  { id: 'max', label: 'Макс.', value: 100 },
]
