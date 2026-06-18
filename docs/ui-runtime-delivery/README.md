# UI runtime delivery

Целевой production-контур для экранного UI принтера:

1. `treed-shell` собирает live UI bundle командой `npm run build:ui:printer`.
2. `.github/workflows/release-ui.yml` публикует GitHub Release с asset `treed-shell-ui.zip`.
3. `treed-mainshellOS` loader скачивает `treed-shell-ui.zip`, проверяет `treed-shell-ui-manifest.json`, распаковывает bundle в runtime-каталог и запускает его через OS-owned kiosk/browser service.
4. `KlipperScreen` остается fallback UI и переключается через `treed-ui`.

## Границы ответственности

- `treed-shell`: React UI, live/mock runtime selection, release artifact `treed-shell-ui.zip`.
- `packages/printer-logic`: shared domain contract для commands/capabilities; отдельно на принтер не ставится.
- `apps/web-ui`: ручной playground будущей вебморды, не production UI и не loader artifact.
- `treed-mainshellOS`: установка artifact, systemd service, kiosk/browser runtime, fallback на `KlipperScreen`, Moonraker/host contracts.

## Не production path

- Сборка `treed-shell` из исходников на принтере.
- `npm ci` / Rust / Tauri build внутри `treed-mainshellOS` loader.
- Автоматический релиз `apps/web-ui` при `push main`.
- Отдельная установка `@treed/printer-logic` на устройство.

## Artifact contract

- Release asset: `treed-shell-ui.zip`.
- Manifest inside archive: `treed-shell-ui-manifest.json`.
- Manifest fields currently include `name`, `mode`, `ref`, `sha`, `runNumber`, `runAttempt`, `logicPackage`, `logicVersion`, `logicWorkspace`, `builtAt`.
- Production mode must be `live`.

## Local commands

```powershell
npm run build
npm run build:all
npm run build:web-ui
```

- `npm run build` builds the production printer UI artifact input only.
- `npm run build:all` also builds the manual `apps/web-ui` playground.
- `npm run build:web-ui` is for playground validation only.
