# Current State — Beta & Stable

One-page snapshot of what's live on each channel. **Update this on every commit** alongside
[ROADMAP.md](ROADMAP.md). For the full backlog and shipped history see the roadmap; for how
channels deploy see [DEPLOYMENT.md](DEPLOYMENT.md).

**Last updated:** 2026-07-01

| Channel | Version | Source | URL |
|---------|---------|--------|-----|
| **Beta** | `3.4.0` (pre-release line) | `trs/main` HEAD | `…/TRS-Field-Service-App/beta/` |
| **Stable** | **`v3.4.0`** | latest full Release (`stable-wave2`) | `…/TRS-Field-Service-App/stable/` |

Base site: `https://stayfrosty84.github.io/TRS-Field-Service-App/`

## Parity status

**Beta and stable are at full feature parity as of v3.4.0 (2026-07-01).** The one feature that
was historically held back (Google Drive sync) has been promoted, so there is currently **no
beta-only feature**. New work lands on beta first and is promoted to stable per the roadmap.

## Feature set (both channels)

Field-service PWA — offline-first, IndexedDB (Dexie), installable. Current capabilities:

- **Work orders** — configurable stage pipeline (Open → Scheduled → In progress → Completed →
  Invoiced → Paid), stuck-job flagging, per-WO asset + work-type snapshots.
- **Accounts & contacts** — ratings (1–5★), terms/flags (COD/Net-30/Prepay/Do-not-service),
  per-account outstanding rollup, trucks/equipment section.
- **Billing & PDF** — Bill of Sale PDF, partial payments + balance due, duplicate bill line,
  photo compression, editable share-message template.
- **Mileage** — round-trip miles per WO, business mileage rate + shop coords, billable Mileage
  line, Reports mileage totals + CSV. *(stable since v3.3.0)*
- **Mile-marker search** — set a WO location by NY interstate + mile marker, fully offline
  (~6,900-marker bundled dataset; WNY-first route picker). *(v3.4.0)*
- **Asset / truck tracking** — per-account assets with service history, VIN barcode scan where
  supported, unit-# snapshot onto work orders. *(v3.4.0)*
- **Google Drive sync** — optional cloud backup/restore + multi-device sync via the user's own
  Drive (OAuth PKCE, no server). *(promoted to stable in v3.4.0)*
- **Reports** — quarterly/YTD sales-tax summary, revenue views, "who owes me money" shortlist.
- **Admin** — editable picklists, work-type templates (catalog-linked), collapsible Settings,
  accessibility (dark mode, high-contrast, font scaling).

## Next up

See [ROADMAP.md](ROADMAP.md) — highest-priority open items include record deduplication on
sync (🔴), outstanding-balance warnings (🔴), and the "Additional info" PDF line (🔴).
