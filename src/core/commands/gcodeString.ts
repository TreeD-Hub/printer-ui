const SIMPLE_GCODE_TOKEN_PATTERN = /^[A-Za-z0-9_.:-]+$/

export function serializeGcodeStringParameter(value: string): string {
  if (value.length === 0) {
    throw new Error('NAME должен быть непустой строкой.')
  }

  if (value.includes('\r') || value.includes('\n') || value.includes(';')) {
    throw new Error('NAME содержит символы, которые нельзя безопасно передать в G-code.')
  }

  if (SIMPLE_GCODE_TOKEN_PATTERN.test(value)) {
    return value
  }

  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
