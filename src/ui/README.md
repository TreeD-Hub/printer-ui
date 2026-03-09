# `src/ui`

Библиотека UI-ассетов для ускоренной сборки новых страниц.

Состав:
- `iconAssets.ts` — единый реестр SVG-иконок;
- `IconMask.tsx` — базовый рендер иконки через mask/currentColor;
- `buttons.tsx` — типовые кнопки (`StatusIconButton`, `ActionSquareButton`, `NavItemButton`);
- `metrics.tsx` — типовые виджеты метрик (`TemperatureMetric`, `PlainMetric`);
- `PrintPreviewIcon.tsx` — фирменная иконка превью модели.

Правила:
- новые иконки добавляются только через `iconAssets.ts`;
- для повторяемых кнопок/виджетов сначала добавляется primitive в этот слой, затем используется на страницах;
- правки размеров/поведения типовых кнопок и метрик делаются в одном месте (`src/ui` + shared CSS), чтобы изменения каскадно применялись по проекту.
