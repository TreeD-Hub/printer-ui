# `src/core/transport`

Транспортный слой получения и нормализации состояния Moonraker.

## Состав

- `moonrakerClient.ts` - HTTP-клиент Moonraker, snapshot fetch, file list/metadata fetch и delete G-code file.
- `moonrakerWebSocketClient.ts` - subscription на `printer.objects.subscribe`, reconnect/backoff и status notifications.
- `moonrakerNormalizer.ts` - нормализация Moonraker objects/files в `PrinterSnapshot`.
- `moonrakerRuntimeObjects.ts` - список Moonraker objects для query/subscription.
- `types.ts` - transport contracts, snapshot shape и subscription handlers.

Mock-transport живет вне production graph в `mocks/runtime.ts` и подключается только через `vite --mode mock`.

## Контракт

- Возвращать нормализованный `PrinterSnapshot`.
- Границы движения читать из текущих `toolhead.axis_minimum/axis_maximum`; при их отсутствии движение блокируется.
- Не скрывать ошибки HTTP, timeout и invalid result.
- Сохранять источник ревизии (`mock`, `http`, `websocket`) для printer objects и files.
- File list/metadata errors допускают degraded snapshot, но не должны ломать основной printer state.
- WebSocket reconnect должен явно переводить UI в `reconnecting`, а не оставлять stale online state.
