# `src/core/transport`

HTTP- и WebSocket-клиенты Moonraker, нормализация объектов и файлов
в состояние `PrinterSnapshot`.

## Состав

- `moonrakerClient.ts` - HTTP-клиент Moonraker, discovery объектов перед snapshot fetch, file list/metadata fetch и delete G-code file.
- `moonrakerWebSocketClient.ts` - проверка готовности Klippy, discovery и subscription на `printer.objects.subscribe`, reconnect/backoff и status notifications.
- `moonrakerNormalizer.ts` - нормализация Moonraker objects/files в `PrinterSnapshot`.
- `moonrakerRuntimeObjects.ts` - объекты с состоянием, нужные UI для query/subscription; наличие macro проверяется по полному `objects/list`.
- `types.ts` - transport contracts, snapshot shape и subscription handlers.

Mock-transport живет вне production graph в `mocks/runtime.ts` и подключается только через `vite --mode mock`.

## Контракт

- Возвращать нормализованный `PrinterSnapshot`.
- Состояния связи, Klippy и задания хранить отдельно в `transport.state`, `klippy.state` и `printJob.state`; статус связи для UI вычислять через `getPrinterConnectionState`.
- Границы движения читать из текущих `toolhead.axis_minimum/axis_maximum`; при их отсутствии движение блокируется.
- Не скрывать ошибки HTTP, timeout и invalid result.
- Сохранять источник ревизии (`mock`, `http`, `websocket`) для printer objects и files.
- Ошибки file list/metadata показывать отдельно от состояния задания.
- WebSocket reconnect должен явно переводить UI в `reconnecting`, а не оставлять stale online state.
- Подписка на `save_variables`, `_TREED_EVENT`, `_TREED_CLOG_RECOVERY_STATE`, `_TREED_OPERATION_STATE` даёт настройки света, последнее событие, допуск филамента и фазу операции. `notify_gcode_response` передаётся также в центр уведомлений; его формат разбирает общий пакет `@treed/printer-logic`.

Проверка совместимости с Core: `coreProtocolCompatibility.test.ts`.
В CI путь fixture задаёт `CORE_CONTRACT_FIXTURE`; локально без него
тест совместимости пропускается.
Подписки React и обработка состояния связи: [README store](../store/README.md).
