# Pure contract and runtime

OWNS: packages/printer-logic/src/autoprinter.ts, packages/printer-logic/test/autoprinter.test.ts, packages/printer-logic/package.json, packages/printer-logic/README.md, src/core/autoprinter/**, src/core/store/useAutoPrinter.ts, src/core/store/useAutoPrinter.test.tsx, src/runtime/live.ts, mocks/runtime.ts, mocks/autoprinter.ts, vite.config.ts, vitest.config.ts, tsconfig.app.json

- [x] G1: Validated pure DTO and one lifecycle-safe live/mock controller preserve command uncertainty and compatibility.
  EVIDENCE: Pure 6, client 4 and controller 4 tests passed; both noEmit projects
  exit 0. Reviewer verified parser/schema fixes, single polling, cancelled stale
  reads, explicit unsupported handling and no automatic action replay.
