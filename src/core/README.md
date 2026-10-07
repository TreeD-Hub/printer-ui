# `src/core`

Клиентское ядро TreeD Shell: состояние принтера, транспорт Moonraker,
управляющие команды, сеть и обновления.

## Состав

- `transport/` - Moonraker HTTP/WebSocket clients, normalizer и transport types.
- `store/` - внешний printer snapshot store и hook lifecycle.
- `commands/` - shell-side command client, hook состояния выполнения и re-export command contract.
- `hostNetwork.ts` - Moonraker host-network client для `/server/treed/network/*` и shared host-network helpers.
- `hostUpdate.ts` — клиент статуса и очереди обновлений, firmware inventory и сброса переопределений.
- `hostDetection.ts` — чтение и запись настройки AI через `/server/treed/detection/settings`; UI передаёт только `enabled`, ключ классификатора в запрос не входит. Нужен Core с поддержкой endpoint.

## Контракт

- Источник данных выбирается Vite alias `#runtime`: `mock` подключает `mocks/runtime.ts`, остальные режимы подключают `src/runtime/live.ts`.
- Общие command/domain types, capabilities, limits и block reasons берутся из `@treed/printer-logic`.
- Moonraker HTTP, WebSocket subscription, polling fallback, Tauri bridge и command execution остаются локальными для `treed-shell`.
- Ошибки транспорта и команд не подавляются: UI получает явный error/reconnecting/offline state.
- Host-network сначала пробует Moonraker endpoint, а `src/runtime/live.ts` может fallback-нуться на Tauri invoke, если endpoint недоступен и Tauri runtime есть.

## Смежные слои

- [Общая доменная логика](../../packages/printer-logic/README.md).
- [Адаптер live](../runtime/live.ts).
- [Адаптер mock](../../mocks/README.md).
- [Команды](commands/README.md), [состояние](store/README.md), [транспорт](transport/README.md).
