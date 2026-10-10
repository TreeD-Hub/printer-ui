# `src/core/commands`

Слой отправки управляющих команд принтера из UI.

## Состав

- `types.ts` - command types и re-export shared contracts из `@treed/printer-logic`.
- `catalog.ts` - re-export `TREE_D_COMMAND_CATALOG`, risk/capability helpers и block reasons.
- `moonrakerCommandClient.ts` - live command client для Moonraker HTTP и `/printer/gcode/script`.
- `usePrinterCommands.ts` - React hook состояния выполнения: `pending`, `error`, `lastResult`.
- `useSystemCommandRecovery.ts` — состояние восстановления после подтверждённой системной команды.
- `index.ts` - публичные экспорты слоя.

Mock-команды живут вне production graph в `mocks/runtime.ts` и подключаются только через `vite --mode mock`.

## Поддерживаемые группы команд

- Печать: `start`, `pause`, `resume`, `cancel`, `emergencyStop`.
- Парковка и движение: `home`, `homeAll`, `homeX`, `homeY`, `homeXY`, `homeZ`, `parkZBottom`, `serviceMode`, `moveAxis`, `disableMotors`.
- Нагрев, обдув и свет: `setNozzleTarget`, `setBedTarget`, `setHeatingTargets`, `turnOffHeaters`, `setFanPercent`, `setMainLightEnabled`.
- Сохраняемые настройки света: `setLightPreference`.
- Режимы драйверов и обдува: `setDriverMode`, `setDriverFanMode`.
- Runtime tune: speed factor, flow factor, accel, pressure advance, retraction length, Z-offset.
- Филамент: `loadFilament`, `unloadFilament`, `setFilamentSensorMode`, `setFilamentEncoderSensitivity`.
- V2/Eddy/shaper: `zParkZeroEddy`, `shaperCalibrateLight`, `shaperCalibrateFull`, `xyMotionTest`.
- Сервисные команды: `restartKlipper`, `firmwareRestart`, `restartUi`, `restartMoonraker`.
- Host power: `rebootHost`, `shutdownHost`.

`restartUi` вызывает штатный Moonraker endpoint `POST /machine/services/restart` для сервиса `treed-shell`; runtime обязан добавить сервис в `moonraker.asvc`.
- Console G-code: `consoleGcode`, с обязательной risk/confirmation политикой на UI-слое.

`disableMotors` отправляет `M84` и требует подтверждения в UI из-за риска просадки Z/портала.

`serviceMode` отправляет `TREED_UI_SERVICE_MODE` и ждёт завершения движения.
Стол паркуется у нижнего DIAG с отходом на 5 мм, сопло — в центре полного хода
X/Y. Кнопка доступна только при наличии макроса, готовом совместимом core и фазе
`idle`; печать, пауза и сервисные операции блокируют запуск. Команда относится
к домену `motion`, ошибки отображаются в панели парковки, координаты обновляются
после успеха.

## Контракт

- Runtime block reasons берутся из `getTreeDCommandBlockReason`.
- Аргументы команд валидируются через `getTreeDCommandArgumentError`; границы движения берутся из `toolhead.axis_minimum/axis_maximum`, а температурные потолки — из совместимого UI-контракта.
- Риск команды и требование confirmation хранятся в общем `TREE_D_COMMAND_CATALOG`, а не выводятся из текста кнопки.
- Системные команды требуют совместимого UI-контракта, online-транспорта Moonraker и подтверждения. Перезапуски и `rebootHost` разрешены при активном задании и могут его прервать; `shutdownHost` при печати и подготовке заблокирован. Ограничения восстановления, калибровки, автосъёма и прочистки задаёт общий каталог; `restartUi` имеет отдельный допуск.
- Ошибка Moonraker или timeout возвращается как явный failed result/error, без silent-fail.
- Новые общие command types/rules сначала добавляются в `packages/printer-logic`, затем подключаются здесь.

Полные правила системных команд: [общий пакет](../../../packages/printer-logic/README.md).
Получение состояния принтера: [транспорт](../transport/README.md).
