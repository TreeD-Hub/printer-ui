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
        currentVersion: '0.1.0',
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
        currentVersion: '0.1.0',
        latestTag: 'ui-main-42-1',
        latestVersion: 'ui-main-42-1',
        status: 'latest',
        message: 'Последний релиз найден.',
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
})
