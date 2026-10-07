# `src/ui`

Общие кнопки, поля, метрики, иконки и модальные элементы экранного UI.

## Состав

- `iconAssets.ts` — единый реестр SVG-иконок и `UiIconName`.
- `IconMask.tsx` — отображение иконки через CSS mask/currentColor.
- `buttons.tsx` — `StatusIconButton`, `ActionSquareButton`, `NavItemButton`.
- `controlWidgets.tsx` — `SegmentedToggle`, ползунки, джойстик и управление осями.
- `metrics.tsx` — `TemperatureMetric`, `PlainMetric`.
- `printFileCard.tsx` — карточка G-code файла.
- `printFilePreview.ts` — подготовка превью файла.
- `PrintPreviewIcon.tsx` — иконка превью модели.
- `printTuneWidgets.tsx` — элементы окна настройки во время печати.
- `numericTuneWidgets.tsx` / `.css` — общий редактор числового значения и цифровая клавиатура; без команд устройства.
- `settingsWidgets.tsx` - settings cards/select/toggle/sidebar/virtual keyboard.
- `classNames.ts` - минимальный helper сборки CSS-классов.
- `useModalFocus.ts` - начальный фокус, цикл Tab внутри модалки, закрытие по Escape и возврат фокуса, включая вложенные окна.
- `index.ts` - публичные экспорты UI слоя.

## Правила

- Новые иконки добавляются через `src/assets/icons/**` и регистрируются в `iconAssets.ts`.
- Повторяемые кнопки, поля, метрики и keyboard/tune widgets добавляются сюда до использования в screen-слое.
- UI primitives не должны знать про Moonraker, transport, command execution или printer domain rules.
- Размеры touch-target и shared visual behavior правятся здесь и в `src/styles/**`, чтобы изменения каскадно применялись по shell.

Визуальные правила: [foundation](../../docs/00_FOUNDATION.md).
Общие стили: [`src/styles`](../styles/README.md).
Исходники иконок: [`src/assets/icons`](../assets/icons/README.md).
