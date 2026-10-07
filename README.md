# TreeD Shell

Интерфейс сенсорного экрана TreeD V2 на React и TypeScript. Репозиторий содержит
экранный UI, оболочку Tauri, режимы mock/live и общий пакет доменной логики принтера.

## Точки входа и границы ответственности

- Текущая точка входа UI: `src/main.tsx`.
- Композиция приложения: `src/App.tsx` и `src/app/AppScreenContent.tsx`.
- Целевой экран принтера: `960x544`; основные действия доступны касанием без наведения указателя.
- Источник состояния принтера в live-режиме: Moonraker на `VITE_MOONRAKER_URL` (`http://127.0.0.1:7125` по умолчанию).
- Установкой на устройство, loader, переключением UI и резервным KlipperScreen управляет `printer-core`.
- Артефакт для установки на принтер: `treed-shell-ui.zip` из GitHub Release.

Дизайн-инварианты и токены: [00_FOUNDATION.md](docs/00_FOUNDATION.md).
Визуальный референс: [макет Figma](https://www.figma.com/make/CzDoyJ43oL0Ep8vyd93mgl/TreeD-Screen-UI-Design?t=0wAzv9BIiNp87Erv-1&preview-route=%2Flandscape).

## Поведение интерфейса

В «Управление → Освещение» доступны сохраняемые на принтере флаги света:
при запуске — по умолчанию выключен, при начале печати — включён.
Требуется core с `TREED_LIGHT_SETTINGS`; старый core показывает недоступность настройки.

Вкладка перемещения открывается во время задания. Оси и парковка заблокированы
и при печати, и на паузе; филамент доступен только на паузе/в ожидании при
нагретом сопле и отсутствии автоматической прочистки. Автопаузы от кнопки подачи нет.

Уведомления runout, прочистки, пауз и завершения приходят через Moonraker:
всплывающее окно, колокольчик и «Настройки → Уведомления» используют один store.
История — последние 50 событий сеанса; после переподключения восстанавливается
последнее событие core. Промежуточные события за время отсутствия связи недоступны.
Парсер, типы и тексты событий в `@treed/printer-logic` пригодны для будущего веб-UI.
Выключатель всплывающих уведомлений скрывает окна, история продолжает собираться.

## Состав

- [`src/`](src/README.md) — экраны, композиция приложения, состояние, транспорт и команды.
- [`packages/printer-logic/`](packages/printer-logic/README.md) — общие типы, правила доступности действий, каталог команд и причины блокировки.
- [`apps/web-ui/`](apps/web-ui/README.md) — стенд будущего веб-интерфейса на mock-состояниях.
- [`mocks/`](mocks/README.md) — симуляция принтера для `vite --mode mock`.
- [`src-tauri/`](src-tauri/README.md) — оболочка Tauri 2 и профиль экрана принтера.
- [`docs/`](docs/README.md) — дизайн, ADR и runtime-контракты.
- [`e2e/`](e2e/README.md) — браузерные проверки для `960x544`.
- `.github/workflows/` — проверка и релиз экранного UI, ручной релиз веб-стенда.

Общие правила принтера хранятся в `packages/printer-logic/**`.
Экранный UI и веб-стенд используют этот пакет без копирования правил.

## Требования

- Node.js `22.x` - версия CI/release workflows.
- npm `10+`.
- Rust toolchain (`rustc`, `cargo`) - только для Tauri dev/build.

## Установка

```powershell
npm ci
```

## Локальный запуск

```powershell
npm run dev:mock
npm run dev:live
npm run dev:web-ui
```

- `dev:mock` собирает `packages/printer-logic` и запускает Vite с `mocks/runtime.ts`.
- `dev:live` собирает `packages/printer-logic` и запускает Vite с `src/runtime/live.ts`.
- `dev:web-ui` запускает `apps/web-ui` после сборки общей логики.

Для разработки без устройства начните с `dev:mock` и откройте адрес,
который напечатает Vite. `dev:live` подключается к настоящему Moonraker;
команды управления в этом режиме воздействуют на принтер.

Локальная оболочка Tauri:

```powershell
npm run tauri:dev
npm run tauri:dev:printer
npm run tauri:build
npm run tauri:build:printer
```

- `tauri:dev` использует базовый `src-tauri/tauri.conf.json`: desktop-dev окно `1200x760`, mock Vite runtime.
- `tauri:dev:printer` использует `src-tauri/tauri.printer.conf.json`: фиксированное окно `960x544`, включённую рамку окна (`decorations: true`), live runtime и CSP для Moonraker `127.0.0.1:7125`.

## Проверки

```powershell
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build:all
npm run quality
```

- `typecheck` проверяет logic package, shell UI и web UI.
- `test` запускает unit/integration tests для `packages/printer-logic` и `src`.
- `test:e2e` запускает Playwright в Chromium с viewport `960x544`.
- `quality` выполняет lint, typecheck, tests и `build:all`.

Перед первым E2E-запуском установите браузер командой `npx playwright install chromium`.
Полный релизный набор — `npm run quality:pr`; он также включает E2E.
Совместимость с Core проверяется при заданном `CORE_CONTRACT_FIXTURE`, как в CI.

## Режимы runtime

- `mock` - локальный runtime без Moonraker, выбирается Vite alias `#runtime -> mocks/runtime.ts`.
- `live` - Moonraker/Tauri runtime, выбирается Vite alias `#runtime -> src/runtime/live.ts`.

Для `dev:live` задайте переменную в PowerShell перед запуском:

```powershell
$env:VITE_MOONRAKER_URL = 'http://127.0.0.1:7125'
npm run dev:live
```

Примеры значений: `.env.example`, `.env.mock`, `.env.live`.
Локальные настройки можно хранить в `.env.live.local`.
При сборке live bundle Vite закрепляет адрес `http://127.0.0.1:7125`:
dev-переменные не меняют API-адрес артефакта для принтера.

Для live-проверки через SSH tunnel:

```powershell
ssh -N -L 7125:127.0.0.1:7125 radxa@tr-v2
```

## Релиз экранного UI

Workflow: [release-ui.yml](.github/workflows/release-ui.yml).

Триггеры:

- `push` в `main`;
- ручной `workflow_dispatch`.

Что делает workflow:

1. Устанавливает зависимости через `npm ci`.
2. Устанавливает Chromium для Playwright.
3. Один раз запускает `npm run quality:pr`: lint, typecheck, тесты с обязательным протоколом `printer-core` ветки `treed-v2`, сборки UI и E2E.
4. Пакует уже собранный `@treed/printer-logic` без повторного `prepare` и сохраняет Actions artifact.
5. Добавляет `dist/treed-shell-ui-manifest.json` в уже собранный live bundle.
6. Пакует содержимое `dist/**` в `treed-shell-ui.zip`.
7. Создает GitHub Release с тегом `ui-main-<run_number>-<run_attempt>`.

Автоматический quality gate выполняется только в этом процессе после `push main`, включая merge PR. Отдельного workflow проверки PR нет.

`treed-shell-ui.zip` - единственный production artifact для printer loader. Workflow не устанавливает UI на принтер, не собирает Tauri bundle для устройства и не публикует mock-сборку.

## Релиз веб-стенда

Workflow: [release-web-ui.yml](.github/workflows/release-web-ui.yml).

- Запускается только вручную через `workflow_dispatch`.
- Собирает `apps/web-ui` командой `npm run build:web-ui`.
- Добавляет `apps/web-ui/dist/treed-web-ui-manifest.json`.
- Публикует `treed-web-ui.zip`.

`treed-web-ui.zip` не используется printer loader.

## Сборка общего пакета

Пакет проверяется и собирается в `.github/workflows/release-ui.yml` в составе общего quality gate.

Этот же workflow сохраняет `treed-printer-logic-package` как GitHub Actions artifact без повторной проверки и сборки.

Отдельно на принтер этот package не ставится: UI bundle уже содержит нужную логику после сборки.

## Доставка на устройство

Доставка и контракт артефакта описаны в [инструкции доставки UI](docs/ui-runtime-delivery/README.md).

Коротко:

```text
GitHub Release
  -> treed-shell-ui.zip
  -> printer-core loader
  -> managed runtime dir
  -> local browser/kiosk service
  -> TreeD Shell UI
  -> Moonraker 127.0.0.1:7125
  -> Klipper / macros / host components
```

На принтере не должно быть `npm ci`, Rust toolchain или Tauri-сборки для UI. Устройство ставит готовый static bundle и сохраняет fallback на KlipperScreen.

Переключение UI выполняется на устройстве командой из `printer-core`:

```text
sudo treed-ui ts
sudo treed-ui ks
treed-ui status
```
