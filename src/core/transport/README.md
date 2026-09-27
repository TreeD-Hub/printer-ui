# `src/core/transport`

Транспортный слой получения и нормализации состояния Moonraker.

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
