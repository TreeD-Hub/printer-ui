import { describe, expect, it } from 'vitest'
import {
  getPrinterFileDirectoryFromPath,
  getPrinterFileNameFromPath,
  normalizePrinterFileId,
  normalizePrinterFilePath,
  sortPrinterFileItems,
  type PrinterFileItem,
} from '../src/index'

function createFile(overrides: Partial<PrinterFileItem>): PrinterFileItem {
  return {
    id: 'file-item',
    path: 'item.gcode',
    name: 'item.gcode',
    directory: null,
    printTime: '1 мин',
    weight: '1 г',
    material: 'PLA',
    addedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('printer file helpers', () => {
  it('normalizes printer file identity from nested paths', () => {
    const path = normalizePrinterFilePath('\\jobs\\calibration\\benchy v2.gcode')

    expect(path).toBe('jobs/calibration/benchy v2.gcode')
    expect(normalizePrinterFileId(path)).toBe('file-jobs-calibration-benchy-v2-gcode')
    expect(getPrinterFileNameFromPath(path)).toBe('benchy v2.gcode')
    expect(getPrinterFileDirectoryFromPath(path)).toBe('jobs/calibration')
  })

  it('sorts printer files by name and newest added date without mutating source', () => {
    const source = [
      createFile({ id: 'older-b', name: 'bracket.gcode', addedAt: '2026-01-01T00:00:00.000Z' }),
      createFile({ id: 'newer-a', name: 'adapter.gcode', addedAt: '2026-01-03T00:00:00.000Z' }),
      createFile({ id: 'middle-c', name: 'clip.gcode', addedAt: '2026-01-02T00:00:00.000Z' }),
    ]

    expect(sortPrinterFileItems(source, 'name').map((item) => item.id)).toEqual([
      'newer-a',
      'older-b',
      'middle-c',
    ])
    expect(sortPrinterFileItems(source, 'addedAt').map((item) => item.id)).toEqual([
      'newer-a',
      'middle-c',
      'older-b',
    ])
    expect(source.map((item) => item.id)).toEqual(['older-b', 'newer-a', 'middle-c'])
  })
})
