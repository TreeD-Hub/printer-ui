# Gates: Процедуры UI

OWNS: src/macros/CalibrationProcedures.tsx, src/macros/CalibrationProcedures.test.tsx, src/macros/calibrationProcedures.css, src/macros/ProcedureVisuals.tsx, src/macros/procedureVisuals.css, src/macros/ProcedureVisuals.test.tsx, src/macros/shaperResonanceCsv.ts

Scope: исправить удобство шейпера, экструдера, материалов и сервиса.

- [x] G1: Основной агент проверил Nothing-каталог/папку, спектры ADXL и рекомендации X/Y, extruder и все пять тестов материала, читаемую telemetry и явные переходы/завершение в браузере 960x544; алгоритм PID сохранён, добавлены только full-screen activity и доступная остановка.
  EVIDENCE: Root просмотрел финальные catalog/folder, X/Y spectra, extruder-applied, service и все пять material-prepare-0..4 PNG на 960x544. Адресный Chromium сценарий пяти материалов прошёл; выбор файла и обе проверки обязательны. ADXL→X/Y→save→Done и полноэкранный TESTZ прошли в итоговом E2E. Procedure tests 53/53, PID23/23; алгоритм PID сохранён.
- [x] G2: Diff сохраняет существующие валидацию, block reasons, ожидание подтверждения устройства и отдельное сохранение.
  EVIDENCE: Независимый reviewer принял фактический diff, свежесть спектров и поздние независимые X/Y responses, отмену waiter, ручное измерение экструдера и отдельное сохранение. Root просмотрел причины блокировок; pure CSV parser сохраняет проверки конечности/порядка/лимитов. Чужой printSession diff исключён из приёмки.
