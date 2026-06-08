# `src/core`

Ядро клиентской логики.

Подсистемы:
- `transport/` — адаптеры получения данных принтера;
- `store/` — реактивное состояние интерфейса;
- `commands/` — выполнение команд и локальная обвязка hooks/client.

Контракт:
- источник данных выбирается режимом `mock|live`;
- ошибки транспорта и команд поднимаются в UI явно.
- общие типы команд, capabilities и причины блокировки команд берутся из workspace-пакета `packages/printer-logic` (`@treed/printer-logic`);
- transport, polling/WebSocket, Tauri runtime и Moonraker-клиенты остаются локальными для `treed-shell`.
