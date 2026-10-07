# `e2e`

Браузерные проверки экранного UI на mock-принтере через Playwright.

## Состав

- `shell-layout.spec.ts` — геометрия экрана, навигация, главный экран и файлы.
- `filament-sensor.spec.ts` — настройки датчика филамента.
- `temperature-controls.spec.ts` — элементы управления температурой.

## Контракт

- Браузер: Chromium.
- Viewport: `960x544`.
- Web server: `vite --mode mock --host 127.0.0.1 --port 4173`.
- Проверяется shell frame, Nothing-inspired visual contract, геометрия dashboard print-state и files screen.

## Команды

Из корня репозитория после `npm ci` и установки Chromium
(`npx playwright install chromium`). Адресный вызов `npx playwright test`
также требует предварительной сборки логики командой `npm run build:logic`.
`npm run test:e2e` выполняет эту сборку сам.

```powershell
npm run test:e2e
npx playwright test e2e/shell-layout.spec.ts
```

## Артефакты

`e2e/shell-layout.spec.ts` сохраняет screenshots в `test-results/**`:

- `dashboard-shell.png`
- `files-library.png`

## Инварианты

- Ключевые блоки должны помещаться в `960x544`.
- Нижняя навигация не должна пересекаться с основным контентом.
- В files screen ожидается сетка 4 карточки в ряд и вертикальный scroll.
- Визуальные проверки не заменяют device-run на реальном принтере.

Конфигурация сервера и viewport: [`playwright.config.ts`](../playwright.config.ts).
Полный набор проверок: [корневой README](../README.md#проверки).
