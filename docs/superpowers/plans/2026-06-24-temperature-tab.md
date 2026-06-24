# Temperature Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переработать вкладку температур под `960x544`, добавить реальный 5-минутный current/target график и сохранить подтверждаемое Moonraker-поведение всех команд.

**Architecture:** Существующий `useHeatingFanController` остается единственным UI-controller для thermal snapshot и команд. Он хранит ограниченную историю `{timestamp, current, target}`, `TemperatureTrendChart` только вычисляет шкалы и рисует переданные серии, а `HeatingControlPanel` отвечает за touch-композицию и видимость сопла/стола. Новые зависимости и параллельный transport не добавляются.

**Tech Stack:** React 19, TypeScript, SVG, CSS, Vitest, Testing Library, существующий Moonraker command/store контур.

---

## File map

- `src/control/types.ts` — единый тип chart point/series и profile max для строки нагрева.
- `src/heating/useHeatingFanController.tsx` — 5-минутная история, keyboard clear-all и прокидывание profile limits.
- `src/heating/useHeatingFanController.test.tsx` — controller/data/command regression tests.
- `src/ui/printTuneWidgets.tsx` — timestamp-based SVG, target series и доступные line hooks.
- `src/ui/printTuneWidgets.test.tsx` — шкала, target и реальные time labels.
- `src/control/panels/HeatingControlPanel.tsx` — легенда и touch-переключатели серий.
- `src/printTune/PrintTuneModal.tsx` — совместимый chart type и profile max в print-tune stepper.
- `src/App.test.tsx` — keyboard clear/backspace и end-to-end mock command assertions.
- `src/App.css` — surface tokens, touch sizes, legend и устранение визуальных полос.

### Task 1: Реальная 5-минутная thermal history

**Files:**
- Modify: `src/control/types.ts`
- Modify: `src/heating/useHeatingFanController.tsx`
- Test: `src/heating/useHeatingFanController.test.tsx`

- [ ] **Step 1: Write the failing history tests**

Добавить fake timers и rerender-сценарии, которые требуют timestamp/current/target, target-only точки и удаление данных старше пяти минут:

```tsx
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-06-24T12:00:00Z'))
const { rerender } = render(<TestHarness executeCommand={executeCommand} />)

vi.setSystemTime(new Date('2026-06-24T12:01:00Z'))
rerender(<TestHarness executeCommand={executeCommand} snapshot={{
  ...DEFAULT_SNAPSHOT,
  thermalTargets: { nozzle: 230, bed: 60 },
}} />)

expect(readSeries('nozzle').points.at(-1)).toMatchObject({ current: 201, target: 230 })

vi.setSystemTime(new Date('2026-06-24T12:06:01Z'))
rerender(<TestHarness executeCommand={executeCommand} snapshot={{
  ...DEFAULT_SNAPSHOT,
  extruderTemp: 202,
}} />)
expect(readSeries('nozzle').points).toHaveLength(1)
```

- [ ] **Step 2: Run the controller test and verify RED**

Run: `npm run test:ui -- src/heating/useHeatingFanController.test.tsx`

Expected: FAIL because series still expose `values` and do not retain target/timestamp history.

- [ ] **Step 3: Add the minimal chart data types**

Replace scalar arrays with points and add the row limit:

```ts
export type TemperatureChartPoint = {
  timestamp: number
  current: number
  target: number
}

export type TemperatureChartSeries = {
  id: 'nozzle' | 'bed'
  label: string
  tone: 'orange' | 'green'
  points: TemperatureChartPoint[]
}

export type HeatingControlRow = {
  // existing fields
  maxTarget: number
}
```

- [ ] **Step 4: Implement bounded time-based history**

Use one combined point so nozzle/bed remain synchronized:

```ts
type TemperatureHistoryPoint = {
  timestamp: number
  nozzle: number
  nozzleTarget: number
  bed: number
  bedTarget: number
}

const TEMPERATURE_HISTORY_WINDOW_MS = 5 * 60 * 1000
const MAX_TEMPERATURE_HISTORY_POINTS = 300

setTemperatureHistory((history) => {
  const cutoff = nextPoint.timestamp - TEMPERATURE_HISTORY_WINDOW_MS
  const visible = history.filter((point) => point.timestamp >= cutoff)
  const last = visible.at(-1)
  if (last && hasSameThermalValues(last, nextPoint)) return visible
  return [...visible, nextPoint].slice(-MAX_TEMPERATURE_HISTORY_POINTS)
})
```

Build nozzle/bed series from these points, including `snapshot.thermalTargets`, and set `maxTarget` from `snapshot.limits.nozzleMaxC` / `bedMaxC`.

- [ ] **Step 5: Run the controller test and verify GREEN**

Run: `npm run test:ui -- src/heating/useHeatingFanController.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the history slice**

```powershell
git add -- src/control/types.ts src/heating/useHeatingFanController.tsx src/heating/useHeatingFanController.test.tsx
git commit -m "Добавлена история температур за пять минут"
```

### Task 2: Динамический SVG current/target график

**Files:**
- Modify: `src/ui/printTuneWidgets.tsx`
- Create: `src/ui/printTuneWidgets.test.tsx`
- Modify: `src/printTune/PrintTuneModal.tsx`

- [ ] **Step 1: Write failing chart tests**

Render two series with fixed timestamps and assert that the chart includes confirmed target values, real clock labels, and no target polyline for an all-zero target:

```tsx
render(<TemperatureTrendChart series={[{
  id: 'nozzle',
  label: 'Сопло',
  tone: 'orange',
  points: [
    { timestamp: Date.parse('2026-06-24T12:00:00Z'), current: 25, target: 0 },
    { timestamp: Date.parse('2026-06-24T12:01:00Z'), current: 40, target: 220 },
  ],
}]} testId="chart" />)

expect(screen.getByTestId('chart-target-nozzle')).toHaveAttribute('points', expect.any(String))
expect(screen.getByTestId('chart')).toHaveTextContent(/12:00|15:00/)
```

Use a second render with targets `[0, 0]` and expect `queryByTestId('chart-target-nozzle')` to be null.

- [ ] **Step 2: Run the widget test and verify RED**

Run: `npm run test:ui -- src/ui/printTuneWidgets.test.tsx`

Expected: FAIL because the widget accepts `values`, synthesizes time labels, and renders no target line.

- [ ] **Step 3: Implement timestamp-based geometry**

Change geometry helpers to resolve X from the visible timestamp extent and Y from current plus non-zero target values:

```ts
function resolveX(timestamp: number, minTime: number, maxTime: number): number {
  const ratio = (timestamp - minTime) / Math.max(1, maxTime - minTime)
  return CHART_PADDING.left + (ratio * plotWidth)
}

const scaleValues = normalizedSeries.flatMap(({ points }) => points.flatMap((point) => (
  point.target > 0 ? [point.current, point.target] : [point.current]
)))
```

Render current area/line, dashed target polyline when any visible point has `target > 0`, a last-value marker, and time ticks derived from point timestamps. Keep a safe default `0..100` when there is no data.

- [ ] **Step 4: Keep PrintTuneModal structurally compatible**

Update its local chart type to `points` and use a per-row `maxTarget` supplied through `PrintTuneTemperatureProps`:

```ts
type PrintTuneTemperatureProps = {
  // existing fields
  nozzleMaxC: number
  bedMaxC: number
}
```

Use `max={row.maxTarget}` instead of `max={300}`.

- [ ] **Step 5: Run widget and controller tests**

Run: `npm run test:ui -- src/ui/printTuneWidgets.test.tsx src/heating/useHeatingFanController.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the SVG slice**

```powershell
git add -- src/ui/printTuneWidgets.tsx src/ui/printTuneWidgets.test.tsx src/printTune/PrintTuneModal.tsx src/heating/useHeatingFanController.tsx
git commit -m "Переработан график температур"
```

### Task 3: Touch legend, profile limits and keyboard semantics

**Files:**
- Modify: `src/control/panels/HeatingControlPanel.tsx`
- Modify: `src/heating/useHeatingFanController.tsx`
- Modify: `src/heating/useHeatingFanController.test.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing keyboard and command tests**

Expose a clear action in the test harness and require distinct semantics:

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Очистить температуру' }))
expect(screen.getByTestId('keyboard-value')).toHaveTextContent('')

fireEvent.click(screen.getByRole('button', { name: 'Удалить последний символ' }))
expect(screen.getByTestId('keyboard-value')).toHaveTextContent('24')
```

Add controller assertions that nozzle `maxTarget` equals `limits.nozzleMaxC`, bed `maxTarget` equals `limits.bedMaxC`, and the existing stepper/submit/preset/cooldown paths call their command IDs without updating snapshot-backed targets.

- [ ] **Step 2: Run controller and App tests and verify RED**

Run: `npm run test:ui -- src/heating/useHeatingFanController.test.tsx src/App.test.tsx`

Expected: FAIL because clear-all and the new accessible backspace action do not exist.

- [ ] **Step 3: Implement clear/backspace keys**

Add and use:

```ts
function handleTemperatureKeyboardClear(): void {
  setTemperatureKeyboardValue('')
}
```

Render the last row as accessible buttons `C`, `0`, `⌫` with `aria-label="Очистить температуру"` and `aria-label="Удалить последний символ"`. Remove the spacer and the overflowing `Стереть` text.

- [ ] **Step 4: Add panel-level series toggles**

Keep local visibility in `HeatingControlPanel`, render two `aria-pressed` buttons with current/target values, and pass only selected series to the chart:

```tsx
const [visibleSeries, setVisibleSeries] = useState(() => new Set(['nozzle', 'bed']))
const displayedSeries = chartSeries.filter(({ id }) => visibleSeries.has(id))
```

Toggling is chart-only and must not call a printer command.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run: `npm run test:ui -- src/heating/useHeatingFanController.test.tsx src/ui/printTuneWidgets.test.tsx src/App.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the interaction slice**

```powershell
git add -- src/control/panels/HeatingControlPanel.tsx src/heating/useHeatingFanController.tsx src/heating/useHeatingFanController.test.tsx src/App.test.tsx
git commit -m "Улучшено управление температурой"
```

### Task 4: Touch-first visual pass for `960x544`

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Add control-scoped surface and size rules**

Use existing tokens and avoid global theme changes:

```css
.control-heating-chart-block .print-temp-chart-svg {
  background: color-mix(in srgb, var(--color-surface-elevated) 72%, var(--color-block-surface));
}

.control-heating-row .print-tune-compact-stepper-btn {
  width: 54px;
  height: 54px;
  background: color-mix(in srgb, var(--color-surface-elevated) 82%, var(--color-block-surface));
}

.print-temp-keyboard-side.is-control .print-temp-keyboard-key {
  min-height: 54px;
}
```

Add legend/button styles in the same quiet Nothing-inspired control vocabulary. Override inherited decorative pseudo-elements on stepper buttons with `content: none` where inspection confirms the connecting-line source.

- [ ] **Step 2: Check static constraints**

Run: `git diff --check -- src/App.css`

Expected: exit `0`, no whitespace errors.

- [ ] **Step 3: Commit the visual slice**

```powershell
git add -- src/App.css
git commit -m "Обновлен touch-интерфейс температур"
```

### Task 5: Verification and visual validation

**Files:**
- Verify only; fix only files already in scope if a check exposes a regression.

- [ ] **Step 1: Run targeted regression tests**

Run: `npm run test:ui -- src/heating/useHeatingFanController.test.tsx src/ui/printTuneWidgets.test.tsx src/App.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run project frontend checks**

Run: `npm run typecheck`

Run: `npm run lint`

Expected: both exit `0`.

- [ ] **Step 3: Run the printer UI build**

Run: `npm run build:ui:printer`

Expected: exit `0`, production live bundle generated.

- [ ] **Step 4: Validate rendered UI at printer resolution**

Start the existing mock runtime, open the Temperature control tab at `960x544`, and verify:

- no horizontal scroll or clipped CTA;
- chart surface is not pure black;
- current and target lines are distinguishable;
- both series toggles have at least `48x48px` hit areas;
- stepper and numeric keys are at least `54px` high;
- `C`, `0`, `⌫`, and `Ввод` are visible without overlap;
- no line connects the target field to `-` or `+`.

- [ ] **Step 5: Inspect final scope**

Run: `git status --short`

Run: `git diff HEAD~4 --check`

Run: `git diff HEAD~4 --stat`

Expected: only spec/plan and temperature-tab implementation files are present; no unrelated changes.

- [ ] **Step 6: Record device limitation**

If no printer is available, final report must state that local command-path and UI checks passed but real heater actuation and snapshot confirmation still require device verification.
