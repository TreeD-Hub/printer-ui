export type ShaperSpectrumPoint = { frequencyHz: number; psd: number }

export function parseShaperSpectrumCsv(csv: string): ShaperSpectrumPoint[] {
  if (csv.length > 2 * 1024 * 1024) throw new Error('CSV спектра слишком большой.')
  const rows = csv.trim().split(/\r?\n/).filter((row) => row.trim() !== '' && !row.trim().startsWith('#'))
  if (rows.length === 0) return []
  const headers = rows[0].replace(/^\uFEFF/, '').split(',').map((header) => header.trim())
  const names = ['freq', 'psd_x', 'psd_y', 'psd_z', 'psd_xyz']
  const columns = names.map((name) => headers.indexOf(name))
  if (columns.some((column) => column < 0) || names.some((name) => headers.filter((header) => header === name).length !== 1)) throw new Error('CSV не содержит ожидаемые столбцы спектра Klipper.')
  if (rows.length > 4098) throw new Error('CSV содержит слишком много точек спектра.')
  const points: ShaperSpectrumPoint[] = []
  for (const row of rows.slice(1)) {
    const cells = row.split(',')
    const values = columns.map((column) => {
      const text = cells[column]?.trim() ?? ''
      return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(text) ? Number(text) : NaN
    })
    if (!values.every(Number.isFinite) || values[0] < 0 || values.slice(1).some((value) => value < 0)) throw new Error('CSV содержит некорректную частоту или PSD.')
    // FFT Klipper включает DC 0 Гц; спектр резонансов показывает положительные частоты.
    if (values[0] === 0) continue
    points.push({ frequencyHz: values[0], psd: values[4] })
  }
  if (points.length > 4096) throw new Error('CSV содержит слишком много точек спектра.')
  points.sort((a, b) => a.frequencyHz - b.frequencyHz)
  if (points.some((point, index) => index > 0 && point.frequencyHz === points[index - 1].frequencyHz)) throw new Error('В CSV повторяются частоты спектра.')
  return points
}
