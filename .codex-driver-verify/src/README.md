# `src`

Основная Tauri/UI-shell оболочка TreeD Shell.

## Состав

- `main.tsx` - React entrypoint, diagnostics и error boundary.
- `App.tsx` - root composition, wiring snapshot/commands/controllers/runtime state.
- `app/` - выбор активного экрана и bottom navigation composition.
- `dashboard/` - главный экран, idle/print views, status dock, temperature widgets.
- `control/` - экран управления движением, нагревом, обдувом, светом и maintenance-группами.
- `files/` - библиотека G-code файлов, выбор, старт и удаление файла.
- `settings/` - настройки устройства, интерфейса, Wi-Fi, cloud/updates placeholders и виртуальная клавиатура.
- `shell/` - top-status popups, notification/power/network status wiring.
- `printSession/` - controller активной печати и файловой сессии.
- `printTune/` - runtime-tune modal, numeric controls и keyboard helpers.
- `heating/` - controller нагрева и обдува.
- `maintenance/` - maintenance action controller.
- `core/` - transport, store, host-network и command clients.
- `ui/` - переиспользуемые primitives/widgets/icons.
- `styles/` - foundation tokens и общий UI-kit CSS.
- `assets/` - брендовые SVG и icon source files.
- `runtime/live.ts` - live runtime adapter для Vite alias `#runtime`.
- `config.ts` - `VITE_MOONRAKER_URL`.

## Инварианты

- UI-контракт под `960x544`.
- Приложение не использует `react-router`; экран выбирается через `ScreenId` и `AppScreenContent`.
- Новые крупные экраны не добавляются внутрь `App.tsx`; они выносятся в отдельный feature/page слой.
- Общие printer/domain rules живут в `packages/printer-logic`, а не в `src/**`.
- Повторяемые UI-элементы идут через `src/ui`.
- Ошибки транспорта и команд поднимаются в UI явно, без silent-fail.
- Mock/live выбирается только через Vite alias `#runtime`.

## Смежные README

- `core/README.md`
- `dashboard/README.md`
- `ui/README.md`
- `styles/README.md`
- `assets/README.md`
