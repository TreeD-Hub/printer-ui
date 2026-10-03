# `src/dashboard`

Слой главного экрана TreeD Shell.

## Состав

- `config.ts` - `ScreenId`, bottom navigation, UI asset registry для dashboard и декларативные схемы метрик.
- `DashboardContainer.tsx` - composition dashboard screen.
- `DashboardPage.tsx` - page view главного экрана.
- `DashboardIdleView.tsx` - idle-состояние.
- `DashboardPrintView.tsx` - состояние активной печати.
- `DashboardStatusDock.tsx` - status/connection dock.
- `DashboardTemperatureWidgets.tsx` - temperature widgets.
- `helpers.ts` - форматирование, проценты и preview helpers.
- `printerStatusState.ts`, `printerTemperatureState.ts` - производные состояния для отображения.
- `useDashboardIdleController.ts`, `usePrinterDisplayStatus.ts` - controller hooks.

## Инварианты

- Новые dashboard constants и схемы повторяемых метрик добавляются в `config.ts`, а не в `App.tsx`.
- Визуальная логика idle/print режима остается в dashboard-компонентах.
- Domain rules и command blocking берутся через controller props и `@treed/printer-logic`, а не вычисляются локально в view.
- Bottom navigation пока живет в dashboard config, потому что `ScreenId` используется shell composition без `react-router`.
