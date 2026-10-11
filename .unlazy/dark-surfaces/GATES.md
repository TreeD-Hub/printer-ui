# Gates: однотонные тёмные поверхности

OWNS: src/styles/foundation.css, src/App.css, src/index.css, src/control/maintenance.css, src/control/maintenanceCycle.css, src/control/filamentSensor.css, src/control/panels/DriverModeControlPanel.css, src/dashboard/dashboardDiagnostic.css, src/macros/calibrationProcedures.css, src/macros/eddyCalibration.css, src/settings/systemSettings.css, docs/00_FOUNDATION.md

Scope: общая палитра и фоны существующего интерфейса printer-ui. Без изменений логики управления и геометрии экранов.

- [x] G1: В используемых CSS декоративные градиенты и светлые заливки панелей, карточек, кнопок, клавиатур и навигации заменены однотонными тёмными поверхностями.
  EVIDENCE: src/App.css, src/control/maintenance.css, src/control/maintenanceCycle.css, src/settings/systemSettings.css: просмотрены все изменённые декларации относительно 2c421e9. Остаточный поиск gradient в src возвращает только иконки, разметку графиков, секторные шкалы и grip. Основные кнопки src/macros/calibrationProcedures.css:65, src/macros/eddyCalibration.css:120 используют общую серую заливку.
- [x] G2: Поверхности используют общую небольшую серую палитру; правило закреплено в Foundation.
  EVIDENCE: src/styles/foundation.css:19–25 и :79–84 задают #101010 / #161616 / #1c1c1c / #282828; docs/00_FOUNDATION.md:57 закрепляет однотонные поверхности и роли сигналов.
- [x] G3: По исходникам проверены контраст текста изменённых кнопок и различимость активных состояний; сохранены сигнальные цвета, функциональные шкалы, графика и QR-фон.
  EVIDENCE: Текст основных кнопок калибровок, обслуживания и подтверждения датчика филамента теперь --color-text-primary на --color-control-active-surface. dashboardDiagnostic.css использует --color-primary-light для подготовленного опасного действия. Активные заливки #282828, красные контуры/маркеры, focus-visible и disabled в src/styles/ui-kit.css сохранены. QR-фон src/App.css:339 и секторные шкалы сохранены. Визуальная оценка рендера не выполнялась.
- [x] G4: Итоговый diff ограничен стилями и их документацией; непроведённые проверки указаны в отчёте.
  EVIDENCE: git diff относительно исходного 2c421e9 охватывает 11 CSS и docs/00_FOUNDATION.md; git diff --check 2c421e9 -- src docs/00_FOUNDATION.md завершился с кодом 0. Граф detect_changes не дал impacted_symbols и показал изменения за более широкий период, поэтому состав проверен по Git. Gate-lint: LINT OK, предупреждения о ручных критериях приняты для CSS-прохода; сборка, тесты и браузер не запускались. Во время работы появился внешний commit e900f13 с частью этой правки; итог сравнивался с исходной базой.
