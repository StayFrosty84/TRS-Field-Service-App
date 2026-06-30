# Configurable WO stage pipeline — design

Date: 2026-06-29

Replace the binary `open` / `completed` work-order status with an **admin-defined stage
pipeline** (e.g. Open → Scheduled → In progress → Completed → Invoiced → Paid). Each time a
work order enters a stage, stamp the time it was entered. The Dashboard can then flag work
orders **stuck more than N days** in their current stage. Roadmap item **Configurable WO
stage pipeline (L)**.

> Drafted autonomously, no interactive user. Every point that would normally be a question is
> recorded under **Open design questions** with a recommended default; the rest of the spec is
> written against those defaults.

## Background — what exists today

- **Status is binary.** A work order is `status: 'open'` or `status: 'completed'`, set in
  `createWorkOrder` (`src/db/db.js`, default `'open'`) and flipped by `toggleComplete` in
  `src/pages/WorkOrderDetail.jsx` (lines 121-128), which also stamps `completedAt`.
- **`status` is an indexed Dexie field** (`workOrders: 'id, accountId, contactId, status, createdAt'`).
- **Badges** render `badge--${order.status}` — only `.badge--open` and `.badge--completed`
  exist in `src/styles.css` (lines 363-369), mapped to amber ("open") and green ("done") theme
  vars. Bill payment reuses `.badge--paid` / `.badge--unpaid`.
- **Filtering** lives in `src/lib/workFilter.js`: the chips `all | open | completed | unpaid`
  drive `filterWorkOrders`, which compares `o.status` directly. `unpaid` is derived from the
  bill, not the work order.
- **Dashboard** (`src/pages/Home.jsx`) counts `status === 'open'` ("Open jobs") and
  `status === 'completed'` ("Completed").
- **Admin config precedent:** work types are admin-defined rows in a Dexie `workTypes` table,
  managed by `WorkTypeManager.jsx` under Settings, seeded once via `ensureSeedWorkTypes`, with a
  `*Seeded` flag on the profile. Feature flags live on `businessProfile` and are read through
  `useFeatures()`. This pipeline reuses the same shapes.
- **Schemaless Dexie:** arbitrary object properties persist without a version bump; backup
  (`src/lib/backup.js` `TABLES`) and Drive sync (`SYNCED_TABLES` in `db.js`) iterate a static
  table list, so a new table must be added to **both** lists.

## Scope

In:
- An admin-defined, ordered list of pipeline stages stored in the DB.
- Per-work-order **current stage** plus a **stage history** of `{ stage, at }` entries.
- Backward-compatible mapping of legacy `'open'` / `'completed'` onto the new pipeline.
- Stage picker on the work-order detail screen, replacing the open/completed toggle.
- Filters, badges, and dashboard counts adapting to dynamic stages.
- A "stuck > N days" computation and a Dashboard surface for it.
- Stage management UI in Settings (mirroring `WorkTypeManager`).

Out:
- Automation / triggers (e.g. "auto-advance to Invoiced when a bill is generated"). The bill
  flow still calls its own status updates; see **Cross-feature reconciliation**.
- Per-stage permissions, assignees, SLAs beyond the single global "stuck" threshold.
- Reordering existing history or editing past timestamps.
- Migrating the binary `status` field away entirely (it is kept as a derived compatibility
  shadow — see Data model).

## Approaches considered

**A. Stage table + per-WO `stageId` + `stageHistory[]` (recommended).**
Stages are admin rows in a new `stages` table (id, name, order, color/icon, terminal flag). A
work order carries `stageId` and an append-only `stageHistory: [{ stageId, at }]`. The current
stage's entry time is `stageHistory[last].at`. Mirrors the `workTypes` precedent exactly:
admin-editable, seedable, syncable, reorderable with the existing `SortableList`.

**B. Stages as a config array on `businessProfile`.**
No new table; the ordered stage list is one JSON array on the profile (like feature flags).
Simpler to sync (one row), but reordering/deleting a stage that work orders point to is
awkward, and it breaks the established "list of things = a table" pattern (work types,
catalog). Rejected: the WO→stage reference wants a stable key, and a table gives us that plus
free backup/sync once registered.

**C. Keep `status` string, just allow arbitrary string values.**
Set `status` to any admin string and add a parallel `statusHistory`. Minimal schema, but loses
the stable id (renaming a stage orphans every WO), can't carry per-stage metadata (color,
terminal flag, order) cleanly, and the indexed `status` field would hold free text. Rejected.

**Recommendation: A.** It matches the codebase's existing admin-config pattern, keeps a stable
reference for renames/reorders, and the per-stage metadata (order, color, terminal) is exactly
what badges and the dashboard need.

## Data model

### New table — `stages`

Added in a new Dexie version block in `src/db/db.js`, following the `workTypes` pattern:

```js
// vN: configurable work-order stage pipeline.
db.version(N).stores({
  stages: 'id, order, createdAt',
});
```

Row shape:

```js
{
  id,            // uid()
  name,          // 'Scheduled'
  order,         // integer sort key, like SortableList output
  color,         // 'open' | 'progress' | 'done' (maps to a badge style; see Badges)
  isTerminal,    // bool — counts as "finished" (Completed/Invoiced/Paid). Default false.
  createdAt, updatedAt,
}
```

Notes:
- `order` is the sort key; reordering rewrites `order` on the affected rows (same as how
  `SortableList` is used by `WorkTypeManager` for line items).
- `isTerminal` lets the dashboard separate "still working" jobs from "done" jobs without
  hard-coding stage names, and lets "stuck" detection skip terminal stages (a job sitting in
  Paid forever is not stuck).
- `stages` MUST be appended to `SYNCED_TABLES` (`db.js`) and `TABLES` (`backup.js`), exactly as
  `workTypes` was, so it backs up and syncs. New table, no blob fields, no omit fields.

### Work order fields (schemaless — no migration on `workOrders`)

Each work order gains, written through the existing `updateWorkOrder` upsert:

```js
{
  stageId,                       // current stage id
  stageHistory: [{ stageId, at }], // append-only, ordered by entry time
  // status / completedAt: kept as a derived compatibility shadow (below)
}
```

`stageHistory[last].at` is the timestamp the current stage was entered — the basis for "stuck".

### Legacy compatibility — mapping `open` / `completed` onto the pipeline

The key constraint: **existing records have only `status` (`'open'`/`'completed'`) and
`completedAt`, with no `stageId`.** We do **not** run a bulk migration on `workOrders` (it would
fight Drive sync's last-writer-wins and the schemaless convention the codebase relies on).
Instead, resolve the stage **lazily and read-only** with a small pure helper:

```js
// src/lib/stagePipeline.js
export function resolveStage(order, stages) {
  if (order.stageId) return stages.find((s) => s.id === order.stageId) || null;
  // Legacy fallback: map binary status onto the default pipeline.
  const wantTerminal = order.status === 'completed';
  return wantTerminal
    ? stages.find((s) => s.name === 'Completed') || stages.find((s) => s.isTerminal) || null
    : stages.find((s) => !s.isTerminal) || stages[0] || null;
}
```

- A legacy `completed` WO resolves to the **Completed** stage (or the first terminal stage if
  the admin renamed it); a legacy `open` WO resolves to the **first non-terminal** stage
  (Open). `completedAt`, if present, seeds the history entry's `at` so "stuck" math still works
  on old records.
- **Write-on-touch (not bulk):** the first time a user changes a legacy WO's stage, we persist
  `stageId` + a seeded `stageHistory` (entry 1 = resolved legacy stage at `completedAt || createdAt`;
  entry 2 = the new stage at now). After that the WO is fully on the new model. Untouched legacy
  WOs keep working via `resolveStage` forever — no migration required.

### Keeping `status` in sync (compatibility shadow)

`status` and `completedAt` are **still written** whenever the stage changes, derived from the
target stage's `isTerminal`:

```js
async function setStage(orderId, stage) {
  await updateWorkOrder(orderId, {
    stageId: stage.id,
    stageHistory: [...(order.stageHistory || seededHistory(order)), { stageId: stage.id, at: now() }],
    status: stage.isTerminal ? 'completed' : 'open',
    completedAt: stage.isTerminal ? now() : null,
  });
}
```

This means the **indexed `status` field, all existing `status`-based queries, the `unpaid`
filter, and any not-yet-updated code keep working unchanged.** The pipeline is additive; the
binary status becomes a derived projection of "are we in a terminal stage."

### Seeding the default pipeline

Add `ensureSeedStages()` mirroring `ensureSeedWorkTypes()` — seeds once, guarded by a
`stagesSeeded` flag on the profile so deleting all stages doesn't re-add them. Default rows:

| order | name | color | isTerminal |
|---|---|---|---|
| 0 | Open | open | false |
| 1 | Scheduled | open | false |
| 2 | In progress | progress | false |
| 3 | Completed | done | true |
| 4 | Invoiced | done | true |
| 5 | Paid | done | true |

Existing installs that have only ever known open/completed will, on next boot, get this default
pipeline seeded; their work orders map onto it via `resolveStage` (Open ↔ order 0, Completed ↔
"Completed"). See **Open design questions** on whether the pipeline is gated behind a feature
flag.

## UI changes

### Stage picker — `WorkOrderDetail.jsx`

Replace the `toggleComplete` button block (lines 322-329) with a **stage chip row** like the
existing Work-type chips (lines 213-236): one chip per stage in `order`, the current one
`chip--active`, tapping calls `setStage(id, stage)`. The header badge (line 148) renders the
current stage name with its color class. This is an instant action (like work-type pick and
mark-paid), not part of the debounced autosave block.

`createWorkOrder` (`db.js`) sets the initial stage to the first stage by `order` and seeds
`stageHistory` with one entry, in addition to its current `status: 'open'` default.

### Badges — `styles.css`

Stage colors map to a small fixed palette of existing badge styles rather than arbitrary CSS,
so themes/contrast keep working:

- Add `.badge--progress` (reuse a third accent, e.g. the primary/info color) alongside the
  existing `.badge--open` (amber) and `.badge--completed` (green).
- A stage's `color` field is one of `open | progress | done`; the badge class is derived
  (`badge--open` / `badge--progress` / `badge--completed`). Components render
  `badge--${stageColorClass(stage)}` instead of `badge--${order.status}`.
- Touch points: `WorkOrderDetail.jsx` header (148), `Work.jsx` OrderRow (114), `Home.jsx`
  recent-orders list (140). Each now shows the **stage name** with the stage's color, instead of
  the raw status word.

### Filters — `Work.jsx` + `workFilter.js`

- Replace the hard-coded `['open','Open']` / `['completed','Completed']` chips (Work.jsx line 50)
  with one chip per stage (plus `All`, and `unpaid` when billing is on). Chips read from the live
  stage list.
- `filterWorkOrders` (`workFilter.js`): the `status` arg becomes a stage id (or `'all'` /
  `'unpaid'`). The branch that currently does `o.status !== status` instead resolves the WO's
  stage id (via the same `resolveStage` logic, passed in `stages`) and compares ids. `unpaid`
  stays bill-derived and unchanged. Keep `'all'` and `'unpaid'` as reserved keys; everything else
  is a stage id.
- A **"Stuck"** filter chip is added that surfaces only stuck work orders (see next section).

### Dashboard — `Home.jsx`

- "Open jobs" stat counts WOs whose resolved stage is **non-terminal** (replaces
  `status === 'open'`); "Completed" counts **terminal** (replaces `status === 'completed'`).
  Because the compatibility shadow keeps `status` correct, this could also stay as-is, but
  reading from `isTerminal` is more honest once admins add mid-pipeline stages.
- New **"Stuck jobs"** section: a count stat plus a list of the stuck work orders (account name,
  current stage, days in stage), linking to each WO — styled like the existing "Who owes me
  money" list. Shown only when the count is > 0.

## "Stuck > N days" computation

A pure, unit-tested helper in `src/lib/stagePipeline.js`:

```js
// Days the order has sat in its current stage.
export function daysInCurrentStage(order, stages, now = Date.now()) {
  const enteredAt = currentStageEnteredAt(order); // stageHistory[last].at, else completedAt/createdAt
  return Math.floor((now - enteredAt) / 86400000);
}

export function isStuck(order, stages, thresholdDays, now = Date.now()) {
  const stage = resolveStage(order, stages);
  if (!stage || stage.isTerminal) return false;      // terminal stages never "stuck"
  return daysInCurrentStage(order, stages, now) > thresholdDays;
}
```

- `currentStageEnteredAt` falls back to `completedAt || createdAt` for legacy/un-touched records
  so the math never throws on missing history.
- **Terminal stages are exempt** — a finished/paid job is not "stuck", it's done.
- `thresholdDays` (default **7**) is a single global admin setting on the profile, surfaced in
  Settings next to the pipeline editor. Following `workFilter.js`, `now` is injectable for tests.
- The Dashboard list sorts by days-in-stage descending (most overdue first), reusing the
  `daysInCurrentStage` value also shown per row.

## Where admins configure stages

A **`StageManager.jsx`** component under Settings, modeled directly on `WorkTypeManager.jsx`:

- Lists stages in `order` with edit/delete; "Add stage" appends a new one.
- Each stage edits: name, color (chip picker over `open | progress | done`), and an
  `isTerminal` toggle ("Counts as finished").
- Reorder via the existing `SortableList` (as `WorkTypeManager` does for line items); reorder
  rewrites `order`.
- **Delete guard:** if any work order currently points to the stage, block deletion (or require
  reassigning those WOs first) — mirrors how the app avoids orphaning references. Recommended
  default: block with a message ("3 work orders are in this stage — move them first").
- Placed in Settings under a new **"Work-order stages"** section, above "Work types".
- The global **stuck threshold (N days)** input lives in this section (stored on the profile,
  e.g. `stuckDays`), with a hint explaining the Dashboard flag.

CRUD helpers in `db.js` mirror work types: `listStages` (ordered by `order`),
`createStage`, `updateStage`, `deleteStage` (with the in-use guard + tombstone), plus
`ensureSeedStages`.

## Cross-feature reconciliation (note for later, not built here)

Two in-flight features overlap with this pipeline's terminal stages:

- **Partial-payments brainstorm introduces a "Paid" concept.** This pipeline's terminal
  **Paid** stage is about *work-order lifecycle*; partial payments are about *bill balance*.
  They must not become two competing sources of truth. **Recommendation:** the bill's payment
  status stays authoritative for money; the pipeline's Paid/Invoiced stages are operational
  status. When they ship together, either (a) auto-advance the WO stage from a bill event, or
  (b) drop the Paid/Invoiced default stages when billing is enabled and let the bill badge carry
  that meaning. Decide during partial-payments planning. **For now this spec keeps Invoiced/Paid
  as plain stages with no automation**, so nothing conflicts.
- **"Do-not-service / low-rating" warning banner (New Work Order screen).** No direct data
  overlap — that banner reads account/rating data, not stage. The only intersection is screen
  real estate on creation; flagged so the two designs don't both claim the top-of-form region.

## Testing / verification

- **Unit tests** (vitest, `environment: node`), new `src/lib/stagePipeline.test.js`, mirroring
  `workFilter.test.js` / `salesTax.test.js`:
  - `resolveStage`: WO with `stageId` → that stage; legacy `completed` → Completed/terminal;
    legacy `open` → first non-terminal; missing stage id → null/first.
  - `daysInCurrentStage`: uses `stageHistory[last].at`; falls back to `completedAt`/`createdAt`;
    `now` injected.
  - `isStuck`: over/under threshold; terminal stage always false; legacy record with only
    `completedAt`.
- **`filterWorkOrders`** extended tests: filtering by a stage id; `'all'` and `'unpaid'`
  unchanged; legacy records (no `stageId`) filter correctly via `resolveStage`.
- **Full suite + build:** `npx vitest run` green; `npm run build` succeeds.
- **Manual** (`npm run dev`, device mode):
  1. Fresh install → default pipeline seeded; new WO starts in Open with one history entry.
  2. Existing/legacy WO (open) shows "Open" badge; a legacy completed WO shows "Completed";
     no migration prompt.
  3. Advance a WO through stages → badge + history update; terminal stage sets `status:completed`.
  4. Settings → add/rename/reorder/delete stages; delete blocked when WOs occupy the stage.
  5. Set stuck threshold low; a WO sitting past it appears in Dashboard "Stuck jobs" and the
     Work "Stuck" filter; a terminal-stage WO never appears.
  6. Backup → restore, and Drive sync round-trip, carry stages + per-WO stageHistory.

## Open design questions

1. **Feature flag?** Should the pipeline be gated behind a `useFeatures()` flag (like
   dashboard/billing), so single-operator users keep the simple open/completed toggle?
   **Recommended default: YES** — add `featStages` (default ON), with the stage picker collapsing
   to the old two-button toggle when OFF. Cheap insurance against overwhelming the simplest users.
2. **Default stuck threshold N.** **Recommended default: 7 days**, admin-editable on the profile
   (`stuckDays`).
3. **Stage color palette.** Fixed `open | progress | done` mapped to existing badge styles, vs.
   free color picker. **Recommended default: fixed 3-color palette** — keeps theme/contrast/dark
   mode working and matches the existing badge system; revisit if users ask for more.
4. **Deleting an in-use stage.** Block vs. reassign-then-delete vs. cascade to first stage.
   **Recommended default: block with a count message**, simplest and safest.
5. **Do terminal stages still drive `completedAt`?** With multiple terminal stages
   (Completed/Invoiced/Paid), `completedAt` is stamped on *first* entry to any terminal stage.
   **Recommended default: stamp `completedAt` when entering the first terminal stage, leave it
   when moving between terminal stages, clear it when moving back to non-terminal.** Keeps
   existing date-based reporting stable.
6. **Per-stage automation from bills.** Auto-advance to Invoiced on Generate, Paid on mark-paid?
   **Recommended default: NO automation in this spec** — reconcile with the partial-payments
   feature first (see Cross-feature reconciliation).
7. **History visibility.** Show the full timestamped stage history on the WO detail screen, or
   keep it internal (only "N days in <stage>")? **Recommended default: show a compact "in
   <stage> for N days" line now; defer a full timeline** as a later enhancement.

## Out of scope

- Stage automation / triggers (deferred, pending partial-payments reconciliation).
- Per-stage assignees, SLAs, or notifications beyond the single global stuck threshold.
- Editing historical stage timestamps.
- Removing the binary `status` field (kept as a derived compatibility shadow).
