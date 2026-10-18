# UI and start guards

OWNS: src/autoprinter/**, src/App.tsx, src/App.test.tsx, src/settings/config.ts, src/settings/SettingsPage.tsx, src/settings/SettingsContainer.tsx, src/core/commands/usePrinterCommands.ts, src/core/commands/usePrinterCommands.test.tsx, src/README.md, docs/autoprinter.md

- [x] G1: Existing shell shows truthful AutoPrinter queue/status/actions with guarded manual start and native stop preserved.
  EVIDENCE: Panel 3, commands 20 and App 44 tests passed. Existing assertions
  preserved; five App fixtures await initial GET before user actions. Reviewer
  confirmed qualified capability alone never means empty and native pause/cancel
  remain independent. Geometry source-reviewed only; React act warnings remain.
