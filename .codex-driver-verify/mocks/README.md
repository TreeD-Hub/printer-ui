# `mocks`

Mock runtime для режима `vite --mode mock`.

## Назначение

- Быстрая UI-разработка без Moonraker и принтера.
- Воспроизводимые printer snapshots, command results и host-network states.
- Unit/integration tests, которым нужен управляемый runtime.

## Состав

- `runtime.ts` - mock `createTransportClient`, `createCommandClient`, `createHostNetworkClient`, helpers для принудительных command/network/transport состояний.

## Контракт

- Live-сборка не импортирует `mocks/runtime.ts`.
- Подключение идет через Vite alias `#runtime` в `vite.config.ts`.
- Mock command operations доступны тестам через helper-функции и не должны смешиваться с production command client.
