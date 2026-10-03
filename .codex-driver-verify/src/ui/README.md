# `src/ui`

Переиспользуемые UI primitives и widgets для shell-экранов.

## Состав

- `iconAssets.ts` - единый реестр SVG-иконок и `UiIconName`.
- `IconMask.tsx` - базовый рендер иконки через CSS mask/currentColor.
- `buttons.tsx` - `StatusIconButton`, `ActionSquareButton`, `NavItemButton`.
- `controlWidgets.tsx` - `SegmentedToggle`, sliders, joystick и axis controls.
- `metrics.tsx` - `TemperatureMetric`, `PlainMetric`.
- `printFileCard.tsx` - карточка G-code файла.
- `PrintPreviewIcon.tsx` - фирменная иконка превью модели.
- `printTuneWidgets.tsx` - controls для runtime-tune modal.
- `settingsWidgets.tsx` - settings cards/select/toggle/sidebar/virtual keyboard.
- `classNames.ts` - минимальный helper сборки CSS-классов.
- `index.ts` - публичные экспорты UI слоя.

## Правила

- Новые иконки добавляются через `src/assets/icons/**` и регистрируются в `iconAssets.ts`.
- Повторяемые кнопки, поля, метрики и keyboard/tune widgets добавляются сюда до использования в screen-слое.
- UI primitives не должны знать про Moonraker, transport, command execution или printer domain rules.
- Размеры touch-target и shared visual behavior правятся здесь и в `src/styles/**`, чтобы изменения каскадно применялись по shell.
