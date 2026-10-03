# `src/assets/icons`

Набор SVG-иконок для `treed-shell`.

## Контракт

- Размер source canvas: `24x24`.
- Цвет: через `currentColor`.
- Стиль: stroke-only, без растровых эффектов.
- Базовые параметры: `stroke-width="1.9"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- Подключение в UI только через `src/ui/iconAssets.ts`.

## Состав

- Меню: `menu-dashboard.svg`, `menu-control.svg`, `menu-files.svg`, `menu-macros.svg`, `menu-settings.svg`.
- Settings/menu groups: `menu-device.svg`, `menu-interface.svg`, `menu-language.svg`, `menu-updates.svg`.
- Действия: `action-start.svg`, `action-pause.svg`, `action-resume.svg`, `action-stop-critical.svg`, `action-delete.svg`.
- Статус: `status-wifi.svg`, `status-cloud.svg`, `status-power.svg`, `status-notification.svg`.
- Метрики: `metric-nozzle.svg`, `metric-bed.svg`, `metric-fan.svg`, `metric-light.svg`, `metric-speed.svg`, `metric-flow.svg`.
- Утилиты: `utility-home.svg`, `utility-back.svg`, `utility-chevron.svg`, `utility-snowflake.svg`.

## Правила

- Не импортировать SVG напрямую из экранов, если иконка должна быть частью общего UI-kit.
- При добавлении файла обновить `src/ui/iconAssets.ts` и этот README.
