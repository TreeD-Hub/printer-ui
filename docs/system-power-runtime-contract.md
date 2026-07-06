# System Power Runtime Contract

## Назначение

Контракт нужен для destructive/system actions из power popup `treed-shell`.
UI показывает эти действия доступными при online-транспорте Moonraker независимо от состояния Klipper.

## Границы ответственности

- `packages/printer-logic` — catalog metadata, confirmation requirement и причины блокировки по состоянию транспорта Moonraker.
- `src/core/commands/moonrakerCommandClient.ts` — вызов штатных Moonraker endpoints.
- `src/shell/**` — power popup, точные подписи и повторное подтверждение.
- `src/core/commands/useSystemCommandRecovery.ts` — ограниченный refresh-loop после restart-команд.
- `treed-mainshellOS` — доступность штатных Moonraker system endpoints в runtime.

`treed-mainshellOS` не добавляет отдельный component для этих действий: сами действия уже есть в Moonraker.

## Capability Surface

`treed-mainshellOS` V2 profile может публиковать диагностические capability-флаги:

- `gcode_macro _TREED_SYSTEM_POWER.enabled = 1`
- `gcode_macro _TREED_SERVICE_COMMANDS.enabled = 1`

`treed-shell` нормализует эти значения в snapshot capabilities:

- `power`
- `serviceCommands`

Capability-флаги и состояние Klipper не блокируют стандартные Moonraker system actions. Кнопки блокируются только при недоступном транспорте Moonraker или выполнении другой команды.

## Moonraker Endpoints

После повторного подтверждения UI вызывает:

- `POST /machine/reboot`
- `POST /machine/shutdown`
- `POST /printer/restart`
- `POST /printer/firmware_restart`
- `POST /machine/services/restart` с JSON body `{ "service": "treed-shell" }`
- `POST /server/restart`

Для restart UI loader `treed-mainshellOS` обязан добавить `treed-shell` в `${PI_HOME}/printer_data/moonraker.asvc`. Endpoint перезапускает только `treed-shell.service`; Klipper, Moonraker и host OS не перезапускаются.

После `restartKlipper`, `firmwareRestart` и `restartMoonraker` UI выполняет ограниченный refresh-loop на 12 секунд. WebSocket reconnect продолжает работать независимо. `restartUi`, reboot и shutdown не подтверждаются через старый snapshot: UI показывает переходный статус, а restart/reboot поднимает приложение заново.

Эти endpoints не вызываются автоматическими live-проверками. Unit/contract tests проверяют wiring и static contract, но не выполняют reboot/shutdown/restart на устройстве.
