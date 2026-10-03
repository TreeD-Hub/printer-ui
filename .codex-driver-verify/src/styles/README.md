# `src/styles`

Глобальные слои стилей TreeD Shell.

## Состав

- `foundation.css` - font-face, дизайн-токены, цвета, типографика, spacing и базовые layout variables.
- `ui-kit.css` - shared primitives и utility-классы для UI-компонентов, включая icon mask.

## Правила

- Новые дизайн-токены добавляются в `foundation.css`.
- Кросс-экранные primitives добавляются в `ui-kit.css`.
- Стили конкретного screen/feature остаются рядом с его компонентом или в `App.css`, если это верхнеуровневый shell layout.
- Цвета и размеры иконок задаются через CSS/currentColor, а не через inline SVG fill/stroke в компонентах.
- Базовый визуальный контракт должен оставаться совместимым с `960x544` и Playwright layout checks.
