# `docs`

Документация проекта `treed-shell`.

## Состав

- `00_FOUNDATION.md` - foundation-токены, визуальные правила и Nothing-inspired UI-инварианты.
- `01_ADR_TAURI_ONLY_V2_RUNTIME.md` - решение по Tauri-only V2 runtime и hardware matrix.
- `host-network-runtime-contract.md` - контракт Wi-Fi/host-network между UI и `treed-mainshellOS`.
- `system-power-runtime-contract.md` - контракт reboot/shutdown/service commands и confirmation-only wiring.
- `ui-runtime-delivery/README.md` - production delivery printer UI через release artifact и loader.
- `update-display-lifecycle.md` - целевое разделение постоянного системного экрана обновления и заменяемого UI bundle.

## Инварианты

- Документы описывают фактический контракт `treed-shell`, а не host-side реализацию `treed-mainshellOS`.
- Новые Moonraker/host-runtime сценарии сначала фиксируются как контракт, затем подключаются в UI.
- Если документ меняет loader, fallback, provider switch или OS-side command surface, синхронная задача должна быть в `treed-mainshellOS`.

## Смежные точки

- Корневой обзор: `../README.md`.
- UI shell: `../src/README.md`.
- Shared domain logic: `../packages/printer-logic/README.md`.
