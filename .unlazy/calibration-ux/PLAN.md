# Plan: UX калибровок

Scope: calibration-ux
Depth: tree 2
Mode: orchestrated

## Contract

- Interfaces: существующие аппаратные команды, snapshot и guards сохранены; новый onCalibrationViewChange управляет только UI. Графика удалённых процедур не импортируется экранами.
- Dependencies: исполнители работают в непересекающихся файлах; E2E labels окончательно сверяются после готовности экранов.
- Host launch mode: Codex native subagents; Luna worker. Root интегрирует и проверяет mock, Sol reviewer читает итоговый diff.
- Wave policy: два исполнителя, уже запущенных после явного запроса пользователя на дополнительного агента; не создавать вложенных агентов.
- Toolchain: Windows PowerShell, существующие Node/npm; одна адресная vitest-проверка. Браузер mock 960×544 явно разрешён; full gate/build/E2E/устройство не разрешены.
- Conventions: UTF-8/LF, Nothing Pixel Terminal, существующие токены; никаких новых зависимостей или host/domain изменений.
- Manual review: root проверяет фактический рендер и bbox CTA; независимое ревью guards и реального diff.

## Current contract inventory

Contract revision: 4 (PID целиком без изменений; root правит Shaper, Luna завершает Eddy и адресные тесты).

| ID | Required outcome or constraint | Owner | Observing gate or manual review | Disposition | Revision |
|---|---|---|---|---|---|
| C1 | Удалить extruder/material/service/XY из UI и связанного art | 1.1, 1.2 | GATES:G1, leaf-1.2:L1 | VERIFIED | 4 |
| C2 | Каталог три root-направления и удобная раскладка Eddy | 1.1 | GATES:G1 | VERIFIED | 4 |
| C3 | Понятные шаги, минимум текста, основная CTA справа | 1.1 | GATES:G2 | VERIFIED | 4 |
| C4 | Стабильная геометрия и fullscreen при открытии | 1.1 | GATES:G3 | VERIFIED | 4 |
| C5 | PID без изменений файлов и прежнего поведения открытия | 1.1, root | GATES:G2 | VERIFIED | 4 |
| C6 | Сохранить device guards, ошибки, emergency, реальные подтверждения | 1.1 | GATES:G4, reviewer | VERIFIED | 4 |
| C7 | Обновить относящиеся тесты и независимо проверить интеграцию | 1.1, 1.2, root | GATES:G5 | VERIFIED | 4 |

## Tree

- 1 UX калибровок ........ GATES.md
  - 1.1 Экраны .......... gates/leaf-1.1.md
  - 1.2 Графика и E2E ... gates/leaf-1.2.md

## Leaf dispatch table

| Leaf | Owns | Needs | Tier | Planned wave | State |
|---|---|---|---|---|---|
| 1.1 | src/macros/CalibrationProcedures.tsx, src/macros/CalibrationProcedures.test.tsx, src/macros/calibrationProcedures.css, src/macros/PidCalibrationScreen.tsx, src/macros/PidCalibrationScreen.test.tsx, src/macros/pidCalibration.css, src/macros/EddyCalibrationScreen.tsx, src/macros/EddyCalibrationScreen.test.tsx, src/macros/eddyCalibration.css, src/macros/MacrosContainer.tsx, src/app/AppScreenContent.tsx, src/app/AppScreenContent.test.tsx | - | judgment | 1 | VERIFIED |
| 1.2 | src/macros/CalibrationPreview.tsx, src/macros/CalibrationPreview.test.tsx, src/macros/calibrationPreview.css, src/macros/ProcedureVisuals.tsx, src/macros/ProcedureVisuals.test.tsx, src/macros/procedureVisuals.css, src/macros/EddyCalibrationVisuals.tsx, src/macros/EddyCalibrationVisuals.test.tsx, src/macros/eddyCalibrationVisuals.css, e2e/calibration-workflows.spec.ts | - | mechanical | 1 | VERIFIED |

## Status log

Фактическое время запуска хранится в сообщениях native tools. До второго запуска владение art/E2E было передано сообщением и проверен пустой diff; первый worker подтвердил передачу. Формальные leases добавляются после изменения процесса пользователем, а не выдаются за существовавшие до запуска.

Оба leaf вернули результат; root принял интеграцию и mock-рендер, Sol завершил ревью. Manual gates 9/9 отмечены по фактическим доказательствам; helper не запускал CHECK (reran0), leases освобождены. Непроведённые проверки перечислены в GATES.md.
