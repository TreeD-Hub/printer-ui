# TreeD Shell

UI-оболочка для сенсорного экрана принтера TreeD V2. Репозиторий хранит printer-facing React UI, Tauri shell, mock/live runtime и общий workspace-пакет доменной логики принтера.

## Source of Truth

- Текущая точка входа UI: `src/main.tsx`.
- Верхнеуровневая композиция shell: `src/App.tsx` и `src/app/AppScreenContent.tsx`.
- Целевой экран принтера: `960x544`, touch-first, без hover-only сценариев.
- Источник состояния принтера в live-режиме: Moonraker на `VITE_MOONRAKER_URL` (`http://127.0.0.1:7125` по умолчанию).
- Runtime на устройстве, loader, fallback и provider switch принадлежат `treed-mainshellOS`.
- Production artifact для loader: `treed-shell-ui.zip` из GitHub Release.

Дизайн-инварианты и токены: `docs/00_FOUNDATION.md`. Актуальный Figma-макет используется как визуальный референс:
`https://www.figma.com/make/CzDoyJ43oL0Ep8vyd93mgl/TreeD-Screen-UI-Design?t=0wAzv9BIiNp87Erv-1&preview-route=%2Flandscape`

## Структура

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

- `src/` - основная Tauri/UI-shell оболочка: экраны, composition, transport/store/commands, runtime-facing слой.
- `packages/printer-logic/` - общий TypeScript-пакет `@treed/printer-logic`: domain types, capabilities, file/network helpers, command catalog и block reasons.
- `apps/web-ui/` - ручной Vite/React playground будущей вебморды; не production UI для принтера.
- `mocks/` - mock runtime для `vite --mode mock`.
- `src-tauri/` - Tauri 2 wrapper и printer overlay-конфиг.
- `docs/` - foundation, ADR и runtime-контракты.
- `e2e/` - Playwright smoke/layout проверки для `960x544`.
- `.github/workflows/` - quality gate, logic build, UI release и ручной web UI release.

Общая printer/domain-логика не дублируется в `src/**` или `apps/web-ui/**`: если правило нужно shell и будущей вебморде, оно живет в `packages/printer-logic/**`.

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

Tauri:

```powershell
npm run tauri:dev
npm run tauri:dev:printer
npm run tauri:build
npm run tauri:build:printer
```

- `tauri:dev` использует базовый `src-tauri/tauri.conf.json`: desktop-dev окно `1200x760`, mock Vite runtime.
- `tauri:dev:printer` использует `src-tauri/tauri.printer.conf.json`: фиксированное окно `960x544`, без decorations, live runtime и CSP для Moonraker `127.0.0.1:7125`.

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

## Runtime Modes

- `mock` - локальный runtime без Moonraker, выбирается Vite alias `#runtime -> mocks/runtime.ts`.
- `live` - Moonraker/Tauri runtime, выбирается Vite alias `#runtime -> src/runtime/live.ts`.

Переменная:

```powershell
VITE_MOONRAKER_URL=http://127.0.0.1:7125
```

Примеры значений: `.env.example`, `.env.mock`, `.env.live`.

Для live-проверки через SSH tunnel:

```powershell
ssh -N -L 7125:127.0.0.1:7125 pi@192.168.0.21
```

## Printer UI Release

Workflow: `.github/workflows/release-ui.yml`.

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

## Web UI Release

Workflow: `.github/workflows/release-web-ui.yml`.

- Запускается только вручную через `workflow_dispatch`.
- Собирает `apps/web-ui` командой `npm run build:web-ui`.
- Добавляет `apps/web-ui/dist/treed-web-ui-manifest.json`.
- Публикует `treed-web-ui.zip`.

`treed-web-ui.zip` не используется printer loader.

## Logic Package Build

Пакет проверяется и собирается в `.github/workflows/release-ui.yml` в составе общего quality gate.

Этот же workflow сохраняет `treed-printer-logic-package` как GitHub Actions artifact без повторной проверки и сборки.

Отдельно на принтер этот package не ставится: UI bundle уже содержит нужную логику после сборки.

## Runtime Delivery

Production delivery описан в `docs/ui-runtime-delivery/README.md`.

Коротко:

```text
GitHub Release
  -> treed-shell-ui.zip
  -> treed-mainshellOS loader
  -> managed runtime dir
  -> local browser/kiosk service
  -> TreeD Shell UI
  -> Moonraker 127.0.0.1:7125
  -> Klipper / macros / host components
```

На принтере не должно быть `npm ci`, Rust toolchain или Tauri-сборки для UI. Устройство ставит готовый static bundle и сохраняет fallback на KlipperScreen.

Provider switch находится на стороне `treed-mainshellOS`:

```text
sudo treed-ui ts
sudo treed-ui ks
treed-ui status
```
