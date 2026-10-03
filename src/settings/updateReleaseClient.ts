export type UpdateReleaseStatus = 'unknown' | 'latest' | 'available' | 'error' | 'mock'

export type UpdateReleaseTarget = {
  id: string
  label: string
  currentVersion: string
  releaseApiUrl: string
  tagPrefix: string
  versionScheme: 'tag' | 'semver'
}

export type UpdateReleaseResult = {
  id: string
  label: string
  currentVersion: string
  latestTag: string | null
  latestVersion: string | null
  status: UpdateReleaseStatus
  message: string
  canApply?: boolean
  capability?: { supported: boolean; reasonCode: string | null; reason: string | null }
}

type GitHubRelease = {
  tag_name?: unknown
  draft?: unknown
  prerelease?: unknown
}

function normalizeSemver(value: string): string | null {
  const match = value.match(/^v?(\d+\.\d+\.\d+)$/)
  return match?.[1] ?? null
}

function compareSemver(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number(part))
  const rightParts = right.split('.').map((part) => Number(part))

  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (delta !== 0) {
      return delta
    }
  }

  return 0
}

function isReleaseList(value: unknown): value is GitHubRelease[] {
  return Array.isArray(value)
}

function findLatestReleaseTag(releases: GitHubRelease[], tagPrefix: string): string | null {
  for (const release of releases) {
    if (release.draft === true || release.prerelease === true) {
      continue
    }

    const tagName = release.tag_name
    if (typeof tagName === 'string' && tagName.startsWith(tagPrefix)) {
      return tagName
    }
  }

  return null
}

async function checkUpdateRelease(
  target: UpdateReleaseTarget,
  fetchImpl: typeof fetch,
): Promise<UpdateReleaseResult> {
  try {
    const response = await fetchImpl(target.releaseApiUrl, {
      headers: { accept: 'application/vnd.github+json' },
      method: 'GET',
    })

    if (!response.ok) {
      throw new Error(`GitHub Releases вернул HTTP ${response.status}.`)
    }

    const body = await response.json() as unknown
    if (!isReleaseList(body)) {
      throw new Error('GitHub Releases вернул неожиданный формат.')
    }

    const latestTag = findLatestReleaseTag(body, target.tagPrefix)
    if (latestTag === null) {
      return {
        id: target.id,
        label: target.label,
        currentVersion: target.currentVersion,
        latestTag: null,
        latestVersion: null,
        status: 'unknown',
        message: 'Подходящий release не найден.',
      }
    }

    if (target.versionScheme === 'tag') {
      return {
        id: target.id,
        label: target.label,
        currentVersion: target.currentVersion,
        latestTag,
        latestVersion: latestTag,
        status: 'latest',
        message: 'Последний релиз найден.',
      }
    }

    const latestVersion = normalizeSemver(latestTag)
    if (latestVersion === null) {
      throw new Error(`Release tag ${latestTag} не похож на semver.`)
    }

    const status = compareSemver(latestVersion, target.currentVersion) > 0
      ? 'available'
      : 'latest'

    return {
      id: target.id,
      label: target.label,
      currentVersion: target.currentVersion,
      latestTag,
      latestVersion,
      status,
      message: status === 'available'
        ? `Доступно обновление ${latestVersion}.`
        : 'Установлена актуальная версия.',
    }
  } catch (error) {
    return {
      id: target.id,
      label: target.label,
      currentVersion: target.currentVersion,
      latestTag: null,
      latestVersion: null,
      status: 'error',
      message: error instanceof Error ? error.message : 'Не удалось проверить release.',
    }
  }
}

export function createUnknownUpdateReleaseResults(
  targets: UpdateReleaseTarget[],
): UpdateReleaseResult[] {
  return targets.map((target) => ({
    id: target.id,
    label: target.label,
    currentVersion: target.currentVersion,
    latestTag: null,
    latestVersion: null,
    status: 'unknown',
    message: 'Нет данных.',
  }))
}

export function createMockUpdateReleaseResults(
  targets: UpdateReleaseTarget[],
): UpdateReleaseResult[] {
  return targets.map((target) => target.id === 'printer-ui'
    ? {
        id: target.id,
        label: 'Интерфейс TreeD',
        currentVersion: target.currentVersion,
        latestTag: 'ui-main-42-1',
        latestVersion: 'ui-main-42-1',
        status: 'available',
        message: 'Проверочный выпуск интерфейса доступен.',
        canApply: true,
      }
    : {
        id: target.id,
        label: 'Система TreeD',
        currentVersion: target.currentVersion,
        latestTag: 'v0.2.0',
        latestVersion: '0.2.0',
        status: 'mock',
        message: 'Системный выпуск доступен только на проверенной A/B-платформе.',
        canApply: false,
        capability: {
          supported: false,
          reasonCode: 'ab_platform_unverified',
          reason: 'В текущей среде проверка системной A/B-платформы не выполняется.',
        },
      })
}

export function checkUpdateReleases(
  targets: UpdateReleaseTarget[],
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateReleaseResult[]> {
  return Promise.all(targets.map((target) => checkUpdateRelease(target, fetchImpl)))
}
