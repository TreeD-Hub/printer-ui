# Приёмка AutoPrinter UI

- [x] N1: План, текущий core/UI контракт и спецификация сверены до реализации.
  EVIDENCE: Two read-only Luna discoveries verified actual source and confirmed
  missing queue rows/action receipts. Parent checked core methods/graph coverage;
  DESIGN.md accepted as source-based 960x544 spec. CONTRACT.md fixes exact additive
  local DTO and unchanged backend wire, no fake identity/empty/start/owner data.
- [x] N2: Pure DTO/guards и единый live/mock клиент состояния интегрированы.
  EVIDENCE: Pure parser/start guard 6 tests passed; client HTTP boundary 4 and
  lifecycle controller 4 passed. App and package tsc --noEmit both exit 0.
  Malformed queue and incomplete execution snapshots reject safely;
  legacy/configured:false DTO remains compatible. No live-to-mock fallback.
- [x] N3: Очередь, привязка, статусы и локальные действия доступны в существующем UI.
  EVIDENCE: Panel 3 tests passed (including occupied/unknown/expired/future/
  unqualified bed checks); App 44/44 passed after awaiting initial mock status
  in five existing fixtures. Source/CSS reviewed against DESIGN, no rendered QA.
- [x] N4: Нет обхода допуска, ложного успеха или зависимости локальной остановки от облака.
  EVIDENCE: Command boundary 20 tests passed; reviewer confirmed common file/repeat
  start guard, native pause/cancel independence, receipt identity and no mutation
  auto replay. Core 66 tests OK, 2 Windows symlink skips. E0 cannot confirm empty.
  UI guard supplements core; other clients are not isolated by this UI.
- [x] N5: Адресные проверки, независимое ревью, граф и очистка завершены.
  EVIDENCE: Luna testers completed 75 UI + 6 pure tests and both noEmit projects;
  core 66 tests OK (2 skipped). Sol xhigh reviewed actual diff and final test delta,
  no material unclosed findings. Graphs refreshed (UI 2026-10-18T13:23:06Z,
  core 13:14:00Z); detect_changes inspected against dev baselines, relevant paths
  have no recorded coverage issue. Known unrelated parser gaps and old graph copy
  excluded from conclusions; graph remains best-effort. Both task test-tmp trees
  removed after all agents finished (304178 + 1429151 bytes), absence verified.
  React act warnings remain in App tests. No build/full-suite/browser/e2e,
  hardware, model inference, commit/push/PR/deploy or dependency installation.
