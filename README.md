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

## Режимы данных

- `mock` — локальные данные без Moonraker (режим по умолчанию).
- `live` — подключение к Moonraker.

Переменные окружения:

- `VITE_DATA_MODE=mock|live`
- `VITE_MOONRAKER_URL=http://127.0.0.1:7125`

Пример значений — в `.env.example`.

## Live-режим через SSH tunnel

```bash
ssh -N -L 7125:127.0.0.1:7125 pi@192.168.0.21
```

## Контракт экрана

- Целевое разрешение интерфейса: `960x544`.
- Источник истины по состоянию принтера: Moonraker.
