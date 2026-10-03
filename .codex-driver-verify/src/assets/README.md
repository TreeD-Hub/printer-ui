# `src/assets`

Статичные брендовые ассеты, импортируемые TypeScript/CSS кодом shell.

## Состав

- `logo_treeD-28.svg` - фирменный знак с текстовой частью.
- `logo_treeD_mark.svg` - отдельный знак TreeD для dot-matrix/idle-сценариев.
- `react.svg` - стандартный Vite asset, не является частью production UI contract.
- `icons/` - SVG-иконки, подключаемые через `src/ui/iconAssets.ts`.

## Правила

- Интерактивные иконки добавляются в `icons/` и регистрируются в `src/ui/iconAssets.ts`.
- Брендовые SVG используются как source assets; цвет и состояние задаются через CSS/currentColor.
- Цвета визуального слоя живут в `src/styles/foundation.css`, а не внутри SVG.
- Runtime/public assets, которые должны копироваться Vite без обработки, кладутся в `public/**`, а не сюда.
