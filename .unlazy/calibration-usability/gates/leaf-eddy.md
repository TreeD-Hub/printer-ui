# Gates: Eddy UI

OWNS: src/macros/EddyCalibrationScreen.tsx, src/macros/eddyCalibration.css, src/macros/EddyCalibrationScreen.test.tsx, src/macros/EddyCalibrationVisuals.tsx, src/macros/eddyCalibrationVisuals.css, src/macros/EddyCalibrationVisuals.test.tsx

Scope: исправить удобство всех экранов Eddy без ослабления допуска и сохранения.

- [x] G1: Разметка соответствует focus-plan.md и canvas; основной агент проверил все виды, TESTZ 3x2, вращение 3D-матрицы, четыре винта CW/CCW/unknown, Z-схемы и первый слой; целевые значения, переходы/завершение и важные действия доступны.
  EVIDENCE: Root просмотрел 9 подготовок Eddy и свежие height/screws/mesh PNG в node_modules/.tmp/final-calibration-renders; первый слой с footerDone просмотрен во встроенном браузере и сохранён first-layer-final.jpg. Chromium mock подтвердил four screws→confirm→Next scan→rotation/drag/reset/table→save→firstLayer, TESTZ6/abort и full528px content при544px canvas. Reviewer независимо просмотрел safety PNG и проверил axes/CWCCW/guards; missing/null/extreme bounds приняты по адресным тестам.
- [x] G2: Diff сохраняет команды, безопасность движения, отдельное сохранение, отмену и сообщения о блокировках.
  EVIDENCE: Независимый reviewer проверил фактические состояния, guards, timeout/uncertain, accepted abort и fresh save/restart; core probe_eddy_duo.cfg подтверждает порядок drive→height→temperature→Z0→screws→mesh. Root E2E критических переходов прошли; child68 адресных tests pass, полное повторение входит в root:R2. Движение и макросы Klipper не изменены.
