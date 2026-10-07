import { moonrakerUrl } from '../config'

// Настройка принадлежит Moonraker; секрет сервера изображений остаётся на принтере.
export async function requestAiDetectionSettings(enabled?: boolean): Promise<boolean> {
  const response = await fetch(`${moonrakerUrl}/server/treed/detection/settings`, {
    method: enabled === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: enabled === undefined ? undefined : JSON.stringify({ enabled }),
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`Не удалось прочитать или сохранить настройку AI (HTTP ${response.status}).`)
  const settings: unknown = await response.json()
  if (typeof settings !== 'object' || settings === null || !('enabled' in settings)
    || typeof settings.enabled !== 'boolean') {
    throw new Error('Принтер не подтвердил настройку AI-детекции.')
  }
  if (enabled !== undefined && settings.enabled !== enabled) {
    throw new Error('Принтер не подтвердил изменение настройки AI-детекции.')
  }
  return settings.enabled
}
