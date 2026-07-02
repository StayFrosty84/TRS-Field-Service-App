# Roadmap

Single source of truth for improvement ideas. Merged from the old `AlexNotes.md`, the
root `Update the auto complete address to focu.md`, and the prior ideation backlog.

## How to execute

Pick any item under **Ready** and tell Claude `do <item>`. It runs the standard loop —
`ce-brainstorm` → `writing-plans` → `subagent-driven-development` — exactly like the PDF
work, and ships per [DEPLOYMENT.md](DEPLOYMENT.md). Items under **Needs brainstorm** are
bigger; they get their own brainstorm to define scope before planning.

**Moving an item to ✅ Shipped is the last step** — do it only after the work is built,
verified, and deployed, never before. See [ONBOARDING.md](ONBOARDING.md#how-we-work).

Each item: title — **priority** — one-line mechanic — **(size S/M/L)** — grounding (files/helpers to reuse).

**Priority** (set 2026-07-01, owner's call): 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low.
Critical = blocks money, compliance, or data integrity. High = directly helps get paid or
saves time on every job. Medium = useful, cheap quality-of-life. Low = polish or niche; fine
to defer.

---

## ✅ Shipped

**Channel labels:** each item notes where it's live — **Beta** = on `/beta/` only;
**Stable vX.Y.Z** = promoted to `/stable/` (and therefore also on beta). As of **v3.4.0
(2026-07-01)** beta and stable are at full parity; older items below predate the label and are
all on stable. At-a-glance feature list: [CURRENT_STATE.md](CURRENT_STATE.md).

- **Mile-marker search (NY interstates) — Stable v3.4.0 · 2026-07-01** — set a WO location by interstate +
  mile marker, fully offline. An **Address | Mile marker** toggle on the WO location field
  (both New and Detail) swaps the address autocomplete for a route picker + marker-number
  input; matches show an enriched label (e.g. `I-90 MM 436.0 · Thruway Mainline · near
  Hamburg`) and, on pick, emit the same `{label, lat, lng}` as an address so Navigate, the map
  embed, and round-trip mileage work unchanged. Data is a build-time-bundled ~6,900-marker
  JSON (NY Thruway posted mileposts at tenth precision + NYSDOT-derived whole-mile interstate
  points, town-enriched from the Census gazetteer), loaded via dynamic import so it's precached
  for offline. Regenerate with `npm run build:mile-markers`. (`scripts/buildMileMarkers.mjs`,
  `src/data/mileMarkers.json`, `mileMarkers.js`, `MileMarkerPicker.jsx`, `LocationInput.jsx`,
  `WorkOrderNew.jsx`, `WorkOrderDetail.jsx`) 📄 Spec:
  [specs/2026-07-01-mile-marker-search-design.md](superpowers/specs/2026-07-01-mile-marker-search-design.md)
  · Plan: [plans/2026-07-01-mile-marker-search.md](superpowers/plans/2026-07-01-mile-marker-search.md)
- **Asset / truck tracking — Stable v3.4.0 · 2026-07-01** — per-account trucks/equipment. New `assets` table
  (`db.version(7)`, additive) with make/model/year/unit #/plate/VIN/mileage/notes; a "Trucks /
  Equipment" section on Account detail (mirrors contacts); asset form/detail pages with derived
  **Past jobs** (`assetHistory`). Work orders gain an account-filtered **asset picker** on New
  and Detail that snapshots the asset's unit # onto the WO — so deleting an asset never corrupts
  a past WO or its PDF (dangling link shows "(asset removed)", the unit # snapshot survives).
  Registered for sync + backup. VIN **barcode scan** (`BarcodeDetector`, Code 39) where the
  browser supports it (Android Chrome); manual entry everywhere else — verify on-device, revert
  that commit alone if unreliable. Unblocks recurring maintenance jobs. (`assets.js`,
  `VinScanButton.jsx`, `AssetForm.jsx`, `AssetDetail.jsx`, `db.js`, `WorkOrderNew.jsx`,
  `WorkOrderDetail.jsx`, `AccountDetail.jsx`) 📄 Spec:
  [specs/2026-06-30-assets-maintenance-plans-design.md](superpowers/specs/2026-06-30-assets-maintenance-plans-design.md)
  · Plan: [plans/2026-07-01-asset-tracking.md](superpowers/plans/2026-07-01-asset-tracking.md)
- **Google Drive sync — Stable v3.4.0 · 2026-07-01 (previously beta-only)** — optional cloud
  backup/restore and multi-device sync through the user's own Google Drive (OAuth PKCE, no
  server). Held beta-only through v3.3.0 and promoted to stable in v3.4.0. (`src/lib/sync/*`,
  `CloudSync.jsx`)
- **Quick-wins wave — Stable v3.4.0 · 2026-07-01** — (1) account name (24px/700) and contact name (20px/600)
  now anchor the WO detail screen; (2) one-tap **Duplicate** on each bill line inserts an
  independent copy below it; (3) bill/estimate shares pre-fill the email/text body from an
  editable Settings template (Business profile → Share message) with `{accountName}`,
  `{docType}`, `{docNumber}`, `{total}`, `{businessName}` placeholders — default ships,
  blank restores it, message stays editable in the mail app. (`shareMessage.js` + tests,
  `Settings.jsx`, `BillEditor.jsx`, `WorkOrderDetail.jsx`) 📄 Spec:
  [specs/2026-07-01-quick-wins-design.md](superpowers/specs/2026-07-01-quick-wins-design.md)
- **Catalog-linked work-type templates** — work-type template line items now reference the
  Parts & Labor catalog by id (pure reference; name/price resolve live from one place).
  Legacy free-form rows still work. Add products to a work type via the catalog picker or a
  new inline "New item" (auto-saved to the catalog); assign one product to many work types
  from a new product edit sheet (which also renames/reprices). Deleting a referenced product
  is blocked with the work-type list. Selecting a work type on a new WO snapshots resolved
  prices, so historical bills stay frozen. Also: **clone work type**. No migration —
  additive; row shape is `{catalogItemId, qty}` or legacy `{description, qty, unitPrice}`.
  (`templateItems.js`, `db.js`, `WorkTypeManager.jsx`, `CatalogManager.jsx`, `WorkOrderNew.jsx`)
- **Admin-editable picklists** — payment methods, phone labels, and account terms are
  admin-managed from Settings → Lists & templates via a generic `lists` table (`db.version(6)`)
  + a shared `ListManager` editor and `ListPicker`. Records store values by name (no
  migration; deleting a value never orphans data). The Do-not-service warning moved to a
  dedicated account `doNotService` flag (legacy `terms === 'Do-not-service'` still honored).
  Stages intentionally kept in their own table. (`db.js`, `ListManager.jsx`, `ListPicker.jsx`)
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

- **Last-sync visibility** — 🔴 **Critical** — show last backup/sync date-time; warn in-app if stale; surface
  "cloud sync" as a global action on Home. **(S)** — extends `backup.js` / `BackupReminder.jsx`.
- **Outstanding-balance warning (configurable threshold)** — 🔴 **Critical** — when an account's total
  outstanding balance exceeds an admin-set threshold (default $1,000), show a warning banner
  both when starting a new WO for that account and on the WO detail screen. **(S)** — reuse
  `accountOutstanding` (per-account balance) and the `accountWarning` banner pattern in
  `unpaid.js`; render alongside the existing 1★ / Do-not-service banner in `WorkOrderNew.jsx`
  and `WorkOrderDetail.jsx`; store the threshold as a Settings value.
- **"Additional info" line on the PDF (e.g. NYSDOT #)** — 🔴 **Critical** — a free-text field on the business
  profile that prints directly **below the seller block** on the Bill of Sale, and **only when
  non-empty** (blank → nothing renders, no label). Lets the user add e.g. a NYSDOT # or license
  number. **(S)** — add schemaless `additionalInfo` to `businessProfile` (no migration); append
  it to the `sellerLines` array in `pdf.js` (it already drops falsy entries and wraps); add a
  text input under Settings → Business profile (`Settings.jsx`, `saveProfile`).
- **Per-field help text** — 🟠 **High** — short hints explaining where each field lands on the PDF. **(S)**
- **Recents on Home** — 🟠 **High** — quick chips linking to recently viewed work orders / accounts.
  **(S)** — `Home.jsx`.
- **Recently viewed (accounts / contacts / work orders)** — 🟠 **High** — track the last-opened records per
  entity and show a "Recently viewed" shortlist at the top of each list tab. **(S)** — record
  id + timestamp when a detail view opens (a small `recents` store or localStorage); render on
  `Accounts.jsx` / `Contacts.jsx` / `Work.jsx`. Broader than **Recents on Home** (Home chips);
  the two should share one tracking source.
- **Account row badges** — 🟡 **Medium** — show outstanding balance, ⭐ rating, and terms flag on each
  Accounts list row (today rows show only name + phone/address). **(S)** — `Accounts.jsx`
  rows + `accountOutstanding` / `rating` (both already exist).
- **Payment-status pill on Work rows** — 🟡 **Medium** — colored paid / partial / unpaid pill per row.
  **(S)** — `Work.jsx` `billByWo` + `payments.js`.
- **Tab badge counts** — 🟡 **Medium** — count of unpaid bills on the Work tab and stuck jobs on Home, shown
  as nav badges. **(S)** — `Layout.jsx` nav; reuse `unpaid.js` and `isStuck` from `stages.js`.
- **Revenue by work type** — 🟡 **Medium** — Reports breakdown of billed/paid by `workTypeId`. **(S)** —
  `Reports.jsx`; WO already records `workTypeId`.
- **Configurable PDF fields (visibility, global)** — 🟡 **Medium** — admin on/off toggles in Settings for each
  optional Bill of Sale field (logo, seller phone/email/address, dates, payments summary,
  contact name/phone/email, Unit #, Reference #, issue, signature, terms/notes, photos); core
  fields (account name, line-items table, totals, bill #) stay always-on. **(M)** — store a
  `pdfFields` boolean map on `businessProfile`; guard each section in `pdf.js` and the
  `infoLines` / `paymentLines` helpers in `pdfText.js`; add a toggle panel under Settings →
  Business profile. Reconcile with **Business logo + custom terms on Bill of Sale PDF**
  (logo/terms visibility overlaps).
- **Aging buckets on unpaid (30/60/90)** — 🟢 **Low** — color-code overdue balances by age on the Home
  unpaid shortlist and Account detail. **(S–M)** — `unpaid.js`, `Home.jsx`.
- **Overdue-to-start flag (+ expected-start date)** — 🟢 **Low** — add an `expectedStartDate` field to the
  WO, then flag jobs whose expected start has passed but aren't started yet (deliberately
  minimal — no Home agenda view). **(S)** — new field in `WorkOrderNew.jsx` / `db.js`; reuse
  the `isStuck` badge pattern from `stages.js`.

---

## Needs brainstorm (bigger bets)

- **Record deduplication on sync** — 🔴 **Critical** — sync creates duplicates because every row's primary key is
  a random per-device UUID (`uid()` in `db.js`) and the merge dedups only by that `id`
  (`merge.js` keys `live` by `table:id`). The same account/contact/WO created on two devices
  gets two UUIDs, so the merge keeps both. Fix: a post-sync reconciler that groups rows by an
  **exact-match business key** — Account by `name`, Contact by `name` + phone — and surfaces
  candidates on a **user-confirmed "possible duplicates" review screen** (no silent merges).
  Confirming a merge keeps one row, repoints children (contacts/assets/WOs → `accountId`;
  bills/photos → `workOrderId`), and tombstones the losers without dropping their edits. WOs
  are **not** keyed on a number (an auto-number is per-device, so it mis-matches unrelated jobs);
  they consolidate via the account/contact cascade + manual review. Separately, add a display-only
  **`WO#-{tag}-{seq}`** job number (device-tagged, unique across devices). **(L)** — steps:
  (1) `dedupe.js` detection over the local DB; (2) review-screen UI; (3) `mergeRecords` reusing
  the `db.js` cascade + tombstone machinery; (4) the `WO#` field (independent, can ship any time). 📄
  Spec: [specs/2026-07-01-record-deduplication-design.md](superpowers/specs/2026-07-01-record-deduplication-design.md).
- **Inline quick-add account/contact from New WO** — 🟠 **High** — create an account/contact on the fly
  inside the WO form instead of navigating to the Accounts tab and back. **(M)** —
  `WorkOrderNew.jsx` pickers; reuse minimal `AccountForm` / `ContactForm` fields.
- **Global search (cross-entity)** — 🟠 **High** — one search box in the top bar spanning work orders,
  accounts, and contacts from any tab (today search is per-list). **(M)** — reuse
  `SearchBar.jsx` / `filterWorkOrders`; `Layout.jsx` topbar is currently empty except Back.
- **Recurring / maintenance jobs (maintenance plans)** — 🟠 **High** — time-only cadence per asset; due plans
  surface on Home ("Maintenance due") for one-tap WO creation (suggest-and-confirm, no silent
  writes); completing the job advances the plan. **(L)** — **dependency now met**: asset tracking
  shipped 2026-07-01, so this is next up. It's slices 3–4 of the same spec; go straight to
  planning. 📄 Spec:
  [specs/2026-06-30-assets-maintenance-plans-design.md](superpowers/specs/2026-06-30-assets-maintenance-plans-design.md).
- **Work type on each WO row** — 🟡 **Medium** — show the work type used, per row. **(S — dependency now
  met)** — WO already records `workTypeId`; this is just rendering it in `OrderRow`.
- **Account/CRM conveniences** — 🟡 **Medium** — Saved List Views (named status+date+query combos); default
  work type per Account; "Repeat last job" (clone previous WO); first-run onboarding
  checklist; validation-rule toggles (require photo before completing / signature before
  paid); required-contact warning before billing. **(M each)**
- **Business logo + custom terms on Bill of Sale PDF** — 🟡 **Medium** — upload a logo and set editable
  footer/terms text that render on the PDF. **(M)** — `pdf.js` layout + `businessProfile`;
  decide logo storage/sizing.
- **PDF layout: relabel + reorder fields** — 🟡 **Medium** — long-term extension of **Configurable PDF fields
  (visibility)**: also rename field labels (e.g. "Unit #" → "Truck #") and reorder sections.
  **(L)** — depends on the visibility item; `pdf.js` draws in a fixed sequence today, so this
  needs a data-driven render loop over a field registry (`{ key, label, order, visible }`) —
  a meaningful refactor of the render path.
- **Estimate → Bill conversion + win-rate** — 🟢 **Low** — a "Convert estimate to bill" action; Reports
  shows estimates sent vs. converted. **(M)** — `isEstimate` already exists in the PDF path.
- **Swipe actions on list rows** — 🟢 **Low** — swipe a row for Call / Navigate / Mark paid. **(M)** —
  `Work.jsx` / `Accounts.jsx` rows; reuse `mapsHref` / `smsHref` and `markBillPaid`.
- **Tighter backup reminder** — 🟢 **Low** — configurable interval (today fixed at 14 days in
  `BackupReminder.jsx`); the original ask was every 2/6 hours. **(S)**

---

## Parking lot (raw — triage before building)

- 🟡 **Medium** — Auto-save with undo **or** an unsaved-changes warning when editing a WO (admin toggle to
  turn the warning off). Note: `autosave.js` / `useAutosave.js` already exist — check what
  they cover before building.
- 🟢 **Low** — Customer reference number field — ⚠️ likely done: `referenceNumber` already exists on the
  WO (separate from the internal bill #). Verify before building.
- 🟢 **Low** — Google Maps API key (available) for richer address autocomplete. Note: there is
  in-progress address-autocomplete work (`addrProvider.js`, `googlePlaces.js`,
  `AddressAutocomplete.jsx`) — reconcile with that first.
- Search mile markers. ✅ **Shipped 2026-07-01** as Mile-marker search (NY interstates) — see
  the Shipped section.
