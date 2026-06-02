# `mocks`

Локальные mock-сценарии данных для режима `vite --mode mock`.

Назначение:
- быстрая UI-разработка без зависимости от Moonraker/PI;
- воспроизводимые сценарии состояния принтера.

Runtime adapter:
- `runtime.ts` — mock transport + mock command client. Live-сборка его не импортирует.
