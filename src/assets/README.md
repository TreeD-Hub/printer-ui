# `src/assets`

Статичные брендовые ассеты интерфейса.

Состав:
- `logo_treeD-28.svg` — исходный фирменный знак с текстовой частью;
- `logo_treeD_mark.svg` — отдельный знак TreeD для dot-matrix маски на idle-экране;
- `icons/` — SVG-иконки, подключаемые через `src/ui/iconAssets.ts`.

Правила:
- интерактивные иконки добавляются через `icons/` и реестр `src/ui/iconAssets.ts`;
- брендовые SVG используются как исходники для CSS-mask/currentColor-оформления;
- цвета визуального слоя задаются через `src/styles/foundation.css`, а не внутри SVG.
