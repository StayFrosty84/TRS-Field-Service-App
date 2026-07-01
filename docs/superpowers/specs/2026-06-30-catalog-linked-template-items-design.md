# Catalog-linked template line items — design

**Date:** 2026-06-30
**Roadmap items:** "Catalog-linked template line items" (L) + "Work-type template line items (editor tab)" (M) — merged; the editor tab already ships, so the net work is the catalog link.

## Goal

Make work-type template line items reference the Parts & Labor catalog instead of duplicating free-form text/price, so a product's name and price live in one place ("SF data model"). Bills remain unaffected — they already freeze their line items at billing time.

## Decisions (from brainstorm)

1. **Pure reference.** A new template row is `{ catalogItemId, qty }` — no stored price. Name/price resolve live from the catalog.
2. **Mixed, with auto-create.** Legacy free-form rows (`{description, qty, unitPrice}`, no `catalogItemId`) keep working untouched. Typing a brand-new line in the editor first creates a catalog product, then stores its id — so every *new* row is catalog-backed.
3. **Two-way assignment (both surfaces).** Add products to a work type from the work-type editor (picker) **and** assign a product to many work types from a product editor (checklist).
4. **Block on delete.** Deleting a catalog item that any work type references is blocked, listing the work types. Bills are safe regardless.
5. **Approach A — embedded array.** Keep `workType.items` as an embedded array (no join table). Reverse lookups scan work types (small N). **No `db.version` bump — additive/schemaless**, like picklists and stages.

## Data model

```js
// workType.items — array, as today:
{ catalogItemId: 'abc', qty: 2 }              // new rows (pure reference)
{ description: 'Disposal fee', qty: 1, unitPrice: 25 }   // legacy rows (untouched)
```

`catalogItems` is unchanged structurally; it just becomes editable (rename/reprice).

## Helpers (`src/lib/templateItems.js`, pure)

- `resolveTemplateItem(item, catalogById)` → `{ catalogItemId?, description, unitPrice, qty, missing }`.
  - `catalogItemId` set + found → live `description`/`unitPrice`, `missing:false`.
  - `catalogItemId` set + not found → `description:'(deleted item)'`, `unitPrice:0`, `missing:true` (defensive; block-on-delete should prevent it).
  - No `catalogItemId` (legacy) → own `description`/`unitPrice`, `missing:false`.
- `resolveTemplateItems(items, catalogById)` → array of the above.
- `workTypesUsing(workTypes, catalogItemId)` → work types whose `items` reference it.

## DB functions (`src/db/db.js`)

- `catalogItemUsage(catalogItemId)` → `string[]` of work-type names using it.
- `deleteCatalogItem(id)` — **guarded**: if used, throw `Error` with `.usedIn` (names) and do not delete/tombstone; else delete + `recordTombstone` as today.
- `setCatalogItemWorkTypes(catalogItemId, workTypeIds)` — bulk apply the product editor's checklist: add a `{catalogItemId, qty:1}` row to each checked work type that lacks it; remove the row from each unchecked work type that has it. Idempotent (never duplicates).

## Surfaces

**a) Work-type template editor** (`WorkTypeManager.jsx`) — rows render resolved product name + live price (read-only) + editable qty + drag/remove. Two buttons: **Add from catalog** (opens existing `CatalogPicker`, adds `{catalogItemId, qty:1}`) and **New item** (inline name+price → `createCatalogItem` → add new id). Legacy rows still render/edit their own text/price. Save maps rows to `{catalogItemId, qty}` (or legacy shape) — drops the client `_k`.

**b) Product edit sheet** (new, in `CatalogManager.jsx`) — ✎ on a catalog row opens a sheet (reuse `.sheet-backdrop`/`.sheet`) with description, price, and a **"Use in work types"** checklist. Save calls `updateCatalogItem` + `setCatalogItemWorkTypes`. First place a product can be renamed/repriced. Delete surfaces the guarded-delete message.

**c) Bill/WO (snapshot at selection)** — `WorkOrderNew` loads the catalog (`useLiveQuery(listCatalog)`) and snapshots `templateItems` via `resolveTemplateItems(workType.items, catalogById)` so the WO stores frozen `{description, qty, unitPrice}` ([WorkOrderNew.jsx:154](../../src/pages/WorkOrderNew.jsx#L154)). `BillEditor` is unchanged — it already reads frozen `templateItems`.

## Migration & sync

Zero migration. No new table, no `db.version` bump. `SYNCED_TABLES` / backup `TABLES` untouched (`workTypes`, `catalogItems` already sync).

## Testing (TDD)

- `resolveTemplateItem`: catalog ref → live price; legacy → own fields; missing product → `missing:true`.
- `workTypesUsing`: returns only referencing types; ignores legacy rows.
- `catalogItemUsage` / `deleteCatalogItem`: blocks (with names) when referenced; deletes + tombstones when not.
- `setCatalogItemWorkTypes`: checking adds one row; unchecking removes; idempotent (no dupes).
- WO snapshot: selecting a work type resolves refs to current prices into `templateItems`.

## Out of scope (YAGNI)

Per-template price overrides, archive/soft-delete of products, a join table, inline expand on the catalog list.
