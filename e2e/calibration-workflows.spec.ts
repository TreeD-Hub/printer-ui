import { expect, test, type Locator, type Page } from '@playwright/test'

async function openCatalog(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Макросы', exact: true }).click()
  await expect(page.getByTestId('calibration-catalog')).toBeVisible()
}

async function expectTouchControl(control: Locator) {
  const bounds = await control.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.width).toBeGreaterThanOrEqual(48)
  expect(bounds!.height).toBeGreaterThanOrEqual(56)
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(960)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(544)
}

async function expectCalibrationOpen(page: Page) {
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toHaveCount(0)
  const screen = await page.getByTestId('screen-macros').boundingBox()
  expect(screen!.height).toBeGreaterThanOrEqual(528)
}

async function expectFullCalibration(page: Page) {
  await expectCalibrationOpen(page)
  for (const control of await page.getByTestId('screen-macros').locator('header button, footer button').all()) {
    await expectTouchControl(control)
  }
  await expect(page.getByRole('button', { name: 'Аварийная остановка', exact: true })).toBeVisible()
}

test('каталог с превью и папка Eddy помещаются над навигацией', async ({ page }, testInfo) => {
  await openCatalog(page)
  const catalog = page.getByTestId('calibration-catalog')
  const cards = catalog.locator('.macros-manager-workflow')
  const nav = await page.locator('.bottom-nav').boundingBox()
  await expect(cards).toHaveCount(3)
  await expect(cards.locator('svg.calibration-preview[aria-hidden="true"]')).toHaveCount(3)
  for (const card of await cards.all()) {
    await expectTouchControl(card)
    const rect = await card.boundingBox()
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(nav!.y)
    expect(await card.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true)
  }
  await page.screenshot({ path: testInfo.outputPath('calibration-catalog.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Датчик Eddy', exact: true }).click()
  await expect(catalog.getByRole('heading', { name: 'Eddy', exact: true })).toBeVisible()
  await expect(cards).toHaveCount(3)
  await expect(cards.locator('svg.calibration-preview[aria-hidden="true"]')).toHaveCount(3)
  for (const card of await cards.all()) await expectTouchControl(card)
  await page.screenshot({ path: testInfo.outputPath('calibration-eddy-folder.png'), animations: 'disabled' })
  await catalog.getByRole('button', { name: /^Автоматическая калибровка стола/ }).click()
  await page.getByRole('button', { name: 'К списку', exact: true }).click()
  await expect(catalog.getByRole('heading', { name: 'Eddy', exact: true })).toBeVisible()
  await catalog.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(cards).toHaveCount(3)
})

for (const title of ['PID-калибровка', 'Шейпер и ADXL']) {
  test(`${title}: шапка и действия доступны на touch canvas`, async ({ page }, testInfo) => {
    await openCatalog(page)
    await page.getByTestId('calibration-catalog').getByRole('button', { name: new RegExp(`^${title}`) }).click()
    const screen = page.getByTestId('screen-macros')
    const nav = title === 'PID-калибровка' ? await page.locator('.bottom-nav').boundingBox() : null
    if (title === 'PID-калибровка') await expect(page.locator('.bottom-nav')).toBeVisible()
    else await expectCalibrationOpen(page)
    for (const control of await screen.locator('header button, footer button').all()) {
      await expectTouchControl(control)
      if (nav) {
        const rect = (await control.boundingBox())!
        expect(rect.y + rect.height).toBeLessThanOrEqual(nav.y)
      }
    }
    await page.screenshot({ path: testInfo.outputPath('procedure-prepare.png'), animations: 'disabled' })
  })
}

for (const title of ['Ток катушки', 'Высота по бумаге', 'Температурная серия', 'Z0', 'Смещение Z', 'Повторяемость', 'Винты стола', 'Карта стола']) {
  test(`Eddy ${title}: подготовка и подробности не закрывают действия`, async ({ page }, testInfo) => {
    await openCatalog(page)
    await page.getByRole('button', { name: 'Датчик Eddy', exact: true }).click()
    await page.getByRole('button', { name: /^Калибровка датчика автоуровня/ }).click()
    await expect(page.getByRole('button', { name: /^(Начать калибровку|Продолжить: .+)$/ })).toBeVisible()
    const cardTitle = title === 'Высота по бумаге' ? 'Высота Eddy' : title === 'Температурная серия' ? 'Температура' : title
    await page.getByRole('region', { name: 'Фактическое состояние калибровок', exact: true }).getByRole('button', { name: new RegExp(cardTitle) }).click()
    const screen = page.getByTestId('screen-macros')
    await expectCalibrationOpen(page)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    const footer = screen.locator('footer')
    expect((await footer.getByRole('button').count())).toBeGreaterThan(0)
    for (const control of await screen.locator('header button, footer button').all()) {
      await expectTouchControl(control)
    }
    await page.screenshot({ path: testInfo.outputPath('eddy-prepare.png'), animations: 'disabled' })
    await page.getByRole('button', { name: 'Подробнее', exact: true }).click()
    for (const control of await footer.getByRole('button').all()) {
      await expectTouchControl(control)
    }
    await page.getByRole('button', { name: 'Скрыть', exact: true }).click()
  })
}

test('четыре винта → карта → сохранение → первый слой сохраняют полный canvas', async ({ page }, testInfo) => {
  await openCatalog(page)
  await page.getByRole('button', { name: 'Датчик Eddy', exact: true }).click()
  await page.getByRole('button', { name: /^Ручная калибровка стола/ }).click()
  const screwControls = page.getByRole('group', { name: 'Выбор винта', exact: true }).getByRole('button')
  await expect(screwControls).toHaveCount(4)
  await expectCalibrationOpen(page)
  await page.getByRole('button', { name: 'Измерить винты', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Проверить выравнивание', exact: true })).toBeEnabled()
  await expectFullCalibration(page)
  await page.getByRole('button', { name: 'Винт 2', exact: true }).click()
  await expect(page.getByText('Против часовой стрелки', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('screws-fullscreen.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Проверить выравнивание', exact: true }).click()
  await page.getByRole('button', { name: 'Измерить и сохранить', exact: true }).click()
  const mesh = page.getByRole('img', { name: 'Трёхмерная карта фактических высот стола', exact: true })
  await expect(mesh.getByTestId('mesh-measured-point')).toHaveCount(49)
  await expectFullCalibration(page)
  await expect(mesh).toHaveAttribute('data-yaw', '315')
  await page.getByRole('button', { name: 'Повернуть карту вправо', exact: true }).click()
  await expect(mesh).toHaveAttribute('data-yaw', '330')
  const rect = (await mesh.boundingBox())!
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width / 2 + 60, rect.y + rect.height / 2 + 20)
  await page.mouse.up()
  await expect(mesh).not.toHaveAttribute('data-yaw', '330')
  await page.getByRole('button', { name: 'Сброс вида', exact: true }).click()
  await expect(mesh).toHaveAttribute('data-yaw', '315')
  await expect(page.getByRole('status')).toHaveText('Карта сохранена. Калибровка завершена успешно.', { timeout: 15_000 })
  await page.screenshot({ path: testInfo.outputPath('mesh-fullscreen.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Значения', exact: true }).click()
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByRole('button', { name: '3D-карта', exact: true }).click()
  const next = page.getByRole('button', { name: 'Далее: первый слой', exact: true })
  await expect(next).toBeEnabled({ timeout: 15_000 })
  await next.click()
  await expect(page.getByRole('heading', { name: 'Первый слой', exact: true })).toBeVisible()
  await expectFullCalibration(page)
  await page.getByRole('button', { name: 'Завершить', exact: true }).click()
  await expect(page.locator('.bottom-nav')).toBeVisible()
})

test('ADXL → реальные спектры X/Y → сохранение → Завершить возвращает навигацию', async ({ page }, testInfo) => {
  await openCatalog(page)
  await page.getByRole('button', { name: /^Шейпер и ADXL/ }).click()
  await expectCalibrationOpen(page)
  await expect(page.getByRole('button', { name: 'К списку', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Подробнее', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Скрыть', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Считать ADXL', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Показания акселерометра', exact: true })).toBeVisible()
  await expectFullCalibration(page)
  await page.getByRole('button', { name: 'К тесту резонансов', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Подробнее', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Измерение резонансов', exact: true })).toBeVisible()
  await expectFullCalibration(page)
  await page.getByRole('button', { name: 'Измерить резонансы', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Измеренный спектр резонансов X', exact: true })).toBeVisible()
  const recommendation = page.getByRole('status', { name: 'Рекомендация по шейперу', exact: true })
  await expect(recommendation).toContainText('EI')
  await expect(recommendation).toContainText('51.4')
  await expectFullCalibration(page)
  await page.screenshot({ path: testInfo.outputPath('resonance-x-fullscreen.png'), animations: 'disabled' })
  await page.getByRole('tab', { name: 'Y', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Измеренный спектр резонансов Y', exact: true })).toBeVisible()
  await expect(recommendation).toContainText('MZV')
  await expect(recommendation).toContainText('42.2')
  await page.screenshot({ path: testInfo.outputPath('resonance-y-fullscreen.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Сохранить и перезапустить', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Калибровка завершена успешно. Настройки сохранены.' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Завершить', exact: true })).toBeEnabled({ timeout: 15_000 })
  await expectFullCalibration(page)
  await page.getByRole('button', { name: 'Завершить', exact: true }).click()
  await expect(page.locator('.bottom-nav')).toBeVisible()
  await expect(page.getByTestId('calibration-catalog')).toBeVisible()
})

test('ручной TESTZ использует полный canvas и отмена возвращает навигацию', async ({ page }, testInfo) => {
  await openCatalog(page)
  await page.getByRole('button', { name: 'Датчик Eddy', exact: true }).click()
  await page.getByRole('button', { name: /^Калибровка датчика автоуровня/ }).click()
  await page.getByRole('button', { name: /Высота Eddy/ }).click()
  await page.getByRole('button', { name: 'Подготовить сопло', exact: true }).click()
  await page.getByRole('button', { name: 'Сопло очищено · к бумаге', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Принять высоту и сохранить', exact: true })).toBeEnabled()
  await expectFullCalibration(page)
  for (const name of ['-1 мм', '-0.1 мм', '-0.05 мм', '+0.05 мм', '+0.1 мм', '+1 мм']) {
    await expectTouchControl(page.getByRole('button', { name, exact: true }))
  }
  await page.getByRole('button', { name: '+0.05 мм', exact: true }).click()
  await expect(page.getByRole('button', { name: '+0.05 мм', exact: true })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('height-fullscreen.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Отменить ручное измерение', exact: true }).click()
  await expect(page.getByRole('button', { name: 'К списку', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'К списку', exact: true }).click()
  await expect(page.locator('.bottom-nav')).toBeVisible()
})
