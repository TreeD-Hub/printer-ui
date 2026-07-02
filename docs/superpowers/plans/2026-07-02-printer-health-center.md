# Printer Health Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Объединить runtime и системную диагностику в одну приоритетную неисправность на idle-главной.

**Architecture:** Существующие `PrinterSnapshot` и `MoonrakerSystemStatus` передаются в чистый resolver. Он возвращает `PrinterHealthSnapshot | null`; `App` только исполняет выбранное действие и переключает экран.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library.

---

### Task 1: Зафиксировать health-policy тестами

**Files:**
- Create: `src/dashboard/dashboardDiagnosticState.test.ts`
- Modify: `src/dashboard/dashboardDiagnosticState.ts`

- [ ] Добавить минимальные входные фабрики runtime/system status.
- [ ] Добавить failing-тесты: fatal transport выше system warning; failed Moonraker component дает error/restart; crowsnest и CAN дают warning/openSystem; partial request дает warning/openSystem.
- [ ] Запустить `npm run test:ui -- src/dashboard/dashboardDiagnosticState.test.ts` и подтвердить ожидаемый RED из-за отсутствующего system-status input/новых результатов.
- [ ] Расширить resolver минимальными ранними возвратами в порядке приоритета и добавить `PrinterHealthSnapshot`/`fatal`/`openSystem`.
- [ ] Повторить команду и получить PASS.

### Task 2: Подключить действия в App

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx`

- [ ] Расширить существующий mock `useMoonrakerSystemStatus`, сохранив текущие пользовательские изменения файла.
- [ ] Добавить failing-тест перехода warning CTA в экран «Система» и тест refresh обоих источников.
- [ ] Запустить адресные App-тесты и подтвердить RED.
- [ ] Передать `systemStatusController.status` в resolver; для refresh вызвать оба контроллера; для `openSystem` выбрать группу `system` и экран `settings`.
- [ ] Повторить адресные App-тесты и получить PASS.

### Task 3: Отобразить fatal-состояние

**Files:**
- Modify: `src/dashboard/DashboardDiagnosticView.tsx`
- Modify: `src/dashboard/dashboardDiagnostic.css`

- [ ] Добавить failing-проверку `aria-live="assertive"` для fatal-снимка в resolver/App тесте.
- [ ] Использовать assertive для `fatal` и `error`; fatal визуально использует существующий error-токен.
- [ ] Запустить адресные тесты и получить PASS.

### Task 4: Проверить полный затронутый контур

**Files:**
- Verify only.

- [ ] Запустить `npm run test:ui -- src/dashboard/dashboardDiagnosticState.test.ts src/App.test.tsx src/settings/systemStatus.test.ts`.
- [ ] Запустить `npm run typecheck:ui`.
- [ ] Проверить `git diff --check` и адресный diff измененных файлов.

Git commit не входит в план: пользователь отдельно не запрашивал Git-операции.
