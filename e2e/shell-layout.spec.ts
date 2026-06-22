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

test('shell exposes nothing terminal visual contract', async ({ page }) => {
  await page.goto('/')

  const shell = page.getByTestId('screen-shell')
  await expect(shell).toBeVisible()

  const contract = await page.evaluate(() => {
    const root = document.documentElement
    const shellElement = document.querySelector<HTMLElement>('.screen-shell')
    const topBar = document.querySelector<HTMLElement>('.top-bar')
    const statusLogo = document.querySelector<HTMLElement>('.dashboard-status-logo')
    const navItem = document.querySelector<HTMLElement>('.nav-item.is-active')
    const powerButton = document.querySelector<HTMLElement>('.power-btn')

    return {
      fontFamily: getComputedStyle(root).fontFamily,
      primary: getComputedStyle(root).getPropertyValue('--color-primary').trim(),
      shellBackground: shellElement ? getComputedStyle(shellElement).backgroundImage : '',
      hasTopBar: topBar !== null,
      statusLogoFont: statusLogo ? getComputedStyle(statusLogo).fontFamily : '',
      activeNavRadius: navItem ? Number.parseFloat(getComputedStyle(navItem).borderRadius) : -1,
      powerRadius: powerButton ? Number.parseFloat(getComputedStyle(powerButton).borderRadius) : -1,
      activeNavBorder: navItem ? getComputedStyle(navItem).borderColor : '',
      activeNavDot: navItem ? getComputedStyle(navItem, '::after').backgroundColor : '',
    }
  })

  expect(contract.fontFamily).toContain('Cascadia Mono')
  expect(contract.primary).toBe('#ff2a2a')
  expect(contract.hasTopBar).toBe(false)
  expect(contract.statusLogoFont).toContain('Cascadia Mono')
  expect(contract.activeNavRadius).toBeLessThanOrEqual(8)
  expect(contract.powerRadius).toBeLessThanOrEqual(8)
  expect(contract.activeNavBorder).toBe('rgb(244, 244, 240)')
  expect(contract.activeNavDot).toBe('rgb(255, 42, 42)')
})

test('captures screenshot and validates layout geometry', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.locator('.dashboard-status-logo')).toHaveText('TreeD')
  await page.getByRole('button', { name: 'Файлы' }).click()
  await page.getByTestId('print-file-card').first().click()
  await page.getByTestId('print-file-start-button').click()
  await expect(page.getByTestId('print-tune-group-progress')).toBeVisible()

  const shell = page.getByTestId('screen-shell')
  await expect(shell).toBeVisible()

  const contentGrid = page.locator('.content-grid')
  const bottomNav = page.locator('.bottom-nav')

  const jobCard = page.locator('.job-card')
  const statsCard = page.locator('.stats-card')
  const actionStack = page.locator('.action-stack')
  const processCard = page.locator('.process-card')
  const zoffsetCard = page.locator('.zoffset-card')

  const [
    shellRectRaw,
    contentGridRectRaw,
    bottomNavRectRaw,
    jobCardRectRaw,
    statsCardRectRaw,
    actionStackRectRaw,
    processCardRectRaw,
    zoffsetCardRectRaw,
  ] = await Promise.all([
    shell.boundingBox(),
    contentGrid.boundingBox(),
    bottomNav.boundingBox(),
    jobCard.boundingBox(),
    statsCard.boundingBox(),
    actionStack.boundingBox(),
    processCard.boundingBox(),
    zoffsetCard.boundingBox(),
  ])

  const shellRect = requireRect(shellRectRaw, 'shell')
  const contentGridRect = requireRect(contentGridRectRaw, 'content-grid')
  const bottomNavRect = requireRect(bottomNavRectRaw, 'bottom-nav')
  const jobCardRect = requireRect(jobCardRectRaw, 'job-card')
  const statsCardRect = requireRect(statsCardRectRaw, 'stats-card')
  const actionStackRect = requireRect(actionStackRectRaw, 'action-stack')
  const processCardRect = requireRect(processCardRectRaw, 'process-card')
  const zoffsetCardRect = requireRect(zoffsetCardRectRaw, 'zoffset-card')

  await expect(page.locator('.top-bar')).toHaveCount(0)
  expect(contentGridRect.y).toBeGreaterThanOrEqual(shellRect.y)
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

test('files screen keeps four cards per row and scrolls vertically', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Файлы' }).click()

  const filesScreen = page.getByTestId('screen-files')
  const scrollArea = page.getByTestId('files-scroll-area')
  const fileCards = page.getByTestId('print-file-card')
  const filesHead = page.locator('.files-screen-head')
  const sortByNameButton = page.getByTestId('files-sort-name')
  const sortByAddedAtButton = page.getByTestId('files-sort-addedAt')

  await expect(filesScreen).toBeVisible()
  await expect(fileCards).toHaveCount(12)
  await expect(sortByNameButton).toHaveAttribute('aria-pressed', 'true')
  await expect(fileCards.nth(0)).toContainText('bearing_bracket_mk2.gcode')

  await sortByAddedAtButton.click()

  await expect(sortByAddedAtButton).toHaveAttribute('aria-pressed', 'true')
  await expect(fileCards.nth(0)).toContainText('fan_shroud_prototype.gcode')

  const [scrollRectRaw, headRaw, firstRaw, secondRaw, thirdRaw, fourthRaw, fifthRaw, lastRaw] = await Promise.all([
    scrollArea.boundingBox(),
    filesHead.boundingBox(),
    fileCards.nth(0).boundingBox(),
    fileCards.nth(1).boundingBox(),
    fileCards.nth(2).boundingBox(),
    fileCards.nth(3).boundingBox(),
    fileCards.nth(4).boundingBox(),
    fileCards.nth(11).boundingBox(),
  ])

  const scrollRect = requireRect(scrollRectRaw, 'files-scroll-area')
  const headRect = requireRect(headRaw, 'files-screen-head')
  const firstRect = requireRect(firstRaw, 'file-card-1')
  const secondRect = requireRect(secondRaw, 'file-card-2')
  const thirdRect = requireRect(thirdRaw, 'file-card-3')
  const fourthRect = requireRect(fourthRaw, 'file-card-4')
  const fifthRect = requireRect(fifthRaw, 'file-card-5')
  const lastRectBeforeScroll = requireRect(lastRaw, 'file-card-12 before scroll')

  expect(Math.abs(firstRect.y - secondRect.y)).toBeLessThanOrEqual(2)
  expect(Math.abs(firstRect.y - thirdRect.y)).toBeLessThanOrEqual(2)
  expect(Math.abs(firstRect.y - fourthRect.y)).toBeLessThanOrEqual(2)
  expect(secondRect.x).toBeGreaterThan(firstRect.x)
  expect(thirdRect.x).toBeGreaterThan(secondRect.x)
  expect(fourthRect.x).toBeGreaterThan(thirdRect.x)
  expect(fifthRect.y).toBeGreaterThan(firstRect.y + 20)
  expect(lastRectBeforeScroll.y).toBeGreaterThan(scrollRect.y + scrollRect.height)

  const scrollMetrics = await scrollArea.evaluate((node) => ({
    scrollTop: node.scrollTop,
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
  }))

  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight)

  const screenshotPath = testInfo.outputPath('files-library.png')
  await filesScreen.screenshot({ path: screenshotPath, animations: 'disabled' })
  await testInfo.attach('files-library', {
    path: screenshotPath,
    contentType: 'image/png',
  })

  await scrollArea.evaluate((node) => {
    node.scrollTop = 120
  })

  const headRectAfterScroll = await filesHead.boundingBox()
  if (headRectAfterScroll !== null) {
    expect(headRectAfterScroll.y).toBeLessThan(headRect.y - 20)
  }

  await scrollArea.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })

  const lastRectAfterScroll = requireRect(await fileCards.nth(11).boundingBox(), 'file-card-12 after scroll')
  expect(lastRectAfterScroll.y + lastRectAfterScroll.height).toBeLessThanOrEqual(scrollRect.y + scrollRect.height + 2)
})
