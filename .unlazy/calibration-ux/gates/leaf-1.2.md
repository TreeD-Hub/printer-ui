# Gates: графика и E2E

OWNS: src/macros/CalibrationPreview.tsx, src/macros/CalibrationPreview.test.tsx, src/macros/calibrationPreview.css, src/macros/ProcedureVisuals.tsx, src/macros/ProcedureVisuals.test.tsx, src/macros/procedureVisuals.css, src/macros/EddyCalibrationVisuals.tsx, src/macros/EddyCalibrationVisuals.test.tsx, src/macros/eddyCalibrationVisuals.css, e2e/calibration-workflows.spec.ts

Scope: Графика удалённых UI workflows и их тестовые сценарии убраны; живые графики, геометрия и safety assertions сохранены.

- [x] L1: Удалены только подтверждённые мёртвые графические элементы, их exports и tests; живые потребители совместимы.
  EVIDENCE: Удалены art/exports и тесты extruder/material/service/XY. Поиск их потребителей пустой; живые preview, mesh и Shaper реально просмотрены. Preview и оба Visuals test files прошли в первом адресном suite.

- [x] L2: E2E сценарии соответствуют новым названиям и доступным калибровкам, assertions безопасности сохранены; запуск E2E не выдаётся за выполненный.
  EVIDENCE: Cleanup сверил E2E с final source: root3/Eddy9, Подробнее для ADXL, Проверить выравнивание, Винт2, mesh Save/Repeat. git diff --check без ошибок. E2E не запускался по действующим ограничениям.
