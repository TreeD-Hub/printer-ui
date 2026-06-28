import { expect, test, type Locator } from '@playwright/test'

type Rect = {
  x: number
  y: number
  width: number
  height: number
}

async function requireRect(locator: Locator, name: string): Promise<Rect> {
  const rect = await locator.boundingBox()
  expect(rect, `${name}: элемент не найден или не имеет размера`).not.toBeNull()
  return rect as Rect
}

function isInsideRect(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
}

test('temperature controls fit the 960x544 touch contract', async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Управление', exact: true }).click()
  await page.getByTestId('control-group-heating').click()

  const shell = page.getByTestId('screen-shell')
  const heatingGrid = page.locator('.control-heating-grid')
  const chart = page.getByTestId('control-heating-chart')
  const nozzleMinus = page.getByTestId('control-heating-nozzle-minus')
  const nozzlePlus = page.getByTestId('control-heating-nozzle-plus')

  await expect(chart).toBeVisible()
  await expect(page.getByTestId('chart-current-nozzle')).toHaveCount(1)
  await expect(page.getByTestId('chart-current-bed')).toHaveCount(1)
  await expect(chart.locator('.print-temp-chart-marker')).toHaveCount(2)
  await expect(page.getByTestId('chart-target-nozzle')).toHaveCount(1)
  await expect(page.getByTestId('chart-target-bed')).toHaveCount(1)

  const [shellRect, heatingRect, minusRect, plusRect] = await Promise.all([
    requireRect(shell, 'screen-shell'),
    requireRect(heatingGrid, 'control-heating-grid'),
    requireRect(nozzleMinus, 'nozzle-minus'),
    requireRect(nozzlePlus, 'nozzle-plus'),
  ])

  expect(isInsideRect(shellRect, heatingRect)).toBeTruthy()
  expect(minusRect.width).toBeGreaterThanOrEqual(54)
  expect(minusRect.height).toBeGreaterThanOrEqual(54)
  expect(plusRect.width).toBeGreaterThanOrEqual(54)
  expect(plusRect.height).toBeGreaterThanOrEqual(54)

  const visualContract = await page.evaluate(() => {
    const chartElement = document.querySelector<SVGElement>('.control-heating-chart-block .print-temp-chart-svg')
    const targetLine = document.querySelector<SVGElement>('.control-heating-chart-block .print-temp-chart-target')
    const stepperElement = document.querySelector<HTMLElement>('.control-heating-row .print-tune-compact-stepper')
    const scrollArea = document.querySelector<HTMLElement>('.control-scroll-area')

    return {
      chartBackgroundColor: chartElement ? getComputedStyle(chartElement).backgroundColor : '',
      targetStroke: targetLine ? getComputedStyle(targetLine).stroke : '',
      stepperBackgroundImage: stepperElement ? getComputedStyle(stepperElement).backgroundImage : '',
      stepperBoxShadow: stepperElement ? getComputedStyle(stepperElement).boxShadow : '',
      fitsWidth: scrollArea ? scrollArea.scrollWidth <= scrollArea.clientWidth : false,
      fitsHeight: scrollArea ? scrollArea.scrollHeight <= scrollArea.clientHeight : false,
    }
  })

  expect(visualContract.chartBackgroundColor).not.toBe('rgb(0, 0, 0)')
  expect(visualContract.targetStroke).not.toBe('none')
  expect(visualContract.stepperBackgroundImage).toBe('none')
  expect(visualContract.stepperBoxShadow).toBe('none')
  expect(visualContract.fitsWidth).toBeTruthy()
  expect(visualContract.fitsHeight).toBeTruthy()

  const hideNozzle = page.getByRole('button', { name: 'Скрыть сопло на графике' })
  await expect(hideNozzle).toHaveAttribute('aria-pressed', 'true')
  expect((await requireRect(hideNozzle, 'nozzle legend')).height).toBeGreaterThanOrEqual(48)
  await hideNozzle.click()
  await expect(page.getByTestId('chart-current-nozzle')).toHaveCount(0)
  const showNozzle = page.getByRole('button', { name: 'Показать сопло на графике' })
  await expect(showNozzle).toHaveAttribute('aria-pressed', 'false')
  await showNozzle.click()
  await expect(page.getByTestId('chart-current-nozzle')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Скрыть сопло на графике' })).toHaveAttribute('aria-pressed', 'true')

  const panelScreenshotPath = testInfo.outputPath('temperature-panel.png')
  await heatingGrid.screenshot({ path: panelScreenshotPath, animations: 'disabled' })
  await testInfo.attach('temperature-panel', { path: panelScreenshotPath, contentType: 'image/png' })

  await page.getByTestId('control-heating-nozzle-input').click()
  const clearKey = page.getByRole('button', { name: 'Очистить температуру' })
  const backspaceKey = page.getByRole('button', { name: 'Удалить последний символ' })
  const zeroKey = page.getByRole('button', { name: 'Цифра 0' })
  const submitKey = page.getByRole('button', { name: 'Ввод' })

  for (const [name, locator] of [
    ['clear', clearKey],
    ['backspace', backspaceKey],
    ['zero', zeroKey],
  ] as const) {
    const rect = await requireRect(locator, `${name} key`)
    expect(rect.height).toBeGreaterThanOrEqual(54)
  }
  await page.getByRole('button', { name: 'Цифра 2' }).click()
  await page.getByRole('button', { name: 'Цифра 4' }).click()
  await zeroKey.click()
  await expect(page.locator('.print-temp-keyboard-display')).toContainText('240')
  await backspaceKey.click()
  await expect(page.locator('.print-temp-keyboard-display')).toContainText('24')
  await clearKey.click()
  await expect(page.locator('.print-temp-keyboard-display')).toHaveText('')

  const keyboardScreenshotPath = testInfo.outputPath('temperature-keyboard.png')
  await heatingGrid.screenshot({ path: keyboardScreenshotPath, animations: 'disabled' })
  await testInfo.attach('temperature-keyboard', { path: keyboardScreenshotPath, contentType: 'image/png' })

  await page.getByRole('button', { name: 'Цифра 2' }).click()
  await page.getByRole('button', { name: 'Цифра 4' }).click()
  await zeroKey.click()
  await submitKey.click()
  await expect(submitKey).toHaveCount(0)

  expect(consoleErrors).toEqual([])
})
