# Start Print File Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the print start flow: file list, file details, start command handoff, blocked states, and post-start dashboard behavior.

**Architecture:** Keep `treed-shell` as the UI client. Moonraker remains the source of printer state, `@treed/printer-logic` remains the source of command availability, and `treed-mainshellOS` remains the source of Klipper macro/runtime contracts. Do not extend the current `Макросы` screen in this work.

**Tech Stack:** React 19, TypeScript, Vite, Tauri 2, Vitest, Moonraker HTTP/WebSocket, local `mock|live` runtime alias.

---

## Confirmed Context

- `treed-shell` currently starts a selected file through `executeCommand({ command: 'start', filename })` in `src/App.tsx`.
- `src/core/commands/moonrakerCommandClient.ts` maps `start` to Moonraker endpoint `/printer/print/start?filename=...`.
- `treed-mainshellOS` Klipper profile uses `START_PRINT` as the public slicer G-code entry point in `klipper/profiles/treed_v2_corexy_v1/macros_print_flow.cfg`.
- `START_PRINT` requires `BED_TEMP > 0` and `EXTRUDER_TEMP > 0`, and supports `MESH=load|adaptive|calibrate|none`, `MESH_METHOD=rapid_scan|scan|automatic|manual`, `SHAPER=none|light|full`.
- `treed-mainshellOS` Moonraker config has `enable_object_processing: True`, required for KAMP/object metadata.
- This plan assumes UI does not synthesize `START_PRINT` parameters. The selected G-code file must already contain the proper slicer start G-code unless a later contract explicitly adds UI-side start presets.

## File Structure

- Modify `src/core/transport/types.ts`
  - Make print file snapshots distinguish Moonraker start path from display name.
- Modify `src/core/transport/moonrakerNormalizer.ts`
  - Normalize live files into stable `path`, `name`, `directory`, metadata fields.
- Modify `src/printFiles.ts`
  - Align mock file items with the live file model.
- Modify `src/ui/printFileCard.tsx`
  - Render display name and optional directory without changing card responsibility.
- Modify `src/App.tsx`
  - Keep routing/composition in place, but fix file selection/start state and modal error display.
- Modify `src/core/commands/moonrakerCommandClient.test.ts`
  - Cover nested-path start command URL encoding.
- Modify `src/core/transport/moonrakerNormalizer.test.ts`
  - Cover nested file path normalization.
- Modify `src/App.test.tsx`
  - Cover file selection, disabled start reason, failed start staying in modal, successful start handoff.

No changes:
- Do not change `src-tauri/**`.
- Do not change current `Макросы` behavior.
- Do not edit `treed-mainshellOS` in this task.
- Do not change `START_PRINT` macros or Moonraker endpoints without a separate integration task.

---

### Task 1: Contract Check Before Code

**Files:**
- Read-only: `C:/Users/Yawllen/Documents/GitHub/treed-mainshellOS/README.md`
- Read-only: `C:/Users/Yawllen/Documents/GitHub/treed-mainshellOS/klipper/profiles/treed_v2_corexy_v1/macros_print_flow.cfg`
- Read-only: `C:/Users/Yawllen/Documents/GitHub/treed-mainshellOS/moonraker/base/00-core.conf`
- Read-only: `C:/Users/Yawllen/Documents/GitHub/treed-shell/src/core/commands/moonrakerCommandClient.ts`

- [ ] **Step 1: Confirm print start macro contract**

Run:

```powershell
git grep -n "START_PRINT\|enable_object_processing\|print/start" -- README.md klipper/profiles/treed_v2_corexy_v1 moonraker src
```

Expected facts:
- `START_PRINT` is the slicer G-code entry point in `treed-mainshellOS`.
- UI starts an already uploaded G-code file through Moonraker `/printer/print/start`.
- Moonraker object processing is enabled in `treed-mainshellOS`.

- [ ] **Step 2: Stop if contract changed**

If `treed-mainshellOS` no longer uses `START_PRINT` or Moonraker `/printer/print/start`, stop implementation and revise this plan first.

---

### Task 2: Normalize Print File Identity

**Files:**
- Modify: `src/core/transport/types.ts`
- Modify: `src/core/transport/moonrakerNormalizer.ts`
- Modify: `src/printFiles.ts`
- Test: `src/core/transport/moonrakerNormalizer.test.ts`

- [ ] **Step 1: Update file item type**

Change `PrinterFileItemSnapshot` and `PrintFileItem` so each item has:

```ts
id: string
path: string
name: string
directory: string | null
printTime: string
weight: string
material: string
addedAt: string
```

Meaning:
- `path` is the Moonraker start filename relative to `gcodes`, for example `jobs/benchy.gcode`.
- `name` is display basename, for example `benchy.gcode`.
- `directory` is display folder, for example `jobs`, or `null` for root files.

- [ ] **Step 2: Update live normalization**

In `normalizeMoonrakerPrintFiles`, keep `id` based on full path, set `path` to full relative path, set `name` to basename, set `directory` to parent path.

Example expected normalized item:

```ts
{
  id: 'file-jobs-benchy-gcode',
  path: 'jobs/benchy.gcode',
  name: 'benchy.gcode',
  directory: 'jobs',
  printTime: '1 ч 02 мин',
  weight: '8 г',
  material: 'PETG-CF',
  addedAt: '2024-03-09T16:00:00.000Z',
}
```

- [ ] **Step 3: Update mock file data**

For every item in `src/printFiles.ts`, set `path` equal to the existing root filename and `directory` to `null`.

- [ ] **Step 4: Update normalizer test**

Adjust `normalizes Moonraker file list and metadata into V2 print cards` to expect `path`, basename `name`, and `directory`.

Allowed check if user approves tests:

```powershell
npm test -- src/core/transport/moonrakerNormalizer.test.ts
```

Expected: test file passes.

---

### Task 3: Fix File Cards And Modal Copy

**Files:**
- Modify: `src/ui/printFileCard.tsx`
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Show file basename in cards**

Pass `item.name` to `PrintFileCard`, not the Moonraker path. Add optional `directory` prop only if needed for visible folder context.

Expected card behavior:
- Root file: `bearing_bracket_mk2.gcode`
- Nested file: `benchy.gcode`, with folder hint `jobs` if space allows.

- [ ] **Step 2: Show path in file modal**

In the file modal, keep the main title as `selectedPrintFile.name`. Add a small metadata row for `Путь` when `directory !== null`, showing `selectedPrintFile.path`.

- [ ] **Step 3: Keep touch constraints**

File card and modal actions must keep touch targets at least `48x48px` and fit in `960x544` without horizontal scroll.

Allowed check if user approves tests:

```powershell
npm test -- src/App.test.tsx
```

Expected: existing file modal test passes after text expectation updates.

---

### Task 4: Start The Correct Moonraker Path

**Files:**
- Modify: `src/App.tsx`
- Test: `src/core/commands/moonrakerCommandClient.test.ts`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Use `selectedPrintFile.path` for start**

Change `handleStartSelectedFile` to call:

```ts
await executeCommand({
  command: 'start',
  filename: selectedPrintFile.path,
})
```

Do not use display `name` for live start.

- [ ] **Step 2: Keep optimistic state mock-only**

After successful start:
- for `snapshot.source === 'mock'`, keep local `activePrintFileName` and `activePrintUiState` updates;
- for `snapshot.source === 'live'`, rely on `refresh()` and live `snapshot.printJob`.

This prevents live UI from pretending a print is active if Moonraker accepted the request but the refreshed state did not yet confirm it.

- [ ] **Step 3: Add command client test for nested path**

In `moonrakerCommandClient.test.ts`, add a test that:
- creates client with `moonrakerUrl: 'http://moonraker.local'`;
- executes `{ command: 'start', filename: 'jobs/benchy v2.gcode' }`;
- expects fetch URL:

```text
http://moonraker.local/printer/print/start?filename=jobs%2Fbenchy%20v2.gcode
```

Allowed check if user approves tests:

```powershell
npm test -- src/core/commands/moonrakerCommandClient.test.ts
```

Expected: nested path is URL-encoded once and sent to `/printer/print/start`.

---

### Task 5: Make Blocked And Failed Start Visible

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Show disabled start reason**

When `printStartBlockReason !== null`, keep the start button disabled and show the reason inside the file modal.

Expected examples:
- active print: `Старт печати: уже есть активная печать.`
- offline: connection/capability block reason from command catalog.

- [ ] **Step 2: Keep modal open on failed start**

If `executeCommand` returns `false`, do not close the modal, do not navigate to dashboard, and show `commandError` or `printStartBlockReason` in the modal.

- [ ] **Step 3: Clear stale file notice on selection**

When selecting another file, clear the file modal notice so an old command error does not attach to a new file.

Implementation should prefer local state scoped to the file modal, for example `fileModalNotice`, rather than reusing global notifications.

- [ ] **Step 4: Add App tests**

Add or update tests to cover:
- start button disabled with active print;
- failed start keeps modal open and shows reason;
- successful mock start closes modal and shows active dashboard.

Allowed check if user approves tests:

```powershell
npm test -- src/App.test.tsx
```

Expected: file modal and start-flow tests pass.

---

### Task 6: Preserve Live File Refresh Semantics

**Files:**
- Modify: `src/core/store/usePrinterSnapshot.ts`
- Test: `src/core/store/usePrinterSnapshot.test.ts` if a store test already exists; otherwise cover through `src/App.test.tsx`.

- [ ] **Step 1: Keep previous live file list during WS updates**

Confirm current behavior keeps `previous.printFiles` when WS snapshots do not include file metadata. Do not regress this behavior.

- [ ] **Step 2: Avoid empty-list flicker after start**

After `handleStartSelectedFile` calls `refresh()`, file cards should not become empty just because a status-only update arrived without `/server/files/list` metadata.

Allowed check if user approves tests:

```powershell
npm test -- src/App.test.tsx
```

Expected: file list remains stable in existing navigation tests.

---

### Task 7: Acceptance Checklist

**Files:**
- No new production files expected.
- Tests touched in prior tasks.

- [ ] **Step 1: Manual scenario checklist**

Manual checks to run only when user asks for UI verification:
- open `Файлы`;
- sort by name and by added date;
- open root file modal;
- open nested file modal if live data contains folders;
- verify disabled start reason during active print;
- start a mock file and confirm dashboard active print state;
- in live mode, confirm Moonraker receives `/printer/print/start?filename=<relative path>`.

- [ ] **Step 2: `960x544` visual checklist**

Check only if user asks for visual verification:
- file grid has no horizontal scroll;
- modal actions fit and remain touchable;
- long nested paths do not overlap buttons;
- disabled reason text wraps cleanly.

- [ ] **Step 3: Explicit non-goals**

Confirm final diff does not include:
- `src-tauri/**`;
- `treed-mainshellOS/**`;
- current `Макросы` flow changes;
- changes to `START_PRINT` macro semantics;
- UI-side `MESH` or `SHAPER` presets.

---

## Recommended Execution Order

1. Task 1: contract check.
2. Task 2: file identity model.
3. Task 4: correct start path.
4. Task 5: visible blocked/failed states.
5. Task 3: card/modal copy polish.
6. Task 6: live refresh guard.
7. Task 7: acceptance checklist.

## Self-Review

- Spec coverage: covers file selection, file identity, Moonraker start, blocked start, failed command feedback, post-start state, and `treed-mainshellOS` contract.
- Placeholder scan: no unresolved placeholder steps are required before execution.
- Type consistency: `path` means Moonraker relative file path; `name` means display basename; `directory` means optional parent folder.
- Scope check: settings and macros are intentionally outside this plan.
