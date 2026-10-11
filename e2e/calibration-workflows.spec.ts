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

async function expectFullCalibration(page: Page) {
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toHaveCount(0)
  const screen = await page.getByTestId('screen-macros').boundingBox()
  expect(screen!.height).toBeGreaterThanOrEqual(528)
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
  await expect(cards).toHaveCount(6)
  await expect(cards.locator('svg.calibration-preview[aria-hidden="true"]')).toHaveCount(6)
  for (const card of await cards.all()) {
    await expectTouchControl(card)
    const rect = await card.boundingBox()
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(nav!.y)
    expect(await card.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true)
  }
  await page.screenshot({ path: testInfo.outputPath('calibration-catalog.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Датчик Eddy', exact: true }).click()
  await expect(catalog.getByRole('heading', { name: 'Eddy', exact: true })).toBeVisible()
  await expect(cards).toHaveCount(4)
  await expect(cards.locator('svg.calibration-preview[aria-hidden="true"]')).toHaveCount(4)
  for (const card of await cards.all()) await expectTouchControl(card)
  await page.screenshot({ path: testInfo.outputPath('calibration-eddy-folder.png'), animations: 'disabled' })
  await catalog.getByRole('button', { name: /^Карта стола/ }).click()
  await page.getByRole('button', { name: 'В папку Eddy', exact: true }).click()
  await expect(catalog.getByRole('heading', { name: 'Eddy', exact: true })).toBeVisible()
  await catalog.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(cards).toHaveCount(6)
})

for (const title of ['PID-калибровка', 'Шейпер и ADXL', 'Подача экструдера', 'Профиль материала', 'Сервисная телеметрия']) {
  test(`${title}: шапка и действия доступны на touch canvas`, async ({ page }, testInfo) => {
    await openCatalog(page)
    await page.getByTestId('calibration-catalog').getByRole('button', { name: new RegExp(`^${title}`) }).click()
    const screen = page.getByTestId('screen-macros')
    for (const control of await screen.locator('header button, footer button').all()) {
      await expectTouchControl(control)
      const rect = await control.boundingBox()
      const nav = await page.locator('.bottom-nav').boundingBox()
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(nav!.y)
    }
    await page.screenshot({ path: testInfo.outputPath('procedure-prepare.png'), animations: 'disabled' })
  })
}

for (const title of ['Код тока катушки', 'Высота по бумаге', 'Температурная серия', 'Z0', 'Смещения Z', 'Повторяемость', 'Винты стола', 'Карта стола', 'XY-смещение', 'Первый слой']) {
  test(`Eddy ${title}: подготовка и подробности не закрывают действия`, async ({ page }, testInfo) => {
    await openCatalog(page)
    await page.getByRole('button', { name: 'Датчик Eddy', exact: true }).click()
    await page.getByRole('button', { name: /^Калибровка Eddy/ }).click()
    const cardTitle = title === 'Высота по бумаге' ? 'Высота Eddy' : title === 'Температурная серия' ? 'Температура' : title
    await page.getByRole('region', { name: 'Фактическое состояние калибровок', exact: true }).getByRole('button', { name: new RegExp(cardTitle) }).click()
    const screen = page.getByTestId('screen-macros')
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.locator('.bottom-nav')).toBeVisible()
    const nav = (await page.locator('.bottom-nav').boundingBox())!
    const footer = screen.locator('footer')
    expect((await footer.getByRole('button').count())).toBeGreaterThan(0)
    for (const control of await screen.locator('header button, footer button').all()) {
      await expectTouchControl(control)
      const rect = (await control.boundingBox())!
      expect(rect.y + rect.height).toBeLessThanOrEqual(nav.y)
    }
    await page.screenshot({ path: testInfo.outputPath('eddy-prepare.png'), animations: 'disabled' })
    await page.getByRole('button', { name: 'Подробнее', exact: true }).click()
    for (const control of await footer.getByRole('button').all()) {
      await expectTouchControl(control)
      const rect = (await control.boundingBox())!
      expect(rect.y + rect.height).toBeLessThanOrEqual(nav.y)
    }
    await page.getByRole('button', { name: 'Закрыть подробности', exact: true }).click()
  })
}

test('ввод экструдера сохраняет доступность при ошибке диапазона', async ({ page }) => {
  await openCatalog(page)
  await page.getByRole('button', { name: /^Подача экструдера/ }).click()
  await page.getByRole('button', { name: 'Запрошенная длина, мм', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Изменить: Запрошенная длина', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Цифра 1', exact: true }).click()
  await dialog.getByRole('button', { name: 'Цифра 2', exact: true }).click()
  await dialog.getByRole('button', { name: 'Цифра 1', exact: true }).click()
  await expect(dialog.getByText('Значение вне допустимого диапазона.', { exact: true })).toBeVisible()
  for (const control of await dialog.getByRole('button').all()) await expectTouchControl(control)
  await dialog.getByRole('button', { name: 'Ввод', exact: true }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Запрошенная длина, мм', exact: true })).toHaveText('100')
})

test('пять тестов материала выбирают файл касанием и требуют обе проверки', async ({ page }, testInfo) => {
  for (const [index, title] of ['Pressure Advance', 'Расход', 'Температура', 'Ретракт', 'Макс. поток'].entries()) {
    await openCatalog(page)
    await page.getByRole('button', { name: /^Профиль материала/ }).click()
    await page.getByRole('button', { name: title, exact: true }).click()
    await expect(page.getByRole('combobox')).toHaveCount(0)
    const files = page.getByRole('group', { name: 'Загруженные тестовые файлы', exact: true }).getByRole('button')
    await expect(files.first()).toBeVisible()
    await files.first().click()
    const start = page.getByRole('button', { name: 'Запустить тестовую печать', exact: true })
    await expect(start).toBeDisabled()
    await page.getByRole('checkbox', { name: 'Филамент и температура соответствуют тесту.', exact: true }).check()
    await expect(start).toBeDisabled()
    await page.getByRole('checkbox', { name: 'Я проверил G-code и буду наблюдать за печатью.', exact: true }).check()
    await expect(start).toBeEnabled()
    await expectTouchControl(start)
    await page.screenshot({ path: testInfo.outputPath(`material-prepare-${index}.png`), animations: 'disabled' })
  }
})

test('четыре винта → карта → сохранение → первый слой сохраняют полный canvas', async ({ page }, testInfo) => {
  await openCatalog(page)
  await page.getByRole('button', { name: 'Датчик Eddy', exact: true }).click()
  await page.getByRole('button', { name: /^Винты стола/ }).click()
  const screwControls = page.getByRole('group', { name: 'Выбор винта', exact: true }).getByRole('button')
  await expect(screwControls).toHaveCount(4)
  await expect(page.locator('.bottom-nav')).toBeVisible()
  await page.getByRole('button', { name: 'Измерить винты', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Подтвердить после повторного замера', exact: true })).toBeEnabled()
  await expectFullCalibration(page)
  await page.getByRole('button', { name: '2 · P2 probe X220 Y70', exact: true }).click()
  await expect(page.getByText('Против часовой стрелки', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('screws-fullscreen.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Подтвердить после повторного замера', exact: true }).click()
  await page.getByRole('button', { name: 'Далее: карта стола', exact: true }).click()
  const mesh = page.getByRole('img', { name: 'Трёхмерная карта фактических высот стола', exact: true })
  await expect(mesh.getByTestId('mesh-measured-point')).toHaveCount(49)
  await expectFullCalibration(page)
  await expect(mesh).toHaveAttribute('data-yaw', '45')
  await page.getByRole('button', { name: 'Повернуть карту вправо', exact: true }).click()
  await expect(mesh).toHaveAttribute('data-yaw', '60')
  const rect = (await mesh.boundingBox())!
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width / 2 + 60, rect.y + rect.height / 2 + 20)
  await page.mouse.up()
  await expect(mesh).not.toHaveAttribute('data-yaw', '60')
  await page.getByRole('button', { name: 'Сброс вида', exact: true }).click()
  await expect(mesh).toHaveAttribute('data-yaw', '45')
  await expect(page.getByRole('button', { name: 'Сохранить профиль и перезапустить', exact: true })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('mesh-fullscreen.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Значения', exact: true }).click()
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByRole('button', { name: '3D-карта', exact: true }).click()
  await page.getByRole('button', { name: 'Сохранить профиль и перезапустить', exact: true }).click()
  const next = page.getByRole('button', { name: 'Далее: первый слой', exact: true })
  await expect(next).toBeEnabled({ timeout: 15_000 })
  await next.click()
  await expect(page.getByRole('heading', { name: 'Первый слой', exact: true })).toBeVisible()
  await expectFullCalibration(page)
  await page.getByRole('button', { name: 'Завершить', exact: true }).click()
  await expect(page.locator('.bottom-nav')).toBeVisible()
})

test('ADXL → реальные спектры X/Y → сохранение → Готово возвращает навигацию', async ({ page }, testInfo) => {
  await openCatalog(page)
  await page.getByRole('button', { name: /^Шейпер и ADXL/ }).click()
  await expect(page.locator('.bottom-nav')).toBeVisible()
  await page.getByRole('button', { name: 'Считать ADXL', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Показания акселерометра', exact: true })).toBeVisible()
  await expectFullCalibration(page)
  await page.getByRole('button', { name: 'К тесту резонансов', exact: true }).click()
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
  await expect(page.getByRole('button', { name: 'Готово', exact: true })).toBeEnabled({ timeout: 15_000 })
  await expectFullCalibration(page)
  await page.getByRole('button', { name: 'Готово', exact: true }).click()
  await expect(page.locator('.bottom-nav')).toBeVisible()
  await expect(page.getByTestId('calibration-catalog')).toBeVisible()
})

test('ручной TESTZ использует полный canvas и отмена возвращает навигацию', async ({ page }, testInfo) => {
  await openCatalog(page)
  await page.getByRole('button', { name: 'Датчик Eddy', exact: true }).click()
  await page.getByRole('button', { name: /^Калибровка Eddy/ }).click()
  await page.getByRole('button', { name: /Высота Eddy/ }).click()
  await page.getByRole('button', { name: 'Начать проверку по бумаге', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Принять высоту и сохранить', exact: true })).toBeEnabled()
  await expectFullCalibration(page)
  for (const name of ['-1 мм', '-0.1 мм', '-0.05 мм', '+0.05 мм', '+0.1 мм', '+1 мм']) {
    await expectTouchControl(page.getByRole('button', { name, exact: true }))
  }
  await page.getByRole('button', { name: '+0.05 мм', exact: true }).click()
  await expect(page.getByRole('button', { name: '+0.05 мм', exact: true })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('height-fullscreen.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Отменить ручное измерение', exact: true }).click()
  await expect(page.locator('.bottom-nav')).toBeVisible()
})
