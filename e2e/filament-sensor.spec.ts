import { expect, test } from '@playwright/test'

test('filament sensor controls fit the 960x544 touch contract', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Управление', exact: true }).click()
  await page.getByTestId('control-group-filament').click()

  const panel = page.locator('.control-filament-panel')
  await expect(panel).toBeVisible()
  await expect(page.getByText('Нить установлена')).toBeVisible()

  const fit = await panel.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
    fitsWidth: element.scrollWidth <= element.clientWidth,
    fitsHeight: element.scrollHeight <= element.clientHeight,
  }))
  expect(fit.width).toBeGreaterThan(0)
  expect(fit.height).toBeGreaterThan(0)
  expect(fit.fitsWidth).toBeTruthy()
  expect(fit.fitsHeight).toBeTruthy()

  for (const testId of [
    'filament-mode-presence',
    'filament-mode-motion',
    'filament-sensitivity-low',
    'filament-sensitivity-medium',
    'filament-sensitivity-high',
  ]) {
    const box = await page.getByTestId(testId).boundingBox()
    expect(box, `${testId} must be visible`).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(48)
  }

  await page.getByTestId('filament-sensitivity-high').click()
  const confirm = page.getByRole('dialog', { name: 'Подтверждение перезапуска Klipper' })
  await expect(confirm).toBeVisible()
  await expect(page.getByTestId('filament-sensitivity-confirm')).toBeVisible()

  expect(consoleErrors).toEqual([])
})
