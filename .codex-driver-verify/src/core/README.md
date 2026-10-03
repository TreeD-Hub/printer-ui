# `src/core`

Клиентское ядро `treed-shell`: transport, store, host-network и command execution.

## Состав

- `transport/` - Moonraker HTTP/WebSocket clients, normalizer и transport types.
- `store/` - внешний printer snapshot store и hook lifecycle.
- `commands/` - shell-side command client, hook состояния выполнения и re-export command contract.
- `hostNetwork.ts` - Moonraker host-network client для `/server/treed/network/*` и shared host-network helpers.

## Контракт

- Источник данных выбирается Vite alias `#runtime`: `mock` подключает `mocks/runtime.ts`, остальные режимы подключают `src/runtime/live.ts`.
- Общие command/domain types, capabilities, limits и block reasons берутся из `@treed/printer-logic`.
- Moonraker HTTP, WebSocket subscription, polling fallback, Tauri bridge и command execution остаются локальными для `treed-shell`.
- Ошибки транспорта и команд не подавляются: UI получает явный error/reconnecting/offline state.
- Host-network сначала пробует Moonraker endpoint, а `src/runtime/live.ts` может fallback-нуться на Tauri invoke, если endpoint недоступен и Tauri runtime есть.

## Смежные слои

- Shared logic: `../../packages/printer-logic/README.md`.
- Live runtime adapter: `../runtime/live.ts`.
- Mock runtime adapter: `../../mocks/README.md`.
