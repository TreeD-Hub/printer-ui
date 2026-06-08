# `src/core/commands`

Слой отправки команд управления принтером.

Состав:
- `types.ts` — re-export общего контракта команд из `@treed/printer-logic`;
- `catalog.ts` — re-export TreeD metadata/rules из `@treed/printer-logic`;
- `moonrakerCommandClient.ts` — отправка команд в Moonraker (`live`);
- `usePrinterCommands.ts` — хук состояния выполнения (`pending/error/lastResult`);
- `index.ts` — публичные экспорты слоя.

Mock-команды живут вне production graph в `mocks/runtime.ts` и подключаются только через `vite --mode mock`.

Поддерживаемые команды:
- `start` (по имени файла);
- `pause`;
- `resume`;
- `cancel`;
- `home` (`G28`).
- TreeD V2 motion/thermal/filament/Eddy/shaper/system команды из `types.ts`.

Контракт:
- критичные команды не выполняются «тихо» при ошибках;
- в UI возвращается явный `error` и последняя успешная команда.
- уровень риска команды хранится в общем `TREE_D_COMMAND_CATALOG`, а не выводится из текста кнопки;
- локальный слой не должен дублировать rules/capabilities из workspace-пакета `packages/printer-logic` (`@treed/printer-logic`).
