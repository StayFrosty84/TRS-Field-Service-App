# Onboarding — get productive in 10 minutes

A free, offline-first **PWA** for a sole-proprietor field-service operator: log work orders
on-site, generate signed Bill of Sale PDFs, keep a lightweight CRM. All data lives on the
device — no backend, no login. See the [README](../README.md) for the full feature list.

## Run it

```bash
npm install
npm run icons   # one-time: generates PWA icons from public/icons/favicon.svg
npm run dev     # open the printed URL; use device mode in DevTools to emulate a phone
npm test        # vitest run
```

> **Test environment is `node`** — there is no `canvas`/`Image`. Only pure JS is
> unit-testable (e.g. `fitDimensions`, `mapsHref`, `workFilter`). Canvas/DOM paths
> (`compressForPdf`, PDF rendering) are verified by hand or via the sample-bill preview.

## Architecture map

Offline-first React PWA. No server. Storage is **Dexie (IndexedDB)**, migrations v1–v3.

Data model chain:

```
businessProfile → accounts → contacts → workOrders → { photos, billsOfSale }
                  catalogItems        workTypes (templates w/ embedded line items)
```

Where things live:

- [`src/db/db.js`](../src/db/db.js) — schema, migrations, and all data functions
  (`createWorkOrder`, `saveBill`, `markBillPaid`, `listWorkTypes`, …).
- [`src/lib/`](../src/lib/) — pure/helper logic: `pdf.js` (Bill of Sale generation),
  `image.js` (photo compression for the PDF), `maps.js` (`mapsHref` directions link),
  `format.js`, `salesTax.js`, `unpaid.js`, `workFilter.js`, `backup.js`,
  `autosave.js`/`useAutosave.js`.
- [`src/pages/`](../src/pages/) — screens: `Home` (dashboard), `Work` (WO list),
  `WorkOrderNew`/`WorkOrderDetail`, `BillEditor`, `Accounts`/`Contacts` + detail/forms,
  `Reports`, `Settings`.
- [`src/components/`](../src/components/) — shared UI (e.g. `BackupReminder`,
  `WorkTypeManager`, `CatalogPicker`, `Icon`).

## How we work

Changes go through the superpowers/compound-engineering loop:

`ce-brainstorm` → `writing-plans` → `subagent-driven-development` →
`finishing-a-development-branch`.

Artifacts are committed to the repo: design specs in
[`docs/superpowers/specs/`](superpowers/specs/), implementation plans in
[`docs/superpowers/plans/`](superpowers/plans/).

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) — TL;DR: `git push trs main` deploys `/beta/`; a full
GitHub Release updates `/stable/`.

## What to build next

The prioritized backlog (with effort sizing and grounding notes) is in
[ROADMAP.md](ROADMAP.md).
