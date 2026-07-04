# `@treed/printer-logic`

Общий TypeScript-пакет доменной логики принтера для `treed-shell` и будущей вебморды.

## Назначение

Пакет хранит только стабильную общую логику:

- типы printer snapshot, connection state, limits, files, host-network и BTT SFS runtime state;
- pure helpers для файлов печати: normalize id/path/name/directory и sort;
- pure helpers для Wi-Fi/host-network статусов и выбора сети;
- нормализацию homed axes;
- расчет capabilities для групп действий;
- каталог TreeD-команд с risk/capability metadata;
- причины блокировки команд через `getTreeDCommandBlockReason`;
- базовую валидацию аргументов команд через `getTreeDCommandArgumentError`;
- лимиты профиля `TREED_V2_COREXY_V1_LIMITS`.

Контракт датчика нити включает `FilamentSensorSnapshot`, capability `filamentSensorControl` / `filamentEncoderSensitivity` и команды `setFilamentSensorMode` / `setFilamentEncoderSensitivity`. Правила блокируют обе настройки во время активной печати и чувствительность вне motion-режима.

Пакет не выполняет команды, не вызывает `nmcli`, не ходит в Moonraker и не знает про layout. UI-приложения отвечают за transport, errors, retry, confirmation flow и отображение.

## Публичный контракт

- Runtime types экспортируются из `src/index.ts`.
- Сборочный entrypoint: `dist/index.js`.
- Type declarations: `dist/index.d.ts`.
- Package export: `"."`.
- Публикуемые файлы: `dist`, `README.md`.

## Инварианты

- Domain rules нельзя смешивать с UI: никаких React-компонентов, CSS, Tauri API и layout-логики.
- Shell и Web не должны расходиться в правилах доступности действий.
- Блокировки крупных UI-групп идут через `getPrinterCapabilities`.
- Блокировки конкретных команд идут через `getTreeDCommandBlockReason`.
- Если правило меняется, оно меняется здесь и покрывается тестом в `packages/printer-logic/test/**`.

## Проверки

Из каталога пакета:

```powershell
npm run typecheck
npm test
npm run build
```

Из корня репозитория:

```powershell
npm run typecheck:logic
npm run test:logic
npm run build:logic
```

## Смежные слои

- Shell-side command transport: `../../src/core/commands/README.md`.
- Shell-side state/transport: `../../src/core/README.md`.
- Web playground: `../../apps/web-ui/README.md`.
