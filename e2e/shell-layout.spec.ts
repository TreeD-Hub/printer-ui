import { expect, test } from '@playwright/test'

type Rect = {
  x: number
  y: number
  width: number
  height: number
}

function requireRect(rect: Rect | null, name: string): Rect {
  expect(rect, `${name}: элемент не найден или не имеет размера`).not.toBeNull()
  return rect as Rect
}

function isInsideRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

function intersectsRect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}

test('shell frame matches 960x544 contract', async ({ page }) => {
  await page.goto('/')

  const shell = page.getByTestId('screen-shell')
  await expect(shell).toBeVisible()

  const box = await shell.boundingBox()

  expect(box?.width).toBe(960)
  expect(box?.height).toBe(544)
})

test('captures screenshot and validates layout geometry', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByText('TreeD Принтер')).toBeVisible()

  const shell = page.getByTestId('screen-shell')
  await expect(shell).toBeVisible()

  const topBar = page.locator('.top-bar')
  const contentGrid = page.locator('.content-grid')
  const bottomNav = page.locator('.bottom-nav')

  const jobCard = page.locator('.job-card')
  const statsCard = page.locator('.stats-card')
  const actionStack = page.locator('.action-stack')
  const processCard = page.locator('.process-card')
  const zoffsetCard = page.locator('.zoffset-card')

  const [
    shellRectRaw,
    topBarRectRaw,
    contentGridRectRaw,
    bottomNavRectRaw,
    jobCardRectRaw,
    statsCardRectRaw,
    actionStackRectRaw,
    processCardRectRaw,
    zoffsetCardRectRaw,
  ] = await Promise.all([
    shell.boundingBox(),
    topBar.boundingBox(),
    contentGrid.boundingBox(),
    bottomNav.boundingBox(),
    jobCard.boundingBox(),
    statsCard.boundingBox(),
    actionStack.boundingBox(),
    processCard.boundingBox(),
    zoffsetCard.boundingBox(),
  ])

  const shellRect = requireRect(shellRectRaw, 'shell')
  const topBarRect = requireRect(topBarRectRaw, 'top-bar')
  const contentGridRect = requireRect(contentGridRectRaw, 'content-grid')
  const bottomNavRect = requireRect(bottomNavRectRaw, 'bottom-nav')
  const jobCardRect = requireRect(jobCardRectRaw, 'job-card')
  const statsCardRect = requireRect(statsCardRectRaw, 'stats-card')
  const actionStackRect = requireRect(actionStackRectRaw, 'action-stack')
  const processCardRect = requireRect(processCardRectRaw, 'process-card')
  const zoffsetCardRect = requireRect(zoffsetCardRectRaw, 'zoffset-card')

  expect(topBarRect.y).toBeGreaterThanOrEqual(shellRect.y)
  expect(contentGridRect.y).toBeGreaterThanOrEqual(topBarRect.y + topBarRect.height - 1)
  expect(bottomNavRect.y).toBeGreaterThanOrEqual(contentGridRect.y + contentGridRect.height - 1)

  expect(isInsideRect(contentGridRect, jobCardRect)).toBeTruthy()
  expect(isInsideRect(contentGridRect, statsCardRect)).toBeTruthy()
  expect(isInsideRect(contentGridRect, actionStackRect)).toBeTruthy()
  expect(isInsideRect(contentGridRect, processCardRect)).toBeTruthy()
  expect(isInsideRect(contentGridRect, zoffsetCardRect)).toBeTruthy()

  expect(intersectsRect(jobCardRect, statsCardRect)).toBeFalsy()
  expect(intersectsRect(jobCardRect, processCardRect)).toBeFalsy()
  expect(intersectsRect(statsCardRect, actionStackRect)).toBeFalsy()
  expect(intersectsRect(processCardRect, zoffsetCardRect)).toBeFalsy()

  const actionsDelta = Math.abs(statsCardRect.height - actionStackRect.height)
  expect(actionsDelta).toBeLessThanOrEqual(2)

  const screenshotPath = testInfo.outputPath('dashboard-shell.png')
  await shell.screenshot({ path: screenshotPath, animations: 'disabled' })
  await testInfo.attach('dashboard-shell', {
    path: screenshotPath,
    contentType: 'image/png',
  })
})
