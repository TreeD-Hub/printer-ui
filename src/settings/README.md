# `src/settings`

Настройки принтера и пользовательское наблюдение за host-side операцией обновления.

- `SettingsPage.tsx` — экран настроек и подключение update controls.
- `settingsController.ts` — состояние формы, статуса и повторный опрос durable update operation через Moonraker.
- `UpdateOperationScreen.tsx` и `updateOperation.css` — полноэкранное состояние операции внутри React UI.
- `updateReleaseClient.ts` — проверка доступных UI/Core релизов и mock сценарии успеха/ошибки/отката.

Mock-режим воспроизводит переходы операции; `?mockUpdate=rollback` включает автоматический возврат предыдущей версии, `?mockUpdate=error` — отказ health check. Независимый экран, который переживает остановку browser/X runtime, описан в `docs/update-display-lifecycle.md` и пока не реализован.
