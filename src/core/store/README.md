# `src/core/store`

Слой хранения и обновления printer snapshot для UI.

## Состав

- `printerStore.ts` - внешний store полного `PrinterSnapshot`, fallback snapshot, selector-подписки через `useSyncExternalStore` и reconcile stale revisions.
- `usePrinterSnapshot.ts` - lifecycle transport client: first refresh, WebSocket subscription, HTTP fallback polling, error transitions и delete file wrapper.
- `printerNotifications.ts` — единая история последних 50 событий сеанса и текущее всплывающее окно; принимает структурированный G-code RESPOND, последнее событие snapshot и ошибки состояния. Дедуплицирует sequence до перезапуска Klipper. История не сохраняется на диск.

## Контракт

- `mock`/`live` runtime выбирается через Vite alias `#runtime`.
- Если live WebSocket доступен, частые обновления приходят через subscription.
- HTTP fallback остается включенным: `2s` polling для clients без subscription и `30s` fallback при WebSocket.
- При ошибках connection переводится в `reconnecting` или `offline`, а `shutdown` сохраняется как отдельное состояние.
- Новые UI-блоки должны читать частые данные через selector-хуки, а не подписываться на весь `PrinterSnapshot`, если им нужен небольшой срез.
