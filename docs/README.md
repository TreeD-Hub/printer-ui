# `docs`

Дизайн и контракты TreeD Shell из репозитория `printer-ui`.

## Состав

- [00_FOUNDATION.md](00_FOUNDATION.md) — токены и визуальные правила экранного UI.
- [01_ADR_TAURI_ONLY_V2_RUNTIME.md](01_ADR_TAURI_ONLY_V2_RUNTIME.md) — ADR о Tauri и составе оборудования; текущая доставка браузерного UI описана отдельно ниже.
- [host-network-runtime-contract.md](host-network-runtime-contract.md) — Wi-Fi и сеть хоста.
- [system-power-runtime-contract.md](system-power-runtime-contract.md) — перезапуски, питание хоста и подтверждение действий.
- [ui-runtime-delivery](ui-runtime-delivery/README.md) — доставка готового UI из релиза через loader.
- [update-display-lifecycle.md](update-display-lifecycle.md) — проект постоянного экрана обновления и заменяемого UI bundle.
- `superpowers/plans/`, `superpowers/specs/` — планы и спецификации отдельных задач; статус реализации нужно сверять с кодом.

## Инварианты

- Runtime-контракты описывают границу UI и хоста; планы и ADR сами по себе не подтверждают реализацию. Хостом и доставкой управляет `printer-core` (в прежних документах — `treed-mainshellOS`).
- Новые Moonraker/host-runtime сценарии сначала фиксируются как контракт, затем подключаются в UI.
- Изменение loader, резервного UI, переключения провайдера или команд хоста требует согласованного контракта в `printer-core`.

## Смежные точки

- [Корневой обзор](../README.md).
- [Экранный UI](../src/README.md).
- [Общая доменная логика](../packages/printer-logic/README.md).
