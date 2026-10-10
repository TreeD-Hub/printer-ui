# `@treed/printer-logic`

Общие типы и чистые функции принтера для TreeD Shell и веб-стенда.
Пакет `@treed/printer-logic` подключён как npm workspace и импортируется из `dist`.

## Назначение

Пакет содержит:

- типы printer snapshot, connection state, limits, files, host-network и BTT SFS runtime state;
- функции нормализации идентификаторов, путей, имён и каталогов файлов печати, а также сортировки;
- функции нормализации Wi-Fi/host-network статусов и выбора сети;
- нормализацию homed axes;
- расчет capabilities для групп действий;
- каталог TreeD-команд с risk/capability metadata и `pendingDomain`; `getPrinterCommandPendingDomain` читает домен из каталога;
- причины блокировки команд через `getTreeDCommandBlockReason`;
- базовую валидацию аргументов команд через `getTreeDCommandArgumentError`;
- температурные потолки профиля `TREED_V2_COREXY_V1_LIMITS`; runtime-границы осей поступают из Klipper.

Контракт датчика нити включает `FilamentSensorSnapshot`, capability `filamentSensorControl` / `filamentEncoderSensitivity` и команды `setFilamentSensorMode` / `setFilamentEncoderSensitivity`. Правила блокируют обе настройки во время активной печати, режим `motion` при недоступном motion-канале и чувствительность при недоступном motion-канале.

Системные команды `restartKlipper`, `firmwareRestart`, `restartUi`, `restartMoonraker`, `rebootHost` и `shutdownHost` относятся к независимому pending-домену `system`. Подтверждённые оператором перезапуски разрешены при активном задании, включая `printing`, `paused`, `preparing` и фазу core `preparing`: это штатное поведение, а не ошибка доступности команды. Перезагрузка хоста, Klipper или MCU может прервать задание; продолжение печати не гарантируется. `shutdownHost` остаётся заблокирован при активной печати и подготовке. Все перечисленные команды, кроме `restartUi`, блокируются в состояниях `recovery`, `calibration`, фазах core `calibrating`, `auto_remove` и автоматической прочистке. Требования online-транспорта Moonraker, совместимого UI-контракта и подтверждения опасного действия сохраняются. Реальные ошибки запроса не считаются успешным перезапуском. Транспорт и recovery-loop остаются ответственностью UI-приложения.

Команда `disableMotors` снимает удержание осей через `M84`, относится к motion-домену и требует подтверждения в UI.

`setDriverMode` (XYZ, домен `motion`) и `setDriverFanMode` (домен `fan`)
принимают `quiet|normal` и требуют отдельных подтверждений. Доступ определяется
capability и `DriverModeSnapshot`; XYZ заблокирован при печати, паузе и сервисе,
обдув сохраняет автоматику. `setDriverFanMode` дополнительно принимает `percent`
для мощности при нагрузке: только при `powerControlSupported` и в полученном
от устройства диапазоне `minPowerPercent..maxPowerPercent`. Старому core
проценты не отправляются. Ответ HTTP подтверждается режимом и, если передана,
мощностью `activePercent` в snapshot. Обдув без нагрузки может оставаться на 0%.

Команда `moveAxis` принимает одно перемещение от -50 до 50 мм.

Команда `parkZBottom` запускает ручную нижнюю парковку Z через TMC5160/DIAG без цикла автосъёма.

Команда `serviceMode` относится к домену `motion` и вызывает `TREED_UI_SERVICE_MODE`:
стол у нижней опоры, сопло в центре X/Y. Для допуска UI передаёт
`serviceModeSupported` по наличию макроса; также нужны готовый совместимый core
и фаза `idle`. Печать, пауза и сервисные операции запрещают запуск.

Сохранение Eddy Z-offset работает штатно: каталог предоставляет только диагностическую команду `eddyAutosaveStatus`, без команд включения и выключения.

Пакет не выполняет команды, не вызывает `nmcli`, не ходит в Moonraker и не знает про layout. UI-приложения отвечают за transport, errors, retry, confirmation flow и отображение.

## Публичный контракт

- `LightPreferences` и команда `setLightPreference` задают независимые `onStartup` / `onPrintStart`. Запись требует capability `lightingPreferences`.
- `PrinterEvent`, `parsePrinterEvent`, `readPrinterEvent`, `describePrinterEvent` задают общий для shell/web формат `treed_event v1|sequence|code|detail` и его отображение. Последнее событие доступно из `_TREED_EVENT` в Klipper.
- Ручной филамент запрещён при печати, подготовке, калибровке, автосъёме и `clogRecoveryActive`. На паузе разрешён при нагретом сопле; движение осей и парковка остаются заблокированы.

- Типы и функции экспортируются из `src/index.ts`.
- Точка входа собранного пакета: `dist/index.js`.
- Объявления типов: `dist/index.d.ts`.
- Экспорт пакета: `"."`.
- В архив пакета включаются `dist` и `README.md`; пакет помечен `private: true`.

## Инварианты

- Domain rules нельзя смешивать с UI: никаких React-компонентов, CSS, Tauri API и layout-логики.
- Shell и Web не должны расходиться в правилах доступности действий.
- Блокировки крупных UI-групп идут через `getPrinterCapabilities`.
- Блокировки конкретных команд идут через `getTreeDCommandBlockReason`.
- Если правило меняется, оно меняется здесь и покрывается тестом в `packages/printer-logic/test/**`.

## Проверки

Из каталога пакета:

```powershell
npm run typecheck
npm test
npm run build
```

Из корня репозитория:

```powershell
npm run typecheck:logic
npm run test:logic
npm run build:logic
```

## Смежные слои

- [Командный клиент UI](../../src/core/commands/README.md).
- [Состояние и транспорт UI](../../src/core/README.md).
- [Веб-стенд](../../apps/web-ui/README.md).
