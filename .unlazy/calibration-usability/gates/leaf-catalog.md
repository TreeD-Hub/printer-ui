# Gates: Превью и папка Eddy

OWNS: src/macros/CalibrationPreview.tsx, src/macros/calibrationPreview.css, src/macros/CalibrationPreview.test.tsx

Scope: revision4 — реализовать pixel-превью visual-plan.md; папка и каталог принимаются также в leaf-procedures.

- [x] G1: Root, Eddy folder и overview имеют читаемые матричные превью Nothing в рендере 960x544.
  EVIDENCE: Root просмотрел calibration-catalog-final.jpg, calibration-eddy-folder-final.jpg, eddy-overview-final.jpg в node_modules/.tmp; 6/4/10 предметных матричных превью, декоративные SVG не подменяют показания. Финальная геометрия вызывающих экранов повторно принимается root:R1.
- [x] G2: Все виды превью и compact API реализованы без случайных точек, градиентов и зависимостей; декорация не подменяет статус.
  EVIDENCE: Root проверил исходник и CSS: 26 видов regular/compact, явные матрицы currentColor, aria-hidden=true; независимый Vitest CalibrationPreview.test.tsx — 26/26 exit 0, 2026-10-11 19:53 MSK. API kind/className/compact сохранён.
