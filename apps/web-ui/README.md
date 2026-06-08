# treed-web-ui

Заглушка будущей вебморды TREED. На первом этапе это integration playground для общего пакета `@treed/printer-logic`.

## Назначение

- Проверять, как веб-интерфейс потребляет общие printer capabilities.
- Не дублировать rules из `treed-shell`.
- Подготовить отдельный контур UI без Tauri и без 5-дюймовых shell-ограничений.

## Текущий статус

Это не production UI. Экран использует mock `PrinterSnapshot`, локальные переключатели состояния и выводит результат `getPrinterCapabilities`.

## Зависимость на общую логику

В monorepo зависимость идет на локальный workspace-пакет:

```json
"@treed/printer-logic": "file:../../packages/printer-logic"
```

Сборку из корня запускает `npm run build:web-ui`.

## Риски и ограничения

### Нельзя начинать полноценную вебморду до стабилизации общей логики

Пока репозиторий является заглушкой и integration playground. Production flow, live-команды и полноценная навигация добавляются отдельными задачами.

### Нельзя копировать rules из `treed-shell`

Все правила доступности действий должны приходить из `@treed/printer-logic`. Если правило отличается, менять нужно общий пакет и его тесты.

### Нельзя смешивать shell-специфику

Не переносить Tauri, 5-дюймовый canvas `960x544`, touch-only layout и компоненты `treed-shell` как обязательную основу вебморды.

### Нельзя подключать live-команды без политики

Реальные команды подключать только после capabilities, явного error-flow и решения по Moonraker transport для web.

## Проверки

```powershell
npm run typecheck
npm run build
```
