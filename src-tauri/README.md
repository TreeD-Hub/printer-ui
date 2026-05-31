# `src-tauri`

Нативная обертка TreeD Shell для запуска как отдельного приложения.

Состав:
- `tauri.conf.json` — runtime-конфигурация окна и сборки;
- `tauri.printer.conf.json` — overlay-профиль для 5-дюймового экрана принтера;
- `Cargo.toml` + `src/` — Rust-часть Tauri;
- `icons/` — bundle-иконки.

Команды:

```bash
npm run tauri:dev
npm run tauri:dev:printer
npm run tauri:build
npm run tauri:build:printer
```

Профили:
- `tauri.conf.json` — desktop-dev окно `1200x760`, mock/live выбирается обычными env-файлами Vite.
- `tauri.printer.conf.json` — printer runtime `960x544`, без decorations, live-mode через `.env.live`, с CSP для локального Moonraker `127.0.0.1:7125`.

Ограничение:
- требуется установленный Rust toolchain (`rustc`, `cargo`).
