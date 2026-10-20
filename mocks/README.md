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

Для просмотра раздела «Настройки → Аккаунт» запустите `npm run dev:mock -- --host 127.0.0.1 --port 5174 --strictPort` и добавьте параметр `mockAccount`:

| URL | Состояние |
| --- | --- |
| `http://127.0.0.1:5174/?mockAccount=unpaired` | Принтер не привязан; бессрочный код и QR запрашиваются при открытии экрана, кнопка «Отменить привязку» отменяет код. |
| `http://127.0.0.1:5174/?mockAccount=paired` | Имя и аватар демо-аккаунта, имя привязанного принтера. |
| `http://127.0.0.1:5174/?mockAccount=unlink-pending` | Отвязка ожидает окончания текущей работы. |
| `http://127.0.0.1:5174/?mockAccount=revoked` | Доступ отозван; доступен сброс привязки. |
| `http://127.0.0.1:5174/?mockAccount=offline` | Ошибка недоступности AutoPrinter. |
| `http://127.0.0.1:5174/?mockAccount=disabled` | AutoPrinter выключен и не настроен; это также состояние по умолчанию. |

Дополнительно доступны существующие сценарии `occupied` и `unknown`. Все действия остаются локальными в текущей вкладке; перезагрузка сбрасывает состояние. QR ведёт на демонстрационный домен `treed.example` и не привязывает реальный принтер.

`account-avatar.svg` — локальный демонстрационный аватар. В live-режиме имя и HTTPS-адрес изображения приходят в `owner_profile` из Core; без изображения интерфейс показывает инициалы.

Режимы и команды проверки: [корневой README](../README.md).
Адаптер настоящего принтера: [`src/runtime/live.ts`](../src/runtime/live.ts).
