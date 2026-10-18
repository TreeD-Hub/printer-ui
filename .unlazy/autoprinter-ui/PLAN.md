# AutoPrinter: очередь, статусы и локальное управление

Режим Orchestrated, astra-orchestrator. UI dev,
HEAD 8639ff0b21a422c5fc27fd90dd7f1915a430d652, исходное дерево чистое.
Core dev используется для сверки; минимальное read-only расширение локального
контракта очереди допускается только после решения оркестратора и фиксации DTO.
Без физических запусков, SSH, commit, push, PR, deploy, зависимостей, build,
full suite, browser, e2e или реального ML. Проверки только адресные offline.

| Outcome | Приёмка | Наблюдение |
|---|---|---|
| C1 | Текущий dev-код и локальные core DTO сверены; пробелы плана отмечены | N1 |
| C2 | Общий pure AutoPrinter entrypoint, валидаторы, guards и описания состояний | N2 |
| C3 | Один runtime клиент/store, polling/reconnect/stale, без mock fallback в live | N2 |
| C4 | Очередь, стадия, Moonraker/TreeD/bed отдельно; честный старый/недоступный core | N3 |
| C5 | Pairing code/TTL и локальные действия подтверждаются core; без секретов | N3 |
| C6 | Пауза очереди отдельно от печати; pending/unknown и start guards сохранены | N4 |
| C7 | Nothing/canvas/touch/a11y и действующая доставка пакета сохранены | N3 |
| C8 | Адресные тесты, независимое ревью, граф, очистка и ограничения | N5 |

| Leaf | Owns | Needs | Tier | Wave | State |
|---|---|---|---|---|---|
| 1 | .unlazy/autoprinter-ui/gates/leaf-1.md | - | judgment | discovery | VERIFIED |
| 2 | .unlazy/autoprinter-ui/gates/leaf-2.md | - | judgment | discovery | VERIFIED |
| 3 | .unlazy/autoprinter-ui/DESIGN.md | - | judgment | discovery | VERIFIED |
| 4 | .unlazy/autoprinter-ui/gates/leaf-4.md | 1,2 | judgment | implementation | VERIFIED |
| 5 | packages/printer-logic/src/autoprinter.ts, packages/printer-logic/test/autoprinter.test.ts, packages/printer-logic/package.json, packages/printer-logic/README.md, src/core/autoprinter/**, src/core/store/useAutoPrinter.ts, src/core/store/useAutoPrinter.test.tsx, src/runtime/live.ts, mocks/runtime.ts, mocks/autoprinter.ts, vite.config.ts, vitest.config.ts, tsconfig.app.json | 1,2 | judgment | implementation | VERIFIED |
| 6 | src/autoprinter/**, src/App.tsx, src/App.test.tsx, src/settings/config.ts, src/settings/SettingsPage.tsx, src/settings/SettingsContainer.tsx, src/core/commands/usePrinterCommands.ts, src/core/commands/usePrinterCommands.test.tsx, src/README.md, docs/autoprinter.md | 1,2,3,CONTRACT.md fixed interfaces | judgment | implementation | VERIFIED |

Leaf 1 исследует UI/runtime/guards и доступные адресные проверки (read-only).
Leaf 2 сверяет текущий core/API и предлагает минимальный DTO очереди (read-only).
Leaf 3 задаёт реализуемую спецификацию экрана в существующем дизайне.
Реализация получает точное владение после принятия discovery и общего контракта.
Родитель владеет PLAN, CONTRACT, GATES и всеми gate-ledger файлами.

Leaf4 — cross-repo worker. UI ledger только фиксирует интеграционный результат;
авторитетное владение исходниками core находится в отдельном scope
G:/GitHub/printer-core/.unlazy/autoprinter-ui-api/GATES.md и claim там же.
Это координация владения, а не изоляция файловой системы.
