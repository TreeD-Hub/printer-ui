# `src-tauri`

Оболочка Tauri 2 для локального запуска TreeD Shell как отдельного приложения.
На принтер loader доставляет браузерный bundle, а не Tauri-приложение.

## Состав

- `tauri.conf.json` - базовая desktop-dev/runtime конфигурация.
- `tauri.printer.conf.json` - printer overlay для 5-дюймового экрана.
- `Cargo.toml`, `Cargo.lock`, `build.rs`, `src/` - Rust-часть Tauri.
- `capabilities/default.json` - Tauri capability config.
- `icons/` - bundle icons.

## Команды

Выполняются из корня репозитория после установки npm-зависимостей и Rust toolchain:

```powershell
npm run tauri:dev
npm run tauri:dev:printer
npm run tauri:build
npm run tauri:build:printer
```

## Профили

- `tauri.conf.json`: окно `1200x760`, min `1000x620`, рамка включена, `beforeDevCommand = npm run build:logic && vite --mode mock --host 127.0.0.1 --port 5173 --strictPort`, `beforeBuildCommand = npm run build:ui:printer`.
- `tauri.printer.conf.json`: фиксированное окно `960x544`, рамка включена (`decorations: true`), always-on-top, live runtime, CSP для Moonraker/Tauri IPC на `127.0.0.1:7125` и `localhost:7125`.

## Ограничения

- Требуется установленный Rust toolchain (`rustc`, `cargo`).
- Production printer loader не собирает Tauri bundle на устройстве; он ставит static `treed-shell-ui.zip`.
- Изменение профиля Tauri не меняет контракт браузерного артефакта для loader.

Установка готового UI на устройство: [runtime delivery](../docs/ui-runtime-delivery/README.md).
