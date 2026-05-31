# ADR 01: Tauri-only runtime для TreeD Shell V2

Дата: 2026-03-12  
Статус: Accepted

## Контекст

- `treed-shell` нацелен на работу как UI-оболочка для принтера в фиксированном разрешении `960x544`.
- Основной runtime-контур TreeD V2: Rock Pi / Armbian Debian 12, U2C CAN, Octopus Pro, EBB42 и Eddy.
- Raspberry Pi 3/4 больше не считается primary target; его можно использовать только как dev/fallback perf-reference при отдельной проверке.
- Параллельная поддержка двух desktop runtime (Tauri + Electron) увеличивает стоимость разработки и тестирования.

## Решение

- Основной и единственный desktop runtime для проекта: `Tauri`.
- `Electron` не используется как runtime и не закладывается в roadmap.
- Веб-слой остается общим (`React + Vite`), а нативная упаковка и запуск выполняются через `src-tauri/**`.
- Целевая интеграция с принтером идет через `treed-mainshellOS`; этот репозиторий не владеет железом, systemd/fallback и provisioning.
- Режим `treed-shell` как UI-провайдера должен включаться через явный контракт `TREED_UI_PROVIDER=treed-shell`, пока дефолтный provider не изменен в `treed-mainshellOS`.

## Последствия

- Плюсы:
  - меньше потребление ресурсов на embedded WebView runtime по сравнению с Electron-подходом;
  - один пайплайн сборки и один runtime-контур;
  - проще стабилизировать поведение критичных действий принтера и восстановление после перезапуска.
- Минусы:
  - нужен Rust toolchain в dev-среде;
  - часть runtime-проблем смещается в Tauri/WebView-слой и требует отдельной диагностики.

## Hardware matrix

- Primary target: Rock Pi / Armbian Debian 12.
- Printer stack: Klipper, Moonraker, U2C CAN, Octopus Pro, EBB42, Eddy.
- Development target: Windows 11 desktop.
- Fallback/perf reference: Raspberry Pi 3/4 только при отдельной задаче и замере.

## Правила разработки

- Новые фичи и экраны реализуются в UI-слое (`src/**`), если задача не требует runtime-правок.
- Проверка Tauri обязательна перед релизными поставками и при изменениях `src-tauri/**`.
- Не добавлять Electron-зависимости и Electron-скрипты без отдельного ADR.
- Не менять fallback на KlipperScreen и contract provider-а без отдельной интеграционной задачи в `treed-mainshellOS`.

## Операционные метрики для V2 runtime

- Базовые метрики, которые нужно фиксировать перед релизом:
  - время старта UI;
  - потребление памяти в idle;
  - реакция UI на критичные действия (`start/pause/resume/cancel/home`).
- Пороговые значения фиксируются в отдельном perf-документе после первых стабильных измерений на железе.
