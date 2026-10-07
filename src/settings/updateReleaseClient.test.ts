// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  checkUpdateReleases,
  type UpdateReleaseTarget,
} from './updateReleaseClient'

function releases(tags: string[]): Response {
  return new Response(JSON.stringify(tags.map((tag) => ({
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [{ name: 'release.json' }],
  }))), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

describe('update release client', () => {
  it('checks printer UI and core repositories independently', async () => {
    const targets: UpdateReleaseTarget[] = [
      {
        id: 'printer-ui',
        label: 'TreeD Printer UI',
        currentVersion: 'ui-main-41-1',
        releaseApiUrl: 'https://api.github.com/repos/TreeD-Hub/printer-ui/releases',
        tagPrefix: 'ui-main-',
        versionScheme: 'tag',
      },
      {
        id: 'printer-core',
        label: 'TreeD Printer Core',
        currentVersion: '0.1.0',
        releaseApiUrl: 'https://api.github.com/repos/TreeD-Hub/printer-core/releases',
        tagPrefix: 'v',
        versionScheme: 'semver',
      },
    ]
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(releases(['ui-main-42-1']))
      .mockResolvedValueOnce(releases(['v0.2.0', 'v0.1.0']))

    await expect(checkUpdateReleases(targets, fetchImpl)).resolves.toEqual([
      {
        id: 'printer-ui',
        label: 'TreeD Printer UI',
        currentVersion: 'ui-main-41-1',
        latestTag: 'ui-main-42-1',
        latestVersion: 'ui-main-42-1',
        status: 'available',
        message: 'Доступно обновление ui-main-42-1.',
      },
      {
        id: 'printer-core',
        label: 'TreeD Printer Core',
        currentVersion: '0.1.0',
        latestTag: 'v0.2.0',
        latestVersion: '0.2.0',
        status: 'available',
        message: 'Доступно обновление 0.2.0.',
      },
    ])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/TreeD-Hub/printer-ui/releases',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/TreeD-Hub/printer-core/releases',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it.each([
    ['ui-main-53-1', 'ui-main-54-1', 'available'],
    ['ui-main-9-1', 'ui-main-10-1', 'available'],
    ['ui-main-54-9', 'ui-main-54-10', 'available'],
    ['ui-main-54-1', 'ui-main-54-1', 'latest'],
    ['ui-main-55-1', 'ui-main-54-9', 'latest'],
    ['ui-main-54-2', 'ui-main-54-1', 'latest'],
    ['ui-main-9007199254740992-1', 'ui-main-9007199254740993-1', 'available'],
    ['unknown', 'ui-main-54-1', 'unknown'],
    ['0.1.0', 'ui-main-54-1', 'unknown'],
    ['ui-dev-53-1', 'ui-main-54-1', 'unknown'],
    ['ui-main-53', 'ui-main-54-1', 'unknown'],
    ['ui-main-0-1', 'ui-main-54-1', 'unknown'],
    ['ui-main-53-1', 'ui-main-invalid', 'error'],
  ])('сравнивает установленную сборку %s с %s: %s', async (currentVersion, latestTag, status) => {
    const fetchImpl = vi.fn().mockResolvedValue(releases([latestTag]))
    const [result] = await checkUpdateReleases([{
      id: 'printer-ui',
      label: 'TreeD Printer UI',
      currentVersion,
      releaseApiUrl: 'https://api.github.com/repos/TreeD-Hub/printer-ui/releases',
      tagPrefix: 'ui-main-',
      versionScheme: 'tag',
    }], fetchImpl)

    expect(result).toMatchObject({ currentVersion, status })
    if (status !== 'error') {
      expect(result).toMatchObject({ latestTag, latestVersion: latestTag })
    }
    if (status === 'unknown') {
      expect(result.message).toBe('Неизвестен tag установленной сборки UI.')
    }
  })

  it('передаёт CI tag в live bundle и конфиг проверки обновлений', async () => {
    vi.stubEnv('UI_RELEASE_TAG', 'ui-main-53-1')
    vi.stubEnv('VITE_UI_RELEASE_TAG', 'ui-main-53-1')
    try {
      const { default: configureVite } = await import('../../vite.config')
      const { UPDATE_RELEASE_TARGETS } = await import('./config')
      const config = configureVite({ command: 'build', mode: 'live' })

      expect(config.define?.['import.meta.env.VITE_UI_RELEASE_TAG']).toBe('"ui-main-53-1"')
      expect(UPDATE_RELEASE_TARGETS.find((target) => target.id === 'printer-ui')?.currentVersion)
        .toBe('ui-main-53-1')

      vi.stubEnv('UI_RELEASE_TAG', undefined)
      expect(configureVite({ command: 'build', mode: 'live' })
        .define?.['import.meta.env.VITE_UI_RELEASE_TAG']).toBe('"unknown"')
      vi.stubEnv('VITE_UI_RELEASE_TAG', undefined)
      vi.resetModules()
      const { UPDATE_RELEASE_TARGETS: unknownTargets } = await import('./config')
      expect(unknownTargets.find((target) => target.id === 'printer-ui')?.currentVersion)
        .toBe('unknown')
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})
