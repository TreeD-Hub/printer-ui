# `src/core/store`

Слой хранения и обновления состояния интерфейса.

Сейчас:
- `printerStore.ts` — внешний store полного снимка принтера и selector-подписки через `useSyncExternalStore`;
- `usePrinterSnapshot.ts` — transport lifecycle, polling/WebSocket и compatibility-доступ к полному снимку для еще не перенесенных экранов.

Контракт:
- источник данных выбирается по `VITE_DATA_MODE`;
- при сбоях connection переводится в `reconnecting/offline`;
- новые UI-блоки должны читать частые данные через selector-хуки, а не подписываться на весь `PrinterSnapshot`.
