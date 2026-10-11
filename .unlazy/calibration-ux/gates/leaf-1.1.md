# Gates: экраны

OWNS: src/macros/CalibrationProcedures.tsx, src/macros/CalibrationProcedures.test.tsx, src/macros/calibrationProcedures.css, src/macros/PidCalibrationScreen.tsx, src/macros/PidCalibrationScreen.test.tsx, src/macros/pidCalibration.css, src/macros/EddyCalibrationScreen.tsx, src/macros/EddyCalibrationScreen.test.tsx, src/macros/eddyCalibration.css, src/macros/MacrosContainer.tsx, src/app/AppScreenContent.tsx, src/app/AppScreenContent.test.tsx

Scope: Удалённые UI workflows отсутствуют, оставшиеся экраны соответствуют проверенной дизайн-спецификации без изменения аппаратных контрактов.

- [x] L1: Экранные изменения приняты root по рендеру, переходам и независимому ревью guards.
  EVIDENCE: Mock960×544, скриншоты и bbox CTA; независимое Sol review завершено без нерешённых существенных findings. PID zero diff. Production ownership передано root.

- [x] L2: Существующий адресный набор тестов подтверждает новые переходы вместе с сохранёнными safety assertions.
  EVIDENCE: Последние адресные Vitest: Eddy51/51, CalibrationProcedures28/28. PID23 и AppScreenContent прошли в первом suite. Первые падения Eddy/Shaper исправлены, адресный повтор зелёный. Общий gate и E2E не запускались.
