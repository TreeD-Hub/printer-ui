---
name: treed-shell-precommit-checks
description: Выполнять минимальные проверки перед commit в treed-shell по типам изменений (`src/**`, UI, `src-tauri/**`, shell/systemd) и явно фиксировать ограничения, если часть проверок не запускалась.
---

# Treed Shell Precommit Checks

## Обзор

Единый pre-commit workflow для `treed-shell`.
Использовать при любой задаче с правками перед рекомендацией commit.

## Workflow

### Шаг 1. Определить затронутые зоны

- Собрать список измененных файлов (например, `git diff --name-only`).
- Сопоставить изменения с зонами:
  - `src/**`;
  - UI/верстка/компоненты;
  - `src-tauri/**`;
  - shell/systemd-интеграция.

### Шаг 2. Запустить проверки по матрице

- Для правок в `src/**`:
  - `npm run lint`;
  - `npm run typecheck`;
  - `npm run test` (или ближайший эквивалент).
- Для правок UI/верстки/компонентов:
  - `npm run verify:ui` (полный цикл: lint + typecheck + unit + browser screenshot/layout analysis);
  - `npm run test:visual` (если настроено);
  - `npm run test:visual:layout` (обязательный скрин `dashboard-shell.png` + геометрический анализ layout в браузере);
  - `npm run preview:960` для проверки `960x544`.
- Для правок в `src-tauri/**`:
  - `npm run tauri:dev` или `npm run tauri:build` в доступной среде.
- Для правок shell/systemd-интеграции:
  - синтакс-проверка shell (`bash -n`) в Linux-среде или CI.

### Шаг 3. Зафиксировать результат проверки

- В отчете перед commit кратко указать статус каждого запуска (`passed`/`failed`/`not run`).
- Если часть проверок недоступна локально, явно перечислить ограничения и причину.
- Не выполнять commit/push без явного разрешения пользователя.

## Примеры триггеров

- `Сделай правки и подготовь к коммиту.`
- `Проверь обязательные проверки перед commit.`
- `Дай статус verify:ui и tauri-проверок перед коммитом.`

## Быстрый запуск (PowerShell)

```powershell
npm run lint; npm run typecheck; npm run test
npm run verify:ui; npm run test:visual; npm run test:visual:layout; npm run preview:960
npm run tauri:build
```

Если нужен `bash -n`, выполнять его в Linux-среде (Raspberry Pi/CI), когда локальная Windows-среда не позволяет запуск.
