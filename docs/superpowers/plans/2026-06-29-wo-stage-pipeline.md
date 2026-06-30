# WO Stage Pipeline Implementation Plan

> **For agentic workers:** Execute task-by-task. Pure logic via TDD (red → green). Leave uncommitted for review.

**Goal:** Replace the binary open/completed WO status with an admin-defined, ordered stage pipeline, keeping `status`/`completedAt` as a derived compatibility shadow and mapping legacy records lazily on read.

**Architecture:** New Dexie `stages` table (admin rows like `workTypes`). Each WO gains `stageId` + append-only `stageHistory`. Pure helpers in `src/lib/stages.js` resolve stage, compute days-in-stage and stuck. Every stage change still writes legacy `status`/`completedAt`. Feature-flagged `featStages` (default ON) collapses to the old toggle when off.

**Tech Stack:** React, Vite, Dexie, dexie-react-hooks, vitest.

## Global Constraints

- BACKWARD COMPATIBILITY: every stage change writes legacy `status` ('open'/'completed') + `completedAt`; legacy WOs map lazily via `resolveStage` (no bulk migration).
- Do NOT touch payment functions in db.js or src/lib/payments.js / unpaid.js.
- db.version block is additive; current highest version is **4**, so add **v5**.
- `stages` must be registered in SYNCED_TABLES (db.js) and TABLES (backup.js).
- Feature flag `featStages` default ON, read via useFeatures().
- Pure helpers live in src/lib/stages.js (+ stages.test.js) per task instructions (spec calls it stagePipeline.js; instructions override → stages.js).
- Full suite (`npx vitest run`, 133 baseline) stays green; `npm run build` succeeds.

---

### Task 1: Pure helpers (TDD) — src/lib/stages.js + stages.test.js

Helpers:
- `DEFAULT_STAGES` — array of {name, color, isTerminal} in order.
- `stageColorClass(stage)` → 'open' | 'progress' | 'completed' (maps color 'done'→'completed').
- `resolveStage(order, stages)` — stageId match; legacy completed→first terminal (prefer name 'Completed'); legacy open→first non-terminal; else stages[0]||null.
- `currentStageEnteredAt(order)` — stageHistory[last].at, else completedAt, else createdAt.
- `daysInCurrentStage(order, stages, now)` — floor((now-enteredAt)/DAY).
- `isStuck(order, stages, thresholdDays, now)` — false if terminal/no stage; else days > threshold.
- `seedStageHistory(order, stages)` — one entry of resolved legacy stage at completedAt||createdAt (for write-on-touch).

TDD per spec testing section. Then implement.

### Task 2: db.js schema + CRUD + seed

- Add `db.version(5).stores({ stages: 'id, order, createdAt' })`.
- Add `stages` to SYNCED_TABLES.
- `DEFAULT_STAGES` seed rows (import from lib/stages.js).
- CRUD: `listStages` (orderBy order), `createStage`, `updateStage`, `deleteStage` (in-use guard + tombstone), `setWorkOrderStage(orderId, stage, allStages)` (compatibility shadow + write-on-touch history), `ensureSeedStages` (guarded by stagesSeeded).
- `createWorkOrder`: set initial stageId to first stage by order + seed one history entry.

### Task 3: backup.js — add 'stages' to TABLES.

### Task 4: useFeatures.js — add `stages: p?.featStages !== false`.

### Task 5: styles.css — add `.badge--progress`.

### Task 6: StageManager.jsx (new) + Settings.jsx mount + stuck threshold input.

### Task 7: WorkOrderDetail.jsx — stage chip row (flag on) / old toggle (flag off); header badge stage name+color.

### Task 8: Work.jsx + workFilter.js — stage-id filter + Stuck chip; OrderRow badge.

### Task 9: Home.jsx — terminal/non-terminal counts + Stuck jobs section.

### Task 10: seedDemo.js — seed stages; demo WOs get terminal stage.

### Verify: npx vitest run (green, >133), npm run build.
