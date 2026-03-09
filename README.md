# TreeD Shell

Отдельная UI-оболочка для экрана принтера уровня KlipperScreen.

## Source of Truth (дизайн)

- Актуальный дизайн интерфейса хранится в Figma:
  `https://www.figma.com/make/CzDoyJ43oL0Ep8vyd93mgl/TreeD-Screen-UI-Design?t=0wAzv9BIiNp87Erv-1&preview-route=%2Flandscape`
- Любые правки UI должны проверяться на соответствие этому макету.

## Что в репозитории

- `src/` — фронтенд-логика и экранные компоненты.
- `src-tauri/` — нативная обертка приложения (отдельный runtime-process).
- `mocks/` — локальные сценарии данных.
- `e2e/` — Playwright smoke/visual проверки.
- `.vscode/` — задачи и профили запуска.

## Инструменты (фиксированный baseline)

- Node.js `20.x` (LTS)
- npm `10+`
- Rust toolchain (`rustc`, `cargo`) для Tauri
- Playwright Chromium (`npx playwright install chromium`)
- VS Code + расширения:
  - ESLint
  - Playwright Test for VSCode
  - Tauri

## Быстрый старт

```bash
npm install
```

Режимы разработки:

```bash
npm run dev:mock
npm run dev:live
npm run dev:mock:5in
npm run dev:mock:6in
npm run dev:live:5in
npm run dev:live:6in
```

Предпросмотр:

```bash
npm run preview:960
npm run preview:960:5in
npm run preview:960:6in
```

Флаг диагонали:

- используются `?view=physical-5` и `?view=physical-6`;
- shell рендерится в точном контейнере `960x544` без центрирующей рамки;
- применяется компенсация `devicePixelRatio`, чтобы визуальный размер был ближе к физическому экрану принтера.

Тесты:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:visual
npm run test:visual:layout
npm run verify:ui
```

Tauri runtime:

```bash
npm run tauri:dev
```

## Режимы данных

- `mock` — локальные данные без Moonraker.
- `live` — подключение к реальному Moonraker по `VITE_MOONRAKER_URL`.

Переменные окружения:

- `.env.mock`
- `.env.live`
- `.env.example`

## Live-режим через SSH tunnel

```bash
ssh -N -L 7125:127.0.0.1:7125 pi@192.168.0.21
```

После туннеля запускайте `npm run dev:live`.

## Контракт экрана

- Целевое разрешение интерфейса: `960x544`.
- В e2e есть smoke-проверка размеров shell-контейнера.
- В e2e есть проверка геометрии layout (без наездов/выходов за контейнер) и обязательное снятие скрина `dashboard-shell.png` как артефакта прогона.

## Home v1 (текущий функционал)

- чтение статуса принтера (`state`, температуры, connection);
- ручное обновление статуса;
- панель команд:
  - `start` (по имени файла);
  - `pause`;
  - `resume`;
  - `cancel`;
  - `home` (`G28`);
- явная индикация `pending/error` и последней успешной команды.

## Ограничения текущего окружения

Если на локальной машине отсутствуют `rustc`/`cargo`, команды `tauri:dev` и `tauri:build` не выполнятся. Это не блокирует web-разработку (`dev/mock/live`, тесты, visual).
