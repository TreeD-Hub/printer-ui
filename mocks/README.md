# `mocks`

Симуляция принтера для `vite --mode mock`: состояние, команды и сеть хоста.

## Назначение

- Быстрая UI-разработка без Moonraker и принтера.
- Воспроизводимые printer snapshots, command results и host-network states.
- Unit/integration tests, которым нужен управляемый runtime.

## Состав

- `runtime.ts` — mock-клиенты `createTransportClient`, `createCommandClient`, `createHostNetworkClient`, `createHostUpdateClient` и функции для задания тестовых состояний команд, сети и транспорта.

## Контракт

- Live-сборка не импортирует `mocks/runtime.ts`.
- Подключение идет через Vite alias `#runtime` в `vite.config.ts`.
- Mock command operations доступны тестам через helper-функции и не должны смешиваться с production command client.
- PID-калибровка сопла и стола имитирует 12 секунд ожидания и публикует тестовые коэффициенты через обработчик G-code. Нагрев и запись конфигов не выполняются.

Запуск из корня: `npm run dev:mock` после `npm ci`.
Режимы и команды проверки: [корневой README](../README.md).
Адаптер настоящего принтера: [`src/runtime/live.ts`](../src/runtime/live.ts).
