# `src/settings`

Настройки принтера, состояние системных сервисов и наблюдение за операцией обновления.

## Состав

- `SettingsPage.tsx` — экран настроек и подключение update controls.
- `settingsController.ts` — состояние формы, статуса и повторный опрос durable update operation через Moonraker.
- В разделе «Облако» переключатель AI вызывает `/server/treed/detection/settings` через `hostDetection.ts` и меняется после подтверждения POST. Core сохраняет настройку на принтере; на паузе настройка сохраняется, а автоотмена блокируется. Для анализа также нужен настроенный камерный клиент и сервер классификатора.
- `UpdateOperationScreen.tsx` и `updateOperation.css` — полноэкранное состояние операции внутри React UI.
- `updateReleaseClient.ts` — проверка доступных UI/Core релизов и mock сценарии успеха/ошибки/отката.
- `SystemSettingsPage.tsx`, `systemStatus.ts`, `useMoonrakerSystemStatus.tsx` — состояние хоста, сервисов и CAN-устройств.

Mock-режим воспроизводит переходы операции; `?mockUpdate=rollback` включает автоматический возврат предыдущей версии, `?mockUpdate=error` — отказ проверки готовности. Независимый экран, который переживает остановку браузера/X runtime, описан в [update-display-lifecycle.md](../../docs/update-display-lifecycle.md) и пока не реализован.

## Сброс локальных настроек

В «Система» доступен сброс переопределений установленного профиля с отдельным
подтверждением. `settingsController` вызывает `/server/treed/settings/reset` через
`HostUpdateClient.resetOverrides`; наличие возможности сообщает `canResetOverrides`.
Backend сохраняет копию `local_overrides.cfg`, атомарно очищает файл и перезапускает
Klipper. Калибровки и сохранённые переменные остаются. Ошибка или необходимость
ручного перезапуска показываются в том же блоке. Печать и обновление блокируют сброс.

При обновлении из активной паузы UI предлагает отдельное подтверждение отмены
печати. Только после него запрос содержит `cancelPausedPrint: true`; сервер
выполняет `CANCEL_PRINT`, проверяет остановку задания и передаёт обновление worker.

API обновления: [`hostUpdate.ts`](../core/hostUpdate.ts).
Доставка UI и границы ответственности: [runtime delivery](../../docs/ui-runtime-delivery/README.md).
