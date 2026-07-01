# Mileage tracking & auto-billing — design

**Date:** 2026-06-30
**Roadmap item:** Expands "Google Maps API key (available) for richer address autocomplete" (Parking lot) — the first Maps-platform feature beyond autocomplete/embed/deep-links. Chosen direction: **Mileage log for taxes**.

## Goal

Compute round-trip driving distance from the shop to each job, cache it on the work order,
display it on the WO screens, auto-seed a billable **Mileage** line on the bill (retiring the
manual catalog "Mileage" product), and total driven miles in Reports for tax records.

## Decisions (from brainstorm)

1. **Google driving distance, cached.** Use the Maps JS `DistanceMatrixService` (driving mode)
   for real road miles. Compute when the job location is set/changed; cache `roundTripMiles`
   on the WO. Offline/failure keeps the cached value and never blocks a save. Cost at ~100
   WOs/mo is effectively $0 (well under the free tier).
2. **Round trip from shop.** Distance is one-way road miles × 2, rounded to 0.1.
3. **Shop origin precedence.** `shopLat`+`shopLng` on the business profile (if *both* set)
   trump the profile `address`. The coordinates are for accuracy only and **never render on
   the Bill of Sale PDF**.
4. **Settings rate.** A single `mileageRate` ($/mile) on the business profile. Line is
   `qty = roundTripMiles`, `unitPrice = mileageRate`.
5. **Billed line seeded once, then yours.** The Mileage line is appended to the bill the first
   time it is assembled from the WO (guarded by a `mileageBilled` flag), independent of work
   type. After that it is a normal editable line — recalculated miles do not touch it.
6. **Reports + CSV.** A "Business mileage" section (This month / YTD totals of `roundTripMiles`
   by service date) plus a `roundTripMiles` column in the CSV export.
7. **Schemaless — no `db.version` bump.** All new fields are additive, like ratings/payments.

## Data model (additive, no migration)

```js
// businessProfile (single 'profile' row) — new optional fields:
{ mileageRate: 0.70, shopLat: 42.8864, shopLng: -78.8784 }

// workOrder — new fields:
{ roundTripMiles: 24.8, mileageBilled: true }
```

- `mileageRate` unset → miles still computed/displayed, but no billed line is seeded.
- `shopLat`/`shopLng` unset → origin falls back to the profile `address` string.
- `roundTripMiles` unset → WO shows "—"; no billed line.

## Distance helper — `src/lib/mileage.js`

Pure, unit-testable parts (node harness) + one impure API call.

- `resolveOrigin(profile)` → `{ lat, lng }` when both shop coords set, else
  `{ text: profile.address }` when address non-empty, else `null`. **Pure.**
- `resolveDest(location)` → `{ lat, lng }` when WO `location.lat/lng` set, else
  `{ text }` when location text non-empty, else `null`. **Pure.**
- `roundTrip(oneWayMiles)` → `Math.round(oneWayMiles * 2 * 10) / 10`. **Pure.**
- `computeRoundTripMiles({ origin, dest })` → number | null. **Impure:** loads the Maps JS
  `routes` library via the existing injector in `googlePlaces.js` (extended to also
  `importLibrary('routes')`), calls `DistanceMatrixService.getDistanceMatrix` in `DRIVING`
  mode, converts meters→miles, returns `roundTrip(oneWay)`. Returns `null` on any failure
  (offline, bad key, no route, `ZERO_RESULTS`) so callers keep the cached value.

Origin/dest each accept `{lat,lng}` or `{text}`; the service geocodes text internally, so an
address-only shop or job still works.

## Wiring

**`googlePlaces.js`** — extend `loadPlaces` (rename intent kept) so callers can obtain the
`routes` library alongside `places`; no change to the existing autocomplete path.

**`WorkOrderNew.jsx` / `WorkOrderDetail.jsx`** — after a job location is picked/changed (the
existing `onPick` / Shop button, and location edits on Detail), and when online, call
`computeRoundTripMiles(resolveOrigin(profile), resolveDest(location))`; persist
`roundTripMiles` on the WO. Display "Round trip from shop: **N mi**" near `LocationMap`
(both screens). Show "—" when unset. Detail must load `getProfile` (New already does).

**`BillEditor.jsx`** — when assembling a fresh bill from the WO's `templateItems` and the WO's
`mileageBilled` is false: if `roundTripMiles > 0` and `mileageRate` is set, append
`{ description: 'Mileage', qty: roundTripMiles, unitPrice: mileageRate }` and set the WO's
`mileageBilled = true`. Existing bills (`bill.lineItems` present) are never re-seeded. Once
seeded the line is ordinary — editable, removable, unaffected by later recomputes.

**`Settings.jsx`** (Business profile section) — add `Mileage rate ($/mi)` and an optional
`Shop coordinates (lat, lng)` pair, with a hint that coordinates override the address for
mileage accuracy and never appear on the PDF.

**`Reports.jsx`** — add a "Business mileage" section summing `roundTripMiles` across WOs whose
service date falls in This month / YTD; add `roundTripMiles` to `exportCsv`.

## Error handling & edges

- Offline / no key / no route → `computeRoundTripMiles` returns `null`; the WO keeps its last
  cached value (or "—"). Saving a WO never blocks on mileage.
- No origin (no shop coords and blank address) or no dest → no computation, "—", no error.
- No `mileageRate` → miles tracked and displayed, but no billed line seeded.
- Recompute after the bill line exists does not alter the line (decision 5).

## Testing

- `mileage.js` pure functions (`resolveOrigin`, `resolveDest`, `roundTrip`) — unit tests for
  coord-over-text precedence, empty inputs → null, and round-trip doubling/rounding.
- `DistanceMatrixService` call, Settings fields, WO display, bill seeding, and the Reports
  section — hand-verified in-app (canvas/DOM/Maps paths are outside the node harness).

## Non-goals

- No map view, route optimization, geocoding of accounts, or per-leg trip logging — those are
  separate roadmap directions.
- No automatic re-billing when miles change after the line is seeded.
- Billing the customer for mileage while also recording it as a business-mileage deduction is
  the operator's accounting choice; Reports totals *driven* miles regardless of billing.
