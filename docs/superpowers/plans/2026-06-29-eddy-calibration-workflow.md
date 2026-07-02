# Eddy Calibration Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a device-backed Eddy calibration workflow in `treed-shell` whose progress survives Klipper restarts through `treed-mainshellOS` state.

**Architecture:** `treed-mainshellOS` owns persistent calibration progress and public Eddy workflow macros. `treed-shell` reads that state through Moonraker objects, gates buttons through `@treed/printer-logic`, and renders one focused `Macros -> Eddy` screen without reviving the old temporary macros UI.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Klipper gcode macros, Moonraker printer objects, PowerShell contract tests.

---

## File map

- `C:\Users\TreeD\Documents\GitHub\treed-mainshellOS\klipper\profiles\treed_v2_corexy_v1\probe_eddy_duo.cfg` - persistent `save_variables` state and public Eddy workflow macros.
- `C:\Users\TreeD\Documents\GitHub\treed-mainshellOS\klipper\profiles\treed_v2_corexy_v1\macros_ui_contract.cfg` - required macro list extension.
- `C:\Users\TreeD\Documents\GitHub\treed-mainshellOS\tools\tests\test_klipper_ui_contracts.ps1` - static contract coverage for new macros.
- `C:\Users\TreeD\Documents\GitHub\treed-shell\packages\printer-logic\src\index.ts` - command ids, catalog, block reasons, argument validation.
- `C:\Users\TreeD\Documents\GitHub\treed-shell\packages\printer-logic\test\catalog.test.ts` and `C:\Users\TreeD\Documents\GitHub\treed-shell\src\core\commands\catalog.test.ts` - command contract regression tests.
- `C:\Users\TreeD\Documents\GitHub\treed-shell\src\core\commands\moonrakerCommandClient.ts` and `.test.ts` - explicit Moonraker script mapping.
- `C:\Users\TreeD\Documents\GitHub\treed-shell\src\core\transport\moonrakerRuntimeObjects.ts`, `moonrakerNormalizer.ts`, `types.ts`, and tests - `save_variables` state ingestion.
- `C:\Users\TreeD\Documents\GitHub\treed-shell\src\macros\*` - new Eddy workflow screen.
- `C:\Users\TreeD\Documents\GitHub\treed-shell\src\app\AppScreenContent.tsx`, `src\App.tsx`, `src\App.css`, `src\App.test.tsx` - wire the screen into the existing shell composition.

### Task 1: Device-side Eddy progress contract

- [ ] **Step 1: Write failing PowerShell contract assertions**

Add checks that `probe_eddy_duo.cfg` exposes `save_variables`, `_TREED_EDDY_CALIBRATION_STATE`, and public workflow macros:

```powershell
foreach ($macro in @(
  "_TREED_EDDY_CALIBRATION_STATE",
  "TREED_EDDY_CALIBRATE_DRIVE_CURRENT",
  "TREED_EDDY_PRIMARY_HEIGHT_START",
  "TREED_EDDY_PRIMARY_ACCEPT_SAVE",
  "TREED_EDDY_TEMPERATURE_START",
  "TREED_EDDY_TEMPERATURE_ACCEPT_SAVE",
  "TREED_EDDY_CHECK_Z0",
  "TREED_EDDY_SCREWS_TILT_START",
  "TREED_EDDY_SCREWS_TILT_DONE",
  "TREED_EDDY_BED_MESH_CALIBRATE"
)) {
  Assert-Contains $probeEddy "(?m)^\[gcode_macro $([regex]::Escape($macro))\]\s*$" "Eddy workflow macro must exist: $macro"
}
Assert-Contains $probeEddy '(?m)^\[save_variables\]\s*$' "Eddy workflow progress must use save_variables"
```

- [ ] **Step 2: Run RED**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\TreeD\Documents\GitHub\treed-mainshellOS\tools\tests\test_klipper_ui_contracts.ps1`

Expected: FAIL because the Eddy workflow macros do not exist yet.

- [ ] **Step 3: Add minimal profile macros**

Add wrappers that call the existing calibrated commands, persist progress via `SAVE_VARIABLE`, and leave interactive steps waiting for explicit UI actions.

- [ ] **Step 4: Run GREEN**

Run the same PowerShell contract test and expect `PASS: Klipper UI device contract`.

### Task 2: Shell command contract

- [ ] **Step 1: Write failing command tests**

Add tests for command catalog and Moonraker script mapping:

```ts
await client.execute({ command: 'eddyDriveCurrentCalibrate' })
await client.execute({ command: 'eddyTestZ', deltaMm: -0.05 })
await client.execute({ command: 'eddyBedMeshCalibrate' })
```

Expected scripts:

```text
TREED_EDDY_CALIBRATE_DRIVE_CURRENT
TESTZ Z=-0.05
TREED_EDDY_BED_MESH_CALIBRATE
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run packages/printer-logic/test/catalog.test.ts src/core/commands/catalog.test.ts src/core/commands/moonrakerCommandClient.test.ts --pool=forks`

Expected: FAIL because command ids are not defined.

- [ ] **Step 3: Add minimal command ids and script mapping**

Extend `PrinterCommandId`, `ExecuteCommandArgs`, command catalog, block sets, argument validation for `eddyTestZ`, and Moonraker script switch cases.

- [ ] **Step 4: Run GREEN**

Run the same Vitest command and expect all selected tests to pass.

### Task 3: Runtime state ingestion

- [ ] **Step 1: Write failing normalizer tests**

Add a `save_variables` payload with `treed_eddy_primary_done`, `treed_eddy_active_step`, and `treed_eddy_operator_prompt`; assert `snapshot.v2.eddy.calibration` exposes the normalized values.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/core/transport/moonrakerClient.test.ts src/core/transport/moonrakerNormalizer.test.ts --pool=forks`

Expected: FAIL because `save_variables` is not queried or normalized.

- [ ] **Step 3: Add minimal normalizer support**

Query `save_variables`, define `PrinterEddyCalibrationSnapshot`, normalize booleans/strings, and fall back to empty progress when the object is absent.

- [ ] **Step 4: Run GREEN**

Run the same Vitest command and expect all selected tests to pass.

### Task 4: Macros Eddy screen

- [ ] **Step 1: Write failing UI test**

Replace the old empty macros assertion with expectations for the Eddy workflow screen:

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Макросы' }))
expect(screen.getByTestId('screen-macros')).toBeInTheDocument()
expect(screen.getByRole('heading', { name: 'Калибровка Eddy' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Первичная калибровка Eddy' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Автосохранение Z-offset' })).toBeInTheDocument()
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/App.test.tsx --pool=forks`

Expected: FAIL because `Макросы` is still empty.

- [ ] **Step 3: Add minimal screen and wiring**

Create `src/macros/MacrosContainer.tsx`, `src/macros/EddyCalibrationScreen.tsx`, and `src/macros/index.ts`; pass snapshot, pending command, block reason getter, and command handlers from `App.tsx`.

- [ ] **Step 4: Run GREEN**

Run the same App test and expect it to pass.

### Task 5: Targeted verification

- [ ] Run `powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\TreeD\Documents\GitHub\treed-mainshellOS\tools\tests\test_klipper_ui_contracts.ps1`.
- [ ] Run `npx vitest run packages/printer-logic/test/catalog.test.ts src/core/commands/catalog.test.ts src/core/commands/moonrakerCommandClient.test.ts src/core/transport/moonrakerClient.test.ts src/core/transport/moonrakerNormalizer.test.ts src/App.test.tsx --pool=forks`.
- [ ] Run `git diff --check` in both repositories.
