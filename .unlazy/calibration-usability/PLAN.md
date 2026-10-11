# Plan: Пригодность экранов калибровки и исправление CI

Scope: calibration-usability
Depth: tree 2
Mode: orchestrated

## Contract

- Interfaces: существующие команды и снимки принтера, PID как образец. Команды оборудования не менять; для спектров добавляется фиксированный read-only GET /server/treed/resonances, full|light, axes x/y с revision и csv.
- Ownership: leaf-eddy — экран и схемы Eddy; leaf-procedures — каталог и остальные процедуры; leaf-catalog — матричные превью; root — CI fixtures, E2E и интеграция. Точные пути в таблице и OWNS.
- Dependencies: независимые листья, затем интеграция и review.
- Host launch mode: Codex native subagents.
- Wave policy: revision5 — две Sol frontend по focus-plan Astra и Sol для адресной передачи спектров; browser основного агента. Часть mock передана новому владельцу после независимой проверки прежних 6 тестов. Native handles записываются отдельно.
- Toolchain: Windows PowerShell, текущие Node/npm; npm run quality:pr; mock http://127.0.0.1:5174/.
- Conventions: Nothing Pixel Terminal, 960x544, touch >=48x56; существующие валидация, blocking, сохранение и отмена.
- Manual review: основной агент проверяет все экраны через браузер; независимый Reviewer проверяет фактический diff.

## Current contract inventory

Contract revision: 6. Пользователь запросил убрать лишние пояснения, выделить целевые значения и действия, показывать реальные спектры и рекомендации X/Y, вращать 3D-карту. Винтов четыре с первого открытия; у каждого этапа есть следующий шаг или завершение. После запуска пайплайна нижняя навигация скрывается до завершения или подтверждённой отмены, калибровка занимает 960x544. Спецификация: visual-plan.md и focus-plan.md. API оборудования и движение не менять, передачу результатов делать адресно.

| ID | Required outcome or constraint | Owner | Observing gate or manual review | Disposition | Revision |
|---|---|---|---|---|---|
| C1 | Eddy: доступные экраны и действия в canvas | leaf-eddy | leaf-eddy:G1, root:R1 | ACTIVE | 1 |
| C2 | Остальные процедуры: доступные параметры, действия, результаты | leaf-procedures | leaf-procedures:G1, root:R1 | ACTIVE | 1 |
| C3 | Каталог и числовой ввод помещаются, кнопки доступны касанием | root | root:R1 | ACTIVE | 1 |
| C4 | Исправлены падения CI, полный gate проходит локально | root | root:R2 | ACTIVE | 1 |
| C5 | Не изменены команды движения и сохранения, auth, существующие device contracts; единственное расширение — адресный read-only экспорт спектров; deploy не выполнен | root | root:R3 | ACTIVE | 5 |
| C6 | Симуляция новых операций позволяет проверить этапы и результаты | leaf-mock | leaf-mock:G1, root:R2 | ACTIVE | 2 |
| C7 | На карточках есть осмысленные графические превью | leaf-catalog | leaf-catalog:G1, root:R1 | ACTIVE | 3 |
| C8 | Eddy вложен в папку; возврат из процедур ведёт в неё | leaf-catalog | leaf-catalog:G2, root:R1 | ACTIVE | 3 |
| C9 | Превью выполнены как инженерные пиктограммы Nothing; полезные схемы внутри всех процедур, без фиктивных измерений | leaf-catalog, leaf-eddy, leaf-procedures | root:R1, root:R3 | ACTIVE | 4 |
| C10 | Карта стола использует фактическую матрицу в 3D, винты — CW/CCW, схема сопла реагирует на подтверждённые координаты | leaf-eddy | leaf-eddy:G1, root:R1 | ACTIVE | 4 |
| C11 | Целевое значение и действие видны сразу; технические пояснения по запросу; у каждого этапа есть следующий шаг или завершение | leaf-eddy, leaf-procedures | root:R1, root:R3 | ACTIVE | 5 |
| C12 | 3D-карта вращается касанием и кнопками; оси и наконечники поворота винтов корректны | leaf-eddy | leaf-eddy:G1, root:R1 | ACTIVE | 5 |
| C13 | ADXL: реальные спектры X/Y и рекомендации каждой оси; недоступные данные явно обозначены | root, leaf-procedures | root:R1, root:R2 | ACTIVE | 5 |
| C14 | В mock с первого открытия четыре винта; после подтверждённого повторного замера «Далее» запускает карту через guards | leaf-mock, leaf-eddy | leaf-mock:G1, leaf-eddy:G2, root:R1 | ACTIVE | 5 |
| C15 | Полный canvas после запуска; результат и переходы сохраняют его; Готово/подтверждённая отмена возвращают навигацию; safety доступен внутри | leaf-mock, leaf-eddy, leaf-procedures | root:R1, root:R2, root:R3 | ACTIVE | 6 |

## Leaves

| ID | Owns | Needs | State |
|---|---|---|---|
| leaf-eddy | src/macros/EddyCalibrationScreen.tsx, src/macros/eddyCalibration.css, src/macros/EddyCalibrationScreen.test.tsx, src/macros/EddyCalibrationVisuals.tsx, src/macros/eddyCalibrationVisuals.css, src/macros/EddyCalibrationVisuals.test.tsx | visual-plan.md | VERIFIED |
| leaf-procedures | src/macros/CalibrationProcedures.tsx, src/macros/CalibrationProcedures.test.tsx, src/macros/calibrationProcedures.css, src/macros/ProcedureVisuals.tsx, src/macros/procedureVisuals.css, src/macros/ProcedureVisuals.test.tsx, src/macros/shaperResonanceCsv.ts | visual-plan.md | VERIFIED |
| leaf-mock | mocks/runtime.ts, tests/calibrationMockRuntime.test.ts, src/core/transport/types.ts, src/core/transport/moonrakerClient.ts, src/core/transport/moonrakerClient.test.ts, src/core/store/usePrinterSnapshot.ts, src/core/store/usePrinterSnapshot.test.tsx, src/core/store/usePrinterSnapshot.fileRace.test.tsx, src/App.tsx, src/macros/MacrosContainer.tsx, src/app/AppScreenContent.tsx, src/app/AppScreenContent.test.tsx, src/macros/PidCalibrationScreen.tsx, src/macros/PidCalibrationScreen.test.tsx | none | VERIFIED |
| leaf-catalog | src/macros/CalibrationPreview.tsx, src/macros/calibrationPreview.css, src/macros/CalibrationPreview.test.tsx | visual-plan.md | VERIFIED |

## Branch

Root: интеграция leaf-eddy и leaf-procedures; состояния OPEN / VERIFIED / ABANDONED.

2026-10-11: Root OPEN, handoff по просьбе пользователя завершить. Все leaf VERIFIED и leases released. R1/R3 приняты; R2 UNMET из-за двух воспроизводимых printSession test failures параллельной задачи. Итоговое резюме дано в текущем чате. Не объявлять полный quality gate зелёным; сначала исправить PrintCompletionModal focus и mock completion/restart, затем повторить quality:pr. Новые production-правки и проверки завершены.
