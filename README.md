# TreeD Shell

Отдельная UI-оболочка для экрана принтера уровня KlipperScreen.

## Source of Truth (дизайн)

- Актуальный дизайн интерфейса хранится в Figma:
  `https://www.figma.com/make/CzDoyJ43oL0Ep8vyd93mgl/TreeD-Screen-UI-Design?t=0wAzv9BIiNp87Erv-1&preview-route=%2Flandscape`
- Любые правки UI должны проверяться на соответствие этому макету.

## Что в репозитории

- `src/` — UI-логика и экранные компоненты.
- `src-tauri/` — нативная обертка и runtime-конфигурация Tauri.
- `docs/` — foundation-токены, ADR и эксплуатационная документация.
- `.vscode/` — локальные задачи запуска `tauri:dev/tauri:build`.

## Инструменты

- Node.js `20.x` (LTS)
- npm `10+`
- Rust toolchain (`rustc`, `cargo`) для Tauri

## Быстрый старт (`tauri-only`)

```bash
npm install
npm run tauri:dev
```

Сборка:

```bash
npm run tauri:build
```

Printer runtime profile:

```bash
npm run tauri:dev:printer
npm run tauri:build:printer
```

Этот профиль использует `src-tauri/tauri.printer.conf.json`: фиксированное окно `960x544`, без системной рамки, live-mode через `.env.live` и подключение к Moonraker на `http://127.0.0.1:7125`.

## Monorepo layout

`treed-shell` теперь хранит весь UI-контур в одном репозитории:

- `packages/printer-logic` — общий TypeScript-пакет `@treed/printer-logic` с domain types, capabilities и каталогом команд;
- `apps/web-ui` — Vite/React-заглушка будущей вебморды;
- `src`, `src-tauri`, `mocks` — текущий printer shell UI, Tauri runtime и mock/live transport.

Общая логика подключается как локальный workspace-пакет. CI больше не читает отдельный private GitHub repo для `@treed/printer-logic`.

## UI release для printer loader

Release workflow находится в `.github/workflows/release-ui.yml`.

Поведение:

- запускается при `push` в ветку `main`;
- также может быть запущен вручную через `workflow_dispatch`;
- выполняет `npm ci`;
- собирает printer UI командой `npm run build:ui:printer`;
- команда `build:ui:printer` сначала собирает `packages/printer-logic`, затем выполняет `tsc -b && vite build --mode live`;
- добавляет manifest `dist/treed-shell-ui-manifest.json` с commit/run metadata и версией `@treed/printer-logic`;
- пакует содержимое `dist/**` в `treed-shell-ui.zip`;
- создает GitHub Release с тегом `ui-main-<run_number>-<run_attempt>`;
- прикладывает к release asset `treed-shell-ui.zip`.

Этот release предназначен для внешнего loader на принтере: loader скачивает готовый `treed-shell-ui.zip` из GitHub Release и раскладывает UI в runtime-место. Workflow не устанавливает репозиторий на принтер и не собирает Tauri bundle.

## Web UI release

Workflow `.github/workflows/release-web-ui.yml` собирает `apps/web-ui` командой `npm run build:web-ui`, добавляет manifest `apps/web-ui/dist/treed-web-ui-manifest.json` и выпускает `treed-web-ui.zip` в GitHub Release.

## Logic package build

Workflow `.github/workflows/build-logic.yml` проверяет и собирает `packages/printer-logic`, затем публикует `treed-printer-logic-package` как GitHub Actions artifact. Loader этот package отдельно не ставит: UI-бандлы уже содержат нужную логику после сборки.

## Режимы данных

- `mock` — локальные данные без Moonraker, включается отдельным Vite mode: `vite --mode mock`.
- `live` — подключение к Moonraker, используется по умолчанию для build и printer runtime.

Переменные окружения:

- `VITE_MOONRAKER_URL=http://127.0.0.1:7125`

Пример значений — в `.env.example`. Mock-runtime живет в `mocks/runtime.ts` и не импортируется live-сборкой.

## Live-режим через SSH tunnel

```bash
ssh -N -L 7125:127.0.0.1:7125 pi@192.168.0.21
```

## Контракт экрана

- Целевое разрешение интерфейса: `960x544`.
- Источник истины по состоянию принтера: Moonraker.
