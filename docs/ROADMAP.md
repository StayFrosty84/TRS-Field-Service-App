# Roadmap

Single source of truth for improvement ideas. Merged from the old `AlexNotes.md`, the
root `Update the auto complete address to focu.md`, and the prior ideation backlog.

## How to execute

Pick any item under **Ready** and tell Claude `do <item>`. It runs the standard loop —
`ce-brainstorm` → `writing-plans` → `subagent-driven-development` — exactly like the PDF
work, and ships per [DEPLOYMENT.md](DEPLOYMENT.md). Items under **Needs brainstorm** are
bigger; they get their own brainstorm to define scope before planning.

Each item: title — one-line mechanic — **(size S/M/L)** — grounding (files/helpers to reuse).

---

## ✅ Shipped

- **PDF photo compression** — job photos downscaled (1600px / q0.72 JPEG) at
  PDF-generation time so the Bill of Sale stays under the ~24 MB email limit; IndexedDB
  originals untouched. (`image.js`)
- **Bill of Sale header overlap fix** — even spacing in the title/meta band. (`pdf.js`)

## ✅ Already exists — do not rebuild

Verified in code. Listed so they aren't re-proposed.

- **Date filters on the WO list** — `DATE_CHIPS` (Any/Today/7d/30d/Month/Quarter) in `Work.jsx`.
- **Search WO by bill #** — SearchBar feeds `filterWorkOrders` (`workFilter.js`).
- **Quarterly / YTD sales-tax summary** — in `Reports.jsx` (`salesTax.js`).
- **"Who owes me money"** — unpaid shortlist on the Home dashboard (`unpaid.js`).

---

## Ready (first wave — small, grounded)

- **Tap-to-everything** — make phone `tel:`/`sms:`, email `mailto:`, and the job address a
  one-tap **Navigate** link across WO / Account / Contact detail. **(S)** — `mapsHref()` in
  [`maps.js`](../src/lib/maps.js) is already written and tested but unused. Folds in the
  "tap-to-call" and "One-tap Navigate" notes.
- **Work-type icon picker (admin)** — let the admin choose a work type's icon. **(S)** — the
  `icon` field already renders via `Icon.jsx`; `WorkTypeManager.jsx`'s editor just never sets
  it. Add a picker from `Icon.jsx`'s existing set.
- **Per-account outstanding rollup** — on Account detail, total unpaid across the account's
  bills + "last paid" date. **(S)** — reuse `unpaid.js` scoped to one account.
- **Account rating (1–5★) + terms/flags** — `rating` and a terms picklist
  (COD / Net-30 / Prepay / Do-not-service); 1★ or Do-not-service shows a warning banner when
  starting a new WO. **(S–M)** — accounts are schemaless in Dexie (no migration). Build the
  two together; they share the banner pattern.
- **Last-sync visibility** — show last backup/sync date-time; warn in-app if stale; surface
  "cloud sync" as a global action on Home. **(S)** — extends `backup.js` / `BackupReminder.jsx`.
- **Per-field help text** — short hints explaining where each field lands on the PDF. **(S)**

---

## Needs brainstorm (bigger bets)

- **Catalog-linked template line items** — template items currently free-form
  `{description, qty, unitPrice}`; normalize to `{catalogItemId, qty}` + a price snapshot so
  templates draw from the Parts & Labor catalog. **(L)** — reuse `CatalogPicker.jsx`;
  "think SF data model."
- **Partial payments + balance due** — record `payments[]` against a bill (amount + method +
  date + **reference / check #**); "paid" derives when balance hits zero; hide a blank
  reference on the PDF. **(L)** — extends `markBillPaid` in `db.js`. Subsumes the
  "billing reference number" note.
- **Configurable WO stage pipeline** — replace binary open/completed with an admin-defined
  pipeline (Open → Scheduled → In progress → Completed → Invoiced → Paid) stamping a
  timestamp per stage; Dashboard can flag "stuck > N days." **(L)**
- **Work type on each WO row** — show the work type used, per row. **(M, has a dependency)** —
  WO does **not** record `workTypeId` today; add that first, then render in `OrderRow`.
- **Estimate → Bill conversion + win-rate** — a "Convert estimate to bill" action; Reports
  shows estimates sent vs. converted. **(M)** — `isEstimate` already exists in the PDF path.
- **Account/CRM conveniences** — Saved List Views (named status+date+query combos); default
  work type per Account; "Repeat last job" (clone previous WO); first-run onboarding
  checklist; validation-rule toggles (require photo before completing / signature before
  paid); required-contact warning before billing. **(M each)**
- **Tighter backup reminder** — configurable interval (today fixed at 14 days in
  `BackupReminder.jsx`); the original ask was every 2/6 hours. **(S)**
- **Accessibility** — dark mode + high-contrast + font scaling for outdoor/gloved use.
  **(M)** — `theme.js` is the foundation.

---

## Parking lot (raw — triage before building)

- Truck/Vehicle info section on the WO (Unit # / Make / Model).
- Customer reference number field (separate from the internal bill #).
- Auto-save with undo **or** an unsaved-changes warning when editing a WO (admin toggle to
  turn the warning off). Note: `autosave.js` / `useAutosave.js` already exist — check what
  they cover before building.
- Google Maps API key (available) for richer address autocomplete. Note: there is
  in-progress address-autocomplete work (`addrProvider.js`, `googlePlaces.js`,
  `AddressAutocomplete.jsx`) — reconcile with that first.
