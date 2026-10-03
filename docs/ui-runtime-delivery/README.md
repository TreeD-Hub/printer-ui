# UI runtime delivery

Production-контур для экранного UI принтера.

## Цепочка

1. `treed-shell` собирает live UI bundle командой `npm run build:ui:printer`.
2. `.github/workflows/release-ui.yml` прогоняет quality/e2e и обязательную проверку совместимости с протоколом `printer-core` ветки `treed-v2`, добавляет manifest и публикует GitHub Release. Отсутствующий fixture или несовместимый протокол останавливают публикацию.
3. Release содержит asset `treed-shell-ui.zip`.
4. `treed-mainshellOS` loader скачивает asset, проверяет `treed-shell-ui-manifest.json`, распаковывает bundle в managed runtime dir и запускает его через OS-owned kiosk/browser service.
5. KlipperScreen остается fallback UI и переключается через `treed-ui`.

## Границы ответственности

- `treed-shell` - React UI, mock/live runtime selection, Moonraker-facing client code, release artifact `treed-shell-ui.zip`.
- `packages/printer-logic` - shared domain contract для types, capabilities, file/network helpers и command catalog; отдельно на принтер не ставится.
- `apps/web-ui` - ручной playground будущей вебморды, не production UI и не loader artifact.
- `treed-mainshellOS` - установка artifact, managed runtime dir, systemd/kiosk runtime, fallback на KlipperScreen, provider switch, Moonraker/host contracts.

## Artifact Contract

- Release asset: `treed-shell-ui.zip`.
- Archive content: файлы из `dist/**`.
- Manifest inside archive: `treed-shell-ui-manifest.json`.
- Manifest fields: `name`, `mode`, `ref`, `sha`, `runNumber`, `runAttempt`, `logicPackage`, `logicVersion`, `logicWorkspace`, `builtAt`.
- Production `mode`: `live`.
- Release tag: `ui-main-<run_number>-<run_attempt>`.

## Не production path

- Сборка `treed-shell` из исходников на принтере.
- `npm ci`, Rust или Tauri build внутри loader.
- Mock bundle как printer UI.
- Автоматический release `apps/web-ui` при `push main`.
- Отдельная установка `@treed/printer-logic` на устройство.
- Замена fallback на KlipperScreen без изменения provider contract в `treed-mainshellOS`.

## Local commands

```powershell
npm run build
npm run build:ui:printer
npm run build:all
npm run build:web-ui
npm run quality
npm run test:e2e
```

- `npm run build` сейчас равен `npm run build:ui:printer`.
- `npm run build:ui:printer` собирает `packages/printer-logic`, затем выполняет `tsc -b && vite build --mode live`.
- `npm run build:all` также собирает ручной `apps/web-ui` playground.
- `npm run build:web-ui` нужен только для web playground.
- `npm run quality` повторяет основной CI quality gate.

## Остаточный риск

Локальная сборка создает `dist`, но production loader берет только опубликованный GitHub Release asset. Готовность к машине подтверждается не наличием локального `dist`, а опубликованным `treed-shell-ui.zip` с manifest и host-side проверкой loader в `treed-mainshellOS`.
