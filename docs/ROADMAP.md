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

- **Settings reorganized into collapsible groups** — everyday items stay visible (Display &
  accessibility, Reports, Backup); setup/admin items tuck into collapsible groups (Business
  profile, Lists & templates, Job workflow, Integrations, Advanced), each remembering its
  open/closed state per device. (`Settings.jsx`, `styles.css`)
- **Configurable WO stage pipeline** — admin-defined stages (Open → Scheduled → In progress
  → Completed → Invoiced → Paid) replace the binary open/completed toggle; each WO carries
  `stageId` + `stageHistory`, the Dashboard flags "stuck > N days." No migration —
  additive `db.version(5)` `stages` table; legacy records map lazily via `resolveStage` and
  every change keeps the legacy `status`/`completedAt` shadow. Feature-flagged (default on).
  The stage selector sits at the top of the work-order detail and New Work Order screens.
  (`stages.js`, `StageManager.jsx`, `db.js`)
- **Partial payments + balance due** — `payments[]` per bill (amount + method + date +
  reference); paid/partial/unpaid derive from the running balance; PDF lists payments with a
  PAID IN FULL / Balance due trailer. Legacy single-payment bills synthesize on read (no
  migration); mutators are transactional. (`payments.js`, `db.js`, `WorkOrderDetail.jsx`,
  `pdf.js`)
- **Account rating (1–5★) + terms/flags** — `rating` + terms picklist
  (COD / Net-30 / Prepay / Do-not-service); 1★ or Do-not-service shows a warning banner when
  starting a new WO. Schemaless (no migration). (`AccountForm.jsx`, `AccountDetail.jsx`,
  `WorkOrderNew.jsx`, `accountWarning` in `unpaid.js`)
- **Per-account outstanding rollup** — Account detail shows total balance owed + last-paid
  date (`accountOutstanding` in `unpaid.js`); sums bill *balance* so partial payments reflect.
- **Work-type icon picker (admin)** — the work-type editor sets the `icon` field via a chip
  grid of the existing icon set. (`WorkTypeManager.jsx`, `iconNames` export in `Icon.jsx`)
- **Tap-to-everything** — phone `tel:`/`sms:` (Text button), email `mailto:`, and a one-tap
  **Navigate** link for addresses across WO / Account / Contact detail. (`PhoneRow.jsx`,
  `NavigateLink.jsx`, `mapsHref`/`smsHref`)
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
- **Accessibility (dark mode + high-contrast + font scaling)** — Settings already has
  Appearance (System / Light / Dark) and Accessibility (High contrast, Text size
  Normal / Large / Larger). Built on `theme.js`.

---

## Ready (first wave — small, grounded)

- **Last-sync visibility** — show last backup/sync date-time; warn in-app if stale; surface
  "cloud sync" as a global action on Home. **(S)** — extends `backup.js` / `BackupReminder.jsx`.
- **Per-field help text** — short hints explaining where each field lands on the PDF. **(S)**

---

## Needs brainstorm (bigger bets)

- **Catalog-linked template line items** — template items currently free-form
  `{description, qty, unitPrice}`; normalize to `{catalogItemId, qty}` + a price snapshot so
  templates draw from the Parts & Labor catalog. **(L)** — reuse `CatalogPicker.jsx`;
  "think SF data model."
- **Work type on each WO row** — show the work type used, per row. **(S — dependency now
  met)** — WO already records `workTypeId`; this is just rendering it in `OrderRow`.
- **Estimate → Bill conversion + win-rate** — a "Convert estimate to bill" action; Reports
  shows estimates sent vs. converted. **(M)** — `isEstimate` already exists in the PDF path.
- **Account/CRM conveniences** — Saved List Views (named status+date+query combos); default
  work type per Account; "Repeat last job" (clone previous WO); first-run onboarding
  checklist; validation-rule toggles (require photo before completing / signature before
  paid); required-contact warning before billing. **(M each)**
- **Tighter backup reminder** — configurable interval (today fixed at 14 days in
  `BackupReminder.jsx`); the original ask was every 2/6 hours. **(S)**

---

## Parking lot (raw — triage before building)

- Truck/Vehicle info section on the WO (Make / Model). Note: `unitNumber` already exists on
  the WO — only Make/Model would be new.
- Customer reference number field — ⚠️ likely done: `referenceNumber` already exists on the
  WO (separate from the internal bill #). Verify before building.
- Auto-save with undo **or** an unsaved-changes warning when editing a WO (admin toggle to
  turn the warning off). Note: `autosave.js` / `useAutosave.js` already exist — check what
  they cover before building.
- Google Maps API key (available) for richer address autocomplete. Note: there is
  in-progress address-autocomplete work (`addrProvider.js`, `googlePlaces.js`,
  `AddressAutocomplete.jsx`) — reconcile with that first.
