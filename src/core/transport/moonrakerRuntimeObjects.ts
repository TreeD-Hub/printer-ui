export const MOONRAKER_RUNTIME_OBJECTS = [
  'webhooks',
  'toolhead',
  'gcode_move',
  'print_stats',
  'virtual_sdcard',
  'exclude_object',
  'extruder',
  'heater_bed',
  'fan',
  'output_pin chamber_light',
  'firmware_retraction',
  'display_status',
  'pause_resume',
  'idle_timeout',
  'save_variables',
  'filament_switch_sensor filament_switch',
  'filament_motion_sensor filament_motion',
  'gcode_macro FILAMENT_SENSOR_STATUS',
  'gcode_macro _FILAMENT_SENSOR_SENSITIVITY_STATE',
  'gcode_macro _TREED_UI_CONTRACT',
  'gcode_macro _TREED_PROFILE',
  'gcode_macro _TREED_GEOMETRY_CFG',
  'gcode_macro _TREED_CAM_STATE',
  'gcode_macro _TREED_EDDY_Z_OFFSET_AUTOSAVE_STATE',
  'gcode_macro _TREED_SYSTEM_POWER',
  'gcode_macro _TREED_CLOUD',
  'gcode_macro _TREED_UPDATES',
  'gcode_macro _TREED_CAMERA',
  'gcode_macro _TREED_SERVICE_COMMANDS',
  'gcode_macro _TREED_UI_TUNE_STATE',
] as const

export function selectMoonrakerRuntimeObjects(availableObjects: readonly string[]): string[] {
  const available = new Set(availableObjects)
  return MOONRAKER_RUNTIME_OBJECTS.filter((name) => available.has(name))
}
