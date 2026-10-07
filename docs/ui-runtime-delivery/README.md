# Доставка экранного UI

Сборка, публикация и установка готового UI на принтер.

## Цепочка

1. После `push main`, включая merge PR, `.github/workflows/release-ui.yml` один раз запускает `npm run quality:pr`: проверки, сборки UI и E2E. Протокол `printer-core` ветки `treed-v2` обязателен и проверяется в общем наборе тестов; отсутствующий fixture или несовместимый протокол останавливают публикацию. Отдельных автоматических workflow для PR-проверки и сборки логики нет.
2. Этот же workflow использует готовый live UI из `dist`, сохраняет архив уже собранной логики как Actions artifact, добавляет manifest и публикует GitHub Release. Повторной сборки UI перед упаковкой нет. Ручной `workflow_dispatch` запускает тот же процесс.
3. Release содержит asset `treed-shell-ui.zip`.
4. Loader из `printer-core` скачивает артефакт, проверяет `treed-shell-ui-manifest.json`, распаковывает bundle в управляемый runtime-каталог и запускает браузерный киоск.
5. KlipperScreen остается fallback UI и переключается через `treed-ui`.

## Границы ответственности

- `printer-ui` — React UI, выбор mock/live, клиент Moonraker и артефакт `treed-shell-ui.zip`.
- `packages/printer-logic` — общие типы, правила доступности действий, работа с файлами/сетью и каталог команд; отдельно на принтер не устанавливается.
- `apps/web-ui` — стенд будущего веб-интерфейса; его архив не используется loader принтера.
- `printer-core` — установка архива, runtime-каталог, systemd, браузерный киоск, резервный KlipperScreen, переключение UI и host-контракты.

## Контракт артефакта

- Release asset: `treed-shell-ui.zip`.
- Archive content: файлы из `dist/**`.
- Manifest inside archive: `treed-shell-ui-manifest.json`.
- Manifest fields: `name`, `mode`, `ref`, `sha`, `runNumber`, `runAttempt`, `logicPackage`, `logicVersion`, `logicWorkspace`, `builtAt`.
- Production `mode`: `live`.
- Release tag: `ui-main-<run_number>-<run_attempt>`.

Vite встраивает заданный workflow `UI_RELEASE_TAG` в live bundle как
`VITE_UI_RELEASE_TAG`. Fallback через GitHub Releases сравнивает этот установленный
tag с последним релизом по номеру запуска, затем по номеру попытки. Без tag сборки
он возвращает `unknown`; версию `package.json` для этого сравнения не использует.

## Ограничения доставки

- Сборка `treed-shell` из исходников на принтере.
- `npm ci`, Rust или Tauri build внутри loader.
- Mock bundle как printer UI.
- Автоматический release `apps/web-ui` при `push main`.
- Отдельная установка `@treed/printer-logic` на устройство.
- Замена резервного KlipperScreen без изменения контракта провайдера в `printer-core`.

## Локальные команды

Выполняются из корня репозитория после `npm ci`:

```powershell
npm run build
npm run build:ui:printer
npm run build:all
npm run build:web-ui
npm run quality
npm run quality:pr
npm run test:e2e
```

- `npm run build` сейчас равен `npm run build:ui:printer`.
- `npm run build:ui:printer` собирает `packages/printer-logic`, затем выполняет `tsc -b && vite build --mode live`.
- В `build --mode live` Vite закрепляет Moonraker URL `http://127.0.0.1:7125`; `.env.live.local` и переменные окружения не меняют адрес API в bundle принтера. В `dev:live` адрес по-прежнему берётся из `VITE_MOONRAKER_URL` для подключения к принтеру с компьютера.
- `npm run build:all` также собирает ручной `apps/web-ui` playground.
- `npm run build:web-ui` нужен только для web playground.
- `npm run quality:pr` повторяет основной CI quality gate с E2E. В CI также задаётся `CORE_CONTRACT_FIXTURE`; без этой переменной локально тест совместимости с Core пропускается.

## Остаточный риск

Локальная сборка создаёт `dist`. Loader устанавливает опубликованный
`treed-shell-ui.zip` с manifest; готовность на устройстве проверяет `printer-core`.
Наличие локального `dist` не подтверждает ни публикацию, ни работу на принтере.

Смежная документация: [корневой README](../../README.md),
[контракты UI](../README.md).
