# `treed-web-ui`

Стенд будущего веб-интерфейса TreeD на Vite и React.
Использует mock-состояния для проверки общей доменной логики без Tauri и принтера.

## Назначение

- Проверять потребление `@treed/printer-logic` вне Tauri shell.
- Смотреть, как capabilities и block reasons ведут себя на разных mock snapshot.
- Не дублировать rules из `treed-shell`.
- Держать отдельный web-контур до появления production web-задачи.

## Текущий статус

Это не production UI и не printer loader artifact. Экран использует локальные mock `PrinterSnapshot`, переключатели состояния, pending command и scenario locks, затем выводит результат `getPrinterCapabilities`.

## Зависимость на общую логику

```json
"@treed/printer-logic": "file:../../packages/printer-logic"
```

Из корня репозитория:

```powershell
npm run dev:web-ui
npm run typecheck:web-ui
npm run build:web-ui
```

Из каталога `apps/web-ui`:

Сначала установите зависимости и соберите общую логику из корня
(`npm ci`, `npm run build:logic`); пакет импортируется из `dist`.

```powershell
npm run dev
npm run typecheck
npm run build
npm run preview
```

## Релиз

Workflow `.github/workflows/release-web-ui.yml` запускается только вручную через `workflow_dispatch`.

Он собирает `apps/web-ui`, добавляет `apps/web-ui/dist/treed-web-ui-manifest.json` и публикует `treed-web-ui.zip`.

`treed-web-ui.zip` не используется printer loader.

## Ограничения

- Не подключать live-команды без отдельной политики transport/error/confirmation.
- Не копировать rules/capabilities из `src/**`.
- Не переносить Tauri, 5-дюймовый canvas `960x544` и shell-only touch layout как обязательную основу web UI.
- Полноценная вебморда добавляется отдельной задачей после стабилизации общей доменной логики.

Публичный контракт: [README общего пакета](../../packages/printer-logic/README.md).
Экранный UI принтера: [корневой README](../../README.md).
