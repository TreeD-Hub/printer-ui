---
name: treed-shell-tauri-dev
description: Быстрый, правильный и экономный по токенам запуск, проверка, дочитывание коротких логов и остановка `tauri:dev` в репозитории `treed-shell` на Windows. Использовать, когда нужно поднять Tauri-приложение, проверить текущую dev-сессию, не запускать вторую копию, быстро понять стадию cold start или аккуратно завершить процессы текущего репо.
---

# Treed Shell Tauri Dev

## Обзор

Используй helper-скрипт [scripts/tauri_dev.ps1](scripts/tauri_dev.ps1) вместо ручного набора длинных PowerShell/cmd-команд.
Он работает из корня репозитория, сам нормализует `PATH`, пишет короткие логи в `%TEMP%` и возвращает компактный JSON-статус.
По умолчанию JSON сжат (`-Compress`) для экономии токенов.

## Workflow

### 1. Сначала проверяй текущую сессию

```powershell
powershell -ExecutionPolicy Bypass -File .codex/skills/treed-shell-tauri-dev/scripts/tauri_dev.ps1 -Action status
```

- Если `state` уже `running` или `starting`, не поднимай вторую копию.
- Если `state` равен `stopped`, переходи к запуску.
- Для printer/live-контура добавляй `-Profile printer` ко всем действиям (`status`, `start`, `logs`, `stop`).

### 2. Для запуска используй только helper

```powershell
powershell -ExecutionPolicy Bypass -File .codex/skills/treed-shell-tauri-dev/scripts/tauri_dev.ps1 -Action start -WaitSeconds 5
```

- Скрипт запускает именно `npm run tauri:dev`, а не раздельные `vite` и `cargo`.
- Скрипт сам добавляет пользовательские `node` и `cargo` в `PATH`.
- Для первого cold start на новой машине допускай долгую компиляцию Rust; это не ошибка само по себе.

Для production-like проверки printer UI используй live-профиль:

```powershell
powershell -ExecutionPolicy Bypass -File .codex/skills/treed-shell-tauri-dev/scripts/tauri_dev.ps1 -Action start -Profile printer -WaitSeconds 5
```

- `-Profile printer` запускает `npm run tauri:dev:printer`.
- У printer-профиля отдельные state/log файлы, чтобы не смешивать mock desktop и live printer диагностику.

### 3. Проверяй готовность коротким статусом

- `viteReady=true` значит, что фронтенд-сервер поднялся.
- `state=running` и `appPid != null` значат, что окно Tauri уже запущено.
- Пока `state=starting`, не объявляй сбой слишком рано на cold start.
- Если нужен расширенный статус (процессы и хвосты логов), добавляй `-IncludeDetails`.

### 4. Читай логи только по необходимости

```powershell
powershell -ExecutionPolicy Bypass -File .codex/skills/treed-shell-tauri-dev/scripts/tauri_dev.ps1 -Action logs -Tail 20
```

- По умолчанию используй `status`, а не длинный `Get-Content`.
- Полные логи открывай только если короткого хвоста действительно недостаточно.
- Для удобного чтения человеком добавляй `-PrettyJson`.

### 5. Останавливай сессию тем же helper

```powershell
powershell -ExecutionPolicy Bypass -File .codex/skills/treed-shell-tauri-dev/scripts/tauri_dev.ps1 -Action stop
```

- Не убивай все `node.exe` и `cargo.exe` по системе без фильтра.
- Скрипт сначала ищет управляемую сессию, потом при необходимости подбирает уже запущенную сессию текущего репо.

## Правила

- Работай только из корня `treed-shell`.
- Для dev-запуска предпочитай `tauri:dev`; `tauri:build` используй только если пользователь просит сборку.
- Перед диагностикой "не стартует" сначала вызывай `status`, потом `logs`.
- Если окружение неполное, сообщай конкретно, чего не хватает: `npm.cmd`, `cargo.exe`, `rustc`, `WebView2`, `MSVC`.
- Если пользователь попросил просто запустить Tauri, достаточно `start` и короткого статуса без длинного лога.
- Не включай `-IncludeDetails` без причины: это увеличивает ответ и расход токенов.

## Ресурс

- `scripts/tauri_dev.ps1` — единая точка входа для `start`, `status`, `logs`, `stop`.
