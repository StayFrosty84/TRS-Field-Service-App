# Admin-editable picklists — design

Make the app's hardcoded drop-down lists editable from Settings, backed by an admin-managed
list + a shared editor + a shared picker. Roadmap item **Admin-editable dropdown lists (M)**.

## Scope

Three genuine business picklists are hardcoded today:

| Picklist | Values today | Where | Coupling |
|----------|--------------|-------|----------|
| Payment methods | Cash / Check / Card / Zelle / Other | `WorkOrderDetail.jsx` **and** `BillEditor.jsx` (duplicated) | none |
| Phone labels | Mobile / Office / Home / Other | `PhoneListField.jsx` (`LABELS`) | none |
| Account terms | COD / Net-30 / Prepay / Do-not-service | `AccountForm.jsx` (`TERMS`) | `Do-not-service` drives `accountWarning` |

In scope: make these three admin-editable via a generic list store + shared editor + shared
picker, and decouple the Do-not-service warning from the terms label.

Out of scope: **work-order stages** (stay in their own `stages` table — id-referenced, carry
`isTerminal`/`color`, richer editor, just shipped with sync; migrating them is risk with no
payoff); dynamic DB-populated selectors (account/contact pickers); app settings (theme, text
size); nav.

## Data model — generic `lists` table

New Dexie table, additive migration `db.version(6)`:

```
db.version(6).stores({ lists: 'id, kind, order, createdAt' });
```

Row shape: `{ id, kind, name, order, createdAt, updatedAt }` where
`kind ∈ 'paymentMethod' | 'phoneLabel' | 'accountTerm'`.

**Records store the picked value by name, not by id.** A payment keeps `method: "Cash"`; an
account keeps `terms: "Net-30"`. Consequences:
- No data migration — existing strings just work.
- Deleting a list value never orphans a record (the record keeps its snapshot string).
- A record can hold a value no longer in the list (legacy / deleted) — the picker must still
  show it (see `ListPicker`).

Register `lists` in `SYNCED_TABLES` and the backup `TABLES` list.

## Seeding

`ensureSeedLists()` in `db.js`, guarded by a `listsSeeded` flag on `businessProfile` (mirrors
`ensureSeedStages`/`ensureSeedWorkTypes`), seeds once:

- paymentMethod: Cash, Check, Card, Zelle, Other
- phoneLabel: Mobile, Office, Home, Other
- accountTerm: COD, Net-30, Prepay  — **Do-not-service intentionally omitted** (now a checkbox)

Called from the `main.jsx` boot chain after `ensureSeedStages()`.

## DB functions (`db.js`)

- `listItems(kind)` → `db.lists.where('kind').equals(kind).sortBy('order')`
- `createListItem(kind, name)` → append at end (`max(order)+1`), returns id
- `updateListItem(id, data)` → merge + `updatedAt`
- `deleteListItem(id)` → delete + `recordTombstone('lists', id)`

No in-use delete guard (values are name snapshots; deletion only removes the option from the
picker, existing records are unaffected).

## Shared components

**`ListManager.jsx`** — props `{ kind, label }`. `useLiveQuery(() => listItems(kind))`;
add (text input + Add), inline rename, delete, and drag-to-reorder via `SortableList`
(reorder rewrites `order`). Modeled on `WorkTypeManager.jsx` but for simple `{name}` rows.
Used three times in Settings.

**`ListPicker.jsx`** — props `{ kind, value, onChange, includeBlank = false, blankLabel }`.
Renders a `<select>` populated from `listItems(kind)`. **Always renders the current `value`
as an option even when it is not in the list** (prepend a legacy option) so no stored value is
lost or silently blanked. Optional leading blank/none option.

## Wiring the pickers

Store-by-name; each picker keeps the record's existing value working.

- **Payment method** — replace the hardcoded `<select>` in `WorkOrderDetail.jsx` (add-payment
  row) and `BillEditor.jsx` with `<ListPicker kind="paymentMethod" value=… onChange=… />`.
- **Phone label** — `PhoneListField.jsx`: replace the `LABELS` `<select>` with
  `<ListPicker kind="phoneLabel" value={p.label || 'Mobile'} onChange=… />`.
- **Account term** — `AccountForm.jsx`: replace the `TERMS` `<select>` with
  `<ListPicker kind="accountTerm" includeBlank blankLabel="— None —" value={form.terms} … />`.

## Do-not-service decoupling

- Account gains schemaless boolean `doNotService` (no migration).
- `AccountForm.jsx` adds a **"Do not service"** checkbox bound to `form.doNotService`
  (separate from the terms picker).
- `accountWarning(account)` in `unpaid.js` warns when **any** of:
  1. `rating != null && rating <= 1`
  2. `doNotService === true`
  3. (legacy) `terms === 'Do-not-service'`  — keeps existing accounts warning until re-saved.
  Message priority: do-not-service (flag or legacy term) first, then low rating.
- Seed terms omit "Do-not-service"; existing accounts holding it still display it (ListPicker
  shows off-list values) and still warn (legacy clause).

## Settings integration

Add three `ListManager` editors — **Payment methods**, **Phone labels**, **Account terms** —
into the existing **"Lists & templates"** collapsible group in `Settings.jsx`, alongside Work
types / Parts & Labor catalog / Import-Export. This gives a single unified "lists" admin area
without touching the separate Job-workflow (stages) group.

## Migration / sync / backup

- `db.version(6)` adds `lists` (no upgrade function — additive).
- `lists` added to `SYNCED_TABLES` (LWW + tombstones) and backup `TABLES`.
- `doNotService` is schemaless/additive — no migration.

## Testing

- **Unit (Dexie test harness):** `createListItem` ordering, `deleteListItem` (+ tombstone),
  `listItems(kind)` filtering/sorting.
- **Unit (pure):** `accountWarning` — do-not-service flag, legacy `Do-not-service` term, low
  rating, priority, and healthy account. Update existing `account.test.js`.
- **In-app:** `ListManager` (add/rename/delete/reorder) and `ListPicker` (shows list values +
  a legacy off-list value) verified by running the app; consistent with how `StageManager` /
  `WorkTypeManager` are treated (no component unit tests).

## Non-goals / notes

- Stages are explicitly not consolidated into `lists` (see Scope).
- No free-text "custom value" entry on the pickers — admins add values to the list instead
  (matches today's fixed-select behavior).
