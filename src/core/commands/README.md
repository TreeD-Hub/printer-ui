# `src/core/commands`

Слой отправки управляющих команд принтера из UI.

## Состав

- `types.ts` - command types и re-export shared contracts из `@treed/printer-logic`.
- `catalog.ts` - re-export `TREE_D_COMMAND_CATALOG`, risk/capability helpers и block reasons.
- `moonrakerCommandClient.ts` - live command client для Moonraker HTTP и `/printer/gcode/script`.
- `usePrinterCommands.ts` - React hook состояния выполнения: `pending`, `error`, `lastResult`.
- `index.ts` - публичные экспорты слоя.

Mock-команды живут вне production graph в `mocks/runtime.ts` и подключаются только через `vite --mode mock`.

## Поддерживаемые группы команд

- Печать: `start`, `pause`, `resume`, `cancel`, `emergencyStop`.
- Парковка и движение: `home`, `homeAll`, `homeX`, `homeY`, `homeXY`, `homeZ`, `moveAxis`, `disableMotors`.
- Нагрев, обдув и свет: `setNozzleTarget`, `setBedTarget`, `setHeatingTargets`, `turnOffHeaters`, `setFanPercent`, `setMainLightEnabled`.
- Runtime tune: speed factor, flow factor, accel, pressure advance, retraction length, Z-offset.
- Филамент: `loadFilament`, `unloadFilament`, `setFilamentSensorMode`, `setFilamentEncoderSensitivity`.
- V2/Eddy/shaper: `zParkZeroEddy`, `shaperCalibrateLight`, `shaperCalibrateFull`, `xyMotionTest`.
- Сервисные команды: `restartKlipper`, `firmwareRestart`, `restartMoonraker`.
- Host power: `rebootHost`, `shutdownHost`.
- Console G-code: `consoleGcode`, с обязательной risk/confirmation политикой на UI-слое.

## Контракт

- Runtime block reasons берутся из `getTreeDCommandBlockReason`.
- Аргументы команд валидируются через `getTreeDCommandArgumentError` и лимиты `TREED_V2_COREXY_V1_LIMITS`.
- Риск команды и требование confirmation хранятся в общем `TREE_D_COMMAND_CATALOG`, а не выводятся из текста кнопки.
- Стандартные Moonraker system actions не блокируются capability-флагами или состоянием Klipper, но требуют online-транспорта Moonraker и повторного подтверждения.
- Ошибка Moonraker или timeout возвращается как явный failed result/error, без silent-fail.
- Новые общие command types/rules сначала добавляются в `packages/printer-logic`, затем подключаются здесь.
