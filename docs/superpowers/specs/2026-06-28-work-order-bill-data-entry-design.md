# Design: Work-order & bill data-entry improvements

Date: 2026-06-28

## Context

Three changes requested (from `docs/superpowers/Notes/AlexNotes.md`) to speed up on-site data
entry for the sole-proprietor field operator:

1. **Billing reference number** — capture a payment reference (check #, transaction/confirmation
   ID) when a bill is paid; print it on the PDF only when filled.
2. **Work-order Unit # and Reference #** — two new fields on the work order (e.g. equipment unit
   number and a customer PO/job reference), printed on the Bill of Sale when filled.
3. **Auto-save** — stop making the user tap "Save changes" on work orders and bills; persist edits
   automatically.

The billing Reference # (1) and the work-order Reference # (2) are **two distinct fields** with
different meanings.

## Data model

Dexie stores arbitrary object properties and backup/restore exports whole records, so these are
new fields only — **no `db.version` bump, no migration**:

- `workOrders`: `unitNumber` (string), `referenceNumber` (string)
- `billsOfSale`: `paymentReference` (string)

## Feature 1 — Billing reference #

- **Bill editor** (`src/pages/BillEditor.jsx`): new "Reference #" text input shown whenever the
  bill is marked **Paid** (alongside the existing payment-method select at ~line 381). State
  `paymentReference`, persisted in the bill record next to `paymentMethod`.
- **Quick "mark paid"** (`src/pages/WorkOrderDetail.jsx` ~line 242-249): add a Reference # input
  beside the method picker. Extend `markBillPaid(id, method, reference)` in `src/db/db.js:169` to
  store `paymentReference`.
- **PDF** (`src/lib/pdf.js` ~line 114-117): the existing `PAID (method)` line becomes
  `PAID (method) · Ref: <x>`, where the `Ref:` segment renders only when `paymentReference` is
  non-blank.

## Feature 2 — Work-order Unit # & Reference #

- **`src/pages/WorkOrderNew.jsx` and `src/pages/WorkOrderDetail.jsx`**: an "Info" group with two
  text inputs — Unit # and Reference #. Stored on the work-order record (`unitNumber`,
  `referenceNumber`).
- **PDF** (`src/lib/pdf.js`): print Unit # and Reference # in the bill's service-info header area;
  each line shown only when its value is filled.

## Feature 3 — Auto-save (work orders + bills)

### Mechanism
Shared approach: **debounce ~700ms after the last change, plus save on blur**, with the manual
"Save changes" button replaced by a subtle status indicator (`Saving…` → `Saved ✓`). Save-on-blur
makes field exits feel instant; the debounce covers rapid typing. A small reusable hook
(e.g. `src/lib/useAutosave.js`) encapsulates the debounce + status state so both screens share it.

### Work order detail (`src/pages/WorkOrderDetail.jsx`)
- Auto-save all editable fields: issue, notes, location text + GPS, service date, estimate flag,
  and the new Unit #/Reference #.
- Remove the "Save changes" button (line ~176); show the saved-status indicator instead.
- Existing already-instant actions (work-type pick, complete toggle, mark paid/unpaid) are
  unchanged.

### Bills (`src/pages/BillEditor.jsx`) — always auto-save
- **First save trigger:** a new bill record is **not** created when the editor opens. It is created
  and saved on the **first real content** — defined as **≥1 line item with a non-empty description
  or a price > 0**. The bill number is assigned at this first save (moved earlier than today's
  Generate-time assignment).
- After the first save, **every change auto-saves** (line items, tax, card fee, payment
  status/method/reference, bill date).
- **Generate** remains the explicit action that produces/refreshes the PDF, and continues to mark
  the work order `completed`. Work-order completion is **not** triggered by auto-save.
- **Re-editing an existing bill:** field edits auto-save straight to the record. The stored PDF can
  lag the data until regenerated, so the editor shows a hint **"PDF out of date — regenerate to
  update."** when the bill has been edited since its last `pdfGeneratedAt`.
- Reuse `saveBill(workOrderId, data)` (`src/db/db.js:128`) for the upsert; it already assigns the
  bill number on create and updates in place otherwise.

### Consequence — bills can exist without a PDF
Because a bill now persists before Generate, dashboards (Outstanding / Recent bills / Reports) may
show not-yet-generated bills using their total + paid/unpaid status. This is accepted. The one UI
guard required: the bill card on the work-order screen (`src/pages/WorkOrderDetail.jsx` ~line
256-261) currently always offers Open/Share PDF; when `pdfBlob` is absent, show **"Generate PDF"**
instead.

Explicitly **not** doing (kept simple): auto-deleting bills that become empty again; hiding
not-yet-generated drafts from dashboards.

## Testing / verification

- **Unit tests** (pure logic, vitest, `environment: node`):
  - Auto-save hook: debounce fires once after rapid changes; flush-on-blur saves immediately;
    status transitions Saving→Saved.
  - "Bill has real content" predicate (first-save trigger): empty items → false; a described or
    priced line → true.
  - PDF helper formatting for the optional `Ref:` segment and the Unit/Reference header lines
    (extract pure string builders so they're testable, mirroring existing `salesTax`/`maps` tests).
- **Full suite + build:** `npx vitest run` stays green; `npm run build` succeeds.
- **Manual** (`npm run dev`, device mode):
  1. New work order → enter Unit #/Reference # → fields auto-save (no Save button); reopen confirms.
  2. Create bill → add a line → "Saved ✓" appears, bill number assigned; bill shows on dashboard
     with no PDF yet; work-order bill card shows "Generate PDF".
  3. Mark Paid → choose method → enter Reference # → auto-saves.
  4. Generate → PDF shows `PAID (method) · Ref: …` and the Unit/Reference header lines; blank ones
     are omitted.
  5. Re-open the generated bill, change a line → "PDF out of date" hint; Generate refreshes it.
  6. Quick "mark paid" on a work order with a reference → stored and printed on regenerate.

## Out of scope

- Auto-saving the **New work order** creation screen (a record must exist first; creation stays
  explicit).
- Any change to backup/restore or sync (new fields are picked up automatically).
