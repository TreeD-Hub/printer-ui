import type { PrinterFileItem } from '@treed/printer-logic'

export type PrintFileItem = PrinterFileItem

type PrintFileSeed = Omit<PrintFileItem, 'path' | 'directory'>

const PRINT_FILE_SEEDS: PrintFileSeed[] = [
  {
    id: 'file-bearing-bracket-mk2',
    name: 'bearing_bracket_mk2.gcode',
    printTime: '1 ч 40 мин',
    weight: '22 г',
    material: 'PLA',
    addedAt: '2026-03-13T09:15:00+03:00',
  },
  {
    id: 'file-cable-clip-set',
    name: 'cable_clip_set.gcode',
    printTime: '32 мин',
    weight: '8 г',
    material: 'PETG',
    addedAt: '2026-03-10T16:12:00+03:00',
  },
  {
    id: 'file-corner-brace-v2',
    name: 'corner_brace_v2.gcode',
    printTime: '54 мин',
    weight: '15 г',
    material: 'ABS',
    addedAt: '2026-03-11T11:48:00+03:00',
  },
  {
    id: 'file-display-mount-rev4',
    name: 'display_mount_rev4.gcode',
    printTime: '1 ч 12 мин',
    weight: '18 г',
    material: 'PLA',
    addedAt: '2026-03-09T20:03:00+03:00',
  },
  {
    id: 'file-door-hinge-left',
    name: 'door_hinge_left.gcode',
    printTime: '42 мин',
    weight: '11 г',
    material: 'PETG',
    addedAt: '2026-03-12T13:40:00+03:00',
  },
  {
    id: 'file-fan-shroud-prototype',
    name: 'fan_shroud_prototype.gcode',
    printTime: '48 мин',
    weight: '12 г',
    material: 'ASA',
    addedAt: '2026-03-14T08:05:00+03:00',
  },
  {
    id: 'file-filament-guide-v5',
    name: 'filament_guide_v5.gcode',
    printTime: '37 мин',
    weight: '9 г',
    material: 'PLA',
    addedAt: '2026-03-11T18:24:00+03:00',
  },
  {
    id: 'file-gearbox-cover-v3',
    name: 'gearbox_cover_v3.gcode',
    printTime: '2 ч 15 мин',
    weight: '34 г',
    material: 'PETG-CF',
    addedAt: '2026-03-12T19:27:00+03:00',
  },
  {
    id: 'file-leveling-blocks-pack',
    name: 'leveling_blocks_pack.gcode',
    printTime: '26 мин',
    weight: '7 г',
    material: 'PLA',
    addedAt: '2026-03-08T14:57:00+03:00',
  },
  {
    id: 'file-nozzle-box-insert',
    name: 'nozzle_box_insert.gcode',
    printTime: '1 ч 05 мин',
    weight: '16 г',
    material: 'ABS',
    addedAt: '2026-03-07T21:31:00+03:00',
  },
  {
    id: 'file-spool-lock-mini',
    name: 'spool_lock_mini.gcode',
    printTime: '29 мин',
    weight: '6 г',
    material: 'PLA',
    addedAt: '2026-03-13T06:55:00+03:00',
  },
  {
    id: 'file-tool-tray-grid',
    name: 'tool_tray_grid.gcode',
    printTime: '1 ч 22 мин',
    weight: '20 г',
    material: 'PETG',
    addedAt: '2026-03-10T09:02:00+03:00',
  },
]

export const PRINT_FILE_LIBRARY: PrintFileItem[] = PRINT_FILE_SEEDS.map((item) => ({
  ...item,
  path: item.name,
  directory: null,
}))
