# Assets & maintenance plans — design

Track physical assets (trucks/equipment) per account, attach time-based maintenance plans to
them, and surface due maintenance on Home for one-tap work-order creation. Roadmap items
**Asset / truck tracking (per account) — build FIRST** and **Recurring / maintenance jobs
(maintenance plans) — build AFTER asset tracking**.

## Decisions (v1, locked)

- **Cadence: time-only.** Every N months. No mileage engine (mileage is an informational
  field only).
- **Due behavior: suggest & confirm.** A "Maintenance due" list on Home; the user taps to
  create the WO. No silent DB writes — there is no reliable PWA background trigger, and this
  keeps the user in control.
- **Asset scope: minimal + VIN/serial.** Unit # and Plate # are separate fields. VIN camera
  scan is a feasibility-gated stretch (its own slice).

## Build slices (sequenced, each independently shippable)

1. **Assets** — CRUD + WO linkage + service history. *Usable alone as fleet tracking.*
2. **VIN scan** — optional, feasibility-gated (or dropped).
3. **Maintenance plans** — CRUD on an asset (time-only cadence).
4. **Due surfacing** — Home "Maintenance due" section + one-tap WO creation + completion
   advances the plan.

Slices 3–4 depend on 1. Slice 2 is orthogonal and can be deferred without blocking anything.

---

## Layer 1 — Assets (slice 1)

### Data model — `assets` table + `assetId` on work orders

Additive migration `db.version(7)`. It adds the `assets` store and re-declares `workOrders`
with an added `assetId` index (needed to query service history):

```
db.version(7).stores({
  assets: 'id, accountId, createdAt',
  workOrders: 'id, accountId, contactId, assetId, status, createdAt',
});
```

Asset row shape:
`{ id, accountId, make, model, year, unitNumber, plate, vin, mileage, notes, createdAt, updatedAt }`

Assets are account-scoped child records, exactly like `contacts` (`contacts: 'id, accountId,
…'`). No seeding — this is user data.

### Reference by id + snapshot the label

The WO links to an asset by `assetId` (mirrors `contactId`). **On selection, copy the asset's
`unitNumber` into the WO's existing `unitNumber` field** (a snapshot). Consequences:

- The PDF path is unchanged — `pdfText.js` already prints `workOrder.unitNumber`; no edit to
  the document code.
- Deleting an asset never corrupts a past WO or its PDF: the `unitNumber` snapshot survives,
  and `assetId` simply becomes a dangling link (history resolves it as "asset removed").
- Existing free-text `unitNumber` values keep working untouched — **no auto-migration, no
  auto-matching** to assets.

`deleteAsset` needs **no in-use guard** (WOs keep their snapshot). It records a tombstone like
other deletes.

### DB functions (`db.js`)

- `assetsForAccount(accountId)` → `db.assets.where('accountId').equals(accountId).sortBy('createdAt')`
- `createAsset(accountId, data)` → returns id
- `updateAsset(id, data)` → merge + `updatedAt`
- `deleteAsset(id)` → delete + `recordTombstone('assets', id)`
- `assetHistory(assetId)` → `db.workOrders.where('assetId').equals(assetId).reverse().sortBy('createdAt')`

### UI

- **Account detail** (`AccountDetail.jsx`) gains a **"Trucks / Equipment"** section: list the
  account's assets, add/edit — the same shape as the existing per-account contacts section.
- **New/Detail WO** (`WorkOrderNew.jsx`, `WorkOrderDetail.jsx`) gain an **Asset picker filtered
  by `accountId`**, identical to the contact picker (`allAssets.filter(a => a.accountId ===
  accountId)`). Selecting sets `assetId` and snapshots `unitNumber`; a "— None —" option keeps
  the free-text unit field usable when no asset is chosen.
- **Asset detail/edit** shows **Past jobs** = `assetHistory(assetId)` (derived; no separate log).

### VIN camera scan (slice 2 — feasibility-gated)

A "Scan" button beside the VIN field using the browser **`BarcodeDetector`** API to read the
door-jamb VIN barcode (Code 39). **Verify support before building:** works on Android Chrome,
**not on iOS Safari** — so it must be scan-where-available with manual entry everywhere else
(feature-detect `'BarcodeDetector' in window`). Printed-VIN OCR is a much larger lift and is
out of scope. This slice ships or drops without affecting slices 1/3/4.

---

## Layer 2 — Maintenance plans (slice 3)

### Data model — `maintenancePlans` table

Additive migration `db.version(8)`:

```
db.version(8).stores({ maintenancePlans: 'id, assetId, accountId, createdAt' });
```

Row shape:
`{ id, accountId, assetId, name, intervalMonths, lastServiceDate, nextDueDate, workTypeId,
active, notes, createdAt, updatedAt }`

- `name` e.g. "Oil change"; `intervalMonths` the cadence; `workTypeId` optional default for the
  generated WO.
- `nextDueDate` is **stored** (denormalized) for cheap querying, and recomputed whenever
  `lastServiceDate` or `intervalMonths` changes.

### Pure helper (`maintenance.js`)

- `computeNextDue(lastServiceDate, intervalMonths)` → date `lastServiceDate + intervalMonths`
  (calendar-month add). A brand-new plan with no `lastServiceDate` is due immediately (or on a
  chosen start date).

### DB functions (`db.js`)

- `plansForAsset(assetId)` → sorted list
- `createPlan(assetId, accountId, data)` / `updatePlan(id, data)` (recompute `nextDueDate`) /
  `deletePlan(id)` (+ tombstone)

### UI

Plans are managed on the **asset detail** view — each truck carries its own plans (add/edit
name, interval, optional work type). No global plan admin in v1.

---

## Layer 3 — Due surfacing & WO creation (slice 4)

### Pure helper (`maintenance.js`)

- `maintenanceDue(plans, asOf = now())` → active plans where `nextDueDate <= asOf` (optionally a
  small lead window), sorted most-overdue first. **No DB writes.**

### Home section

A **"Maintenance due"** panel on `Home.jsx`, mirroring the existing unpaid-shortlist and
stuck-orders panels. Each row: asset (make/model/unit #) + account + plan name + how overdue.

### One-tap creation (the only creation path)

Tapping a due row creates a WO prefilled with `accountId`, `assetId` (+ `unitNumber` snapshot),
the plan's `workTypeId`, and issue text `"Maintenance: {plan name}"`, stamped with
`maintenancePlanId`. That stamp drives a **"Maintenance" badge** on the WO row and makes the job
traceable back to its plan. Nothing is written until the user taps.

### Completion advances the plan

When a WO carrying `maintenancePlanId` reaches a **terminal stage** (or legacy `completed`), set
the plan's `lastServiceDate` to that completion date and recompute `nextDueDate`. Hook this into
the existing stage-change path (`stages.js` / `WorkOrderDetail.jsx`), guarded so it fires once.

---

## Migration / sync / backup

- `db.version(7)` — adds `assets`, adds `assetId` index to `workOrders` (additive, no upgrade
  function). `db.version(8)` — adds `maintenancePlans`.
- Register **`assets`** and **`maintenancePlans`** in `SYNCED_TABLES` (LWW + tombstones) and the
  backup `TABLES` list.
- `assetId`, `unitNumber` snapshot, and `maintenancePlanId` on the WO are schemaless/additive —
  no data migration.

## Testing

- **Unit (pure):** `computeNextDue` (month math, no-lastService case) and `maintenanceDue`
  (due/overdue/active filtering, ordering, empty) in `maintenance.test.js`.
- **Unit (Dexie harness):** asset CRUD + `assetHistory` filtering; plan CRUD with `nextDueDate`
  recompute; both deletes record tombstones.
- **In-app:** asset add/edit on Account detail, asset picker + unit-# snapshot on a WO, service
  history, plan creation, Home "Maintenance due" → one-tap WO → complete → plan advances.
  Verified by running the app (consistent with how managers/pickers are treated — no component
  unit tests).

## Non-goals / notes

- **No mileage cadence** in v1 — `mileage` is an informational asset field only.
- **No push notifications** — "reminders" are the in-app Home surface only; this is why
  suggest-and-confirm (not silent auto-create) is the v1 model.
- **No legacy `unitNumber` auto-matching** — old free-text values stay as-is; assets are opt-in
  going forward.
- VIN OCR (printed plate) is out of scope; only barcode scan where the browser supports it.
