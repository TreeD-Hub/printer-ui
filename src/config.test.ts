// @vitest-environment node
import { resolveConfig } from 'vite'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

it('использует локальный Moonraker в сборке принтера и адрес окружения в dev', async () => {
  vi.stubEnv('VITE_MOONRAKER_URL', 'http://192.0.2.10')

  const buildConfig = await resolveConfig({}, 'build', 'live')
  expect(buildConfig.define?.['import.meta.env.VITE_MOONRAKER_URL'])
    .toBe(JSON.stringify('http://127.0.0.1:7125'))

  const devConfig = await resolveConfig({}, 'serve', 'live')
  expect(devConfig.define?.['import.meta.env.VITE_MOONRAKER_URL']).toBeUndefined()
  expect(devConfig.env.VITE_MOONRAKER_URL).toBe('http://192.0.2.10')
})
