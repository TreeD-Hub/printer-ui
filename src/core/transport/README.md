# `src/core/transport`

Транспортный слой взаимодействия с источниками данных.

Состав:
- `moonrakerClient.ts` — HTTP-клиент Moonraker;
- `types.ts` — транспортные контракты.

Mock-transport живет вне production graph в `mocks/runtime.ts` и подключается только через `vite --mode mock`.

Контракт:
- возвращать нормализованный `PrinterSnapshot`;
- при ошибках бросать явные исключения.
