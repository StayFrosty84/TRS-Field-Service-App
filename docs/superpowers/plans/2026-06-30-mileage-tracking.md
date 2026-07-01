# Mileage Tracking & Auto-Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute round-trip driving distance from the shop to each job, cache it on the work order, display it on the WO screens, auto-seed a billable Mileage line on the bill, and total driven miles in Reports.

**Architecture:** A new pure/impure helper module `src/lib/mileage.js` resolves origin (shop coords → address) and destination (WO coords → text) and calls the Maps JS `DistanceMatrixService` (driving) via the existing script loader in `googlePlaces.js`. Results are cached as `roundTripMiles` on the work order (schemaless, no migration). The WO screens display and persist it; `BillEditor` seeds a one-time Mileage line; `Reports` totals it.

**Tech Stack:** React (Vite), Dexie/IndexedDB, Vitest (node env), Google Maps JavaScript API (client-side, bring-your-own-key).

## Global Constraints

- **No `db.version` bump** — all new fields (`mileageRate`, `shopLat`, `shopLng` on `businessProfile`; `roundTripMiles`, `mileageBilled` on `workOrders`) are additive/schemaless.
- **Client-only, BYO key** — reuse the runtime key from `getGoogleKey()` (localStorage, device-only); never persist the key to the profile or backup.
- **Offline-first** — `computeRoundTripMiles` returns `null` on any failure (offline, no key, no route); callers keep the cached value and never block a save.
- **Test env is `node`** — only pure JS is unit-testable. Distance-Matrix / DOM / React paths are hand-verified.
- **Shop coords never render on the PDF** — they are inputs to mileage only.
- Miles are one-way road miles × 2, rounded to 0.1.
- Test command: `npm test` (vitest run). Build: `npm run build`.

---

### Task 1: Pure mileage helpers

**Files:**
- Create: `src/lib/mileage.js`
- Test: `src/lib/mileage.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `milesFromMeters(meters: number) => number`
  - `roundTrip(oneWayMiles: number) => number` (× 2, rounded to 0.1)
  - `resolveOrigin(profile) => {lat,lng} | {text} | null`
  - `resolveDest(location) => {lat,lng} | {text} | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/mileage.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { milesFromMeters, roundTrip, resolveOrigin, resolveDest } from './mileage.js';

describe('milesFromMeters', () => {
  it('converts meters to miles', () => {
    expect(milesFromMeters(1609.344)).toBeCloseTo(1, 5);
  });
});

describe('roundTrip', () => {
  it('doubles one-way miles and rounds to 0.1', () => {
    expect(roundTrip(12.37)).toBe(24.7);
    expect(roundTrip(0)).toBe(0);
  });
});

describe('resolveOrigin', () => {
  it('prefers shop coordinates when both are set', () => {
    expect(resolveOrigin({ shopLat: 42.9, shopLng: -78.8, address: '1 Main St' }))
      .toEqual({ lat: 42.9, lng: -78.8 });
  });
  it('falls back to a non-empty address', () => {
    expect(resolveOrigin({ address: '1 Main St' })).toEqual({ text: '1 Main St' });
  });
  it('returns null when neither coordinates nor address are usable', () => {
    expect(resolveOrigin({ address: '   ' })).toBeNull();
    expect(resolveOrigin(null)).toBeNull();
    expect(resolveOrigin({ shopLat: 42.9 })).toEqual(null); // needs BOTH lat and lng
  });
});

describe('resolveDest', () => {
  it('prefers location coordinates', () => {
    expect(resolveDest({ lat: 1, lng: 2, text: 'x' })).toEqual({ lat: 1, lng: 2 });
  });
  it('falls back to non-empty text', () => {
    expect(resolveDest({ text: '123 Oak Ave' })).toEqual({ text: '123 Oak Ave' });
  });
  it('returns null when empty', () => {
    expect(resolveDest({ text: '  ' })).toBeNull();
    expect(resolveDest(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/mileage.test.js`
Expected: FAIL — cannot resolve `./mileage.js`.

- [ ] **Step 3: Write the pure helpers**

Create `src/lib/mileage.js` (only the pure helpers for now — the impure `computeRoundTripMiles` is added in Task 2):

```js
// Round-trip mileage from the shop to a job. Pure resolvers here are unit-tested;
// computeRoundTripMiles (Task 2) is the impure Distance Matrix call.

// Distance Matrix returns meters regardless of unit system.
export function milesFromMeters(meters) {
  return meters / 1609.344;
}

// One-way road miles → round trip, rounded to a tenth of a mile.
export function roundTrip(oneWayMiles) {
  return Math.round(oneWayMiles * 2 * 10) / 10;
}

// Shop origin: explicit coordinates win over the typed address. Returns null when
// there is nothing routable (no coords AND blank address).
export function resolveOrigin(profile) {
  if (!profile) return null;
  if (profile.shopLat != null && profile.shopLng != null) {
    return { lat: profile.shopLat, lng: profile.shopLng };
  }
  const addr = (profile.address || '').trim();
  return addr ? { text: addr } : null;
}

// Job destination: picked coordinates win over the typed location text.
export function resolveDest(location) {
  if (!location) return null;
  if (location.lat != null && location.lng != null) {
    return { lat: location.lat, lng: location.lng };
  }
  const text = (location.text || '').trim();
  return text ? { text } : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/mileage.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mileage.js src/lib/mileage.test.js
git commit -m "feat(mileage): pure origin/dest/round-trip helpers"
```

---

### Task 2: Distance Matrix loader + compute

**Files:**
- Modify: `src/lib/googlePlaces.js` (split the script bootstrap from `importLibrary`, add `loadRoutes`)
- Modify: `src/lib/mileage.js` (add `computeRoundTripMiles`)

**Interfaces:**
- Consumes: `getGoogleKey()` from `addrProvider.js`; `loadRoutes(key)` from `googlePlaces.js`; `resolveOrigin`, `resolveDest`, `milesFromMeters`, `roundTrip` from Task 1.
- Produces: `loadRoutes(key: string) => Promise<google.maps routes library>`; `computeRoundTripMiles(origin, dest) => Promise<number | null>`.

This task is hand-verified (the Distance Matrix call needs a browser + key; the pure conversion it relies on is already tested in Task 1).

- [ ] **Step 1: Refactor the loader in `googlePlaces.js`**

Replace the existing `loadPlaces` function (currently a single `loaderPromise` that injects the script and imports `places`) with a shared bootstrap plus two library loaders:

```js
let bootstrapPromise = null;
let sessionToken = null;

// Inject the Maps JS bootstrap once with the runtime key. Idempotent across callers.
function ensureMaps(key) {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.importLibrary) return resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      key
    )}&libraries=places,routes&v=weekly&loading=async`;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      bootstrapPromise = null; // let a later attempt retry after a transient failure
      reject(new Error('Failed to load Google Maps'));
    };
    document.head.appendChild(s);
  });
  return bootstrapPromise;
}

function loadPlaces(key) {
  return ensureMaps(key).then(() => window.google.maps.importLibrary('places'));
}

// Routes library exposes DistanceMatrixService — used for round-trip mileage.
export function loadRoutes(key) {
  return ensureMaps(key).then(() => window.google.maps.importLibrary('routes'));
}
```

The rest of `googlePlaces.js` (`placeToResult`, `fetchSuggestions`, `resolvePick`) is unchanged — they already call `loadPlaces(key)`.

- [ ] **Step 2: Add `computeRoundTripMiles` to `mileage.js`**

Append to `src/lib/mileage.js`:

```js
import { getGoogleKey } from './addrProvider.js';
import { loadRoutes } from './googlePlaces.js';

// {lat,lng} → a LatLng; {text} → the address string (Distance Matrix geocodes it).
function toWaypoint(maps, p) {
  return p.lat != null ? new maps.LatLng(p.lat, p.lng) : p.text;
}

// Driving round-trip miles between origin and dest, or null on any failure so the
// caller keeps whatever it had cached. Online + a Google key are required.
export async function computeRoundTripMiles(origin, dest) {
  if (!origin || !dest) return null;
  const key = getGoogleKey();
  if (!key) return null;
  try {
    await loadRoutes(key);
    const maps = window.google.maps;
    const service = new maps.DistanceMatrixService();
    const res = await service.getDistanceMatrix({
      origins: [toWaypoint(maps, origin)],
      destinations: [toWaypoint(maps, dest)],
      travelMode: maps.TravelMode.DRIVING,
    });
    const el = res?.rows?.[0]?.elements?.[0];
    if (!el || el.status !== 'OK') return null;
    return roundTrip(milesFromMeters(el.distance.value));
  } catch {
    return null;
  }
}
```

Put the two `import` lines at the TOP of `mileage.js` (with the file's other imports), not mid-file.

- [ ] **Step 3: Verify the existing autocomplete still builds and tests pass**

Run: `npm test`
Expected: PASS (Task 1 tests + existing `googlePlaces.test.js` still green — its `placeToResult` test does not touch the loader).

Run: `npm run build`
Expected: build succeeds (no unresolved imports).

- [ ] **Step 4: Hand-verify the Distance Matrix call**

With Google enabled + a valid key in Settings, in the running app (Task 4 wires the UI). For now confirm the module imports cleanly. Full runtime check happens in Task 4's hand-verify.

- [ ] **Step 5: Commit**

```bash
git add src/lib/googlePlaces.js src/lib/mileage.js
git commit -m "feat(mileage): Distance Matrix loader and computeRoundTripMiles"
```

---

### Task 3: Business-profile mileage settings

**Files:**
- Modify: `src/pages/Settings.jsx` (form state `EMPTY`, load effect, `saveProfileForm`, Business profile section JSX)

**Interfaces:**
- Consumes: `saveProfile` (already imported).
- Produces: `businessProfile.mileageRate` (number), `businessProfile.shopLat` (number|undefined), `businessProfile.shopLng` (number|undefined).

Hand-verified (React form).

- [ ] **Step 1: Extend the form's `EMPTY` shape**

In `src/pages/Settings.jsx`, add three keys to the `EMPTY` object (after `billTerms: ''`):

```js
  billTerms: '',
  mileageRate: '',
  shopLat: '',
  shopLng: '',
};
```

- [ ] **Step 2: Populate them in the load effect**

In the `useEffect` that calls `getProfile().then((p) => { ... setForm({ ... }) })`, add to the `setForm` object (after the `billTerms` line):

```js
          billTerms: p.billTerms || '',
          mileageRate: p.mileageRate != null ? String(p.mileageRate) : '',
          shopLat: p.shopLat != null ? String(p.shopLat) : '',
          shopLng: p.shopLng != null ? String(p.shopLng) : '',
```

- [ ] **Step 3: Persist them in `saveProfileForm`**

In `saveProfileForm`, extend the `saveProfile({ ... })` call. Empty coordinate fields must save as `undefined` (not `0`) so a blank shop lat/lng does not read as valid coordinates:

```js
  async function saveProfileForm() {
    const num = (v) => (String(v).trim() === '' ? undefined : Number(v));
    await saveProfile({
      ...form,
      ccFeeRate: Number(form.ccFeeRate) || 0,
      taxRate: Number(form.taxRate) || 0,
      mileageRate: Number(form.mileageRate) || 0,
      shopLat: num(form.shopLat),
      shopLng: num(form.shopLng),
      logoBlob,
    });
    toast('Profile saved');
  }
```

- [ ] **Step 4: Add the fields to the Business profile section**

In the `<Section id="profile" title="Business profile">` block, after the Address `<textarea>` (`<textarea value={form.address} onChange={set('address')} />`), add:

```jsx
        <label>Mileage rate ($/mi)</label>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={form.mileageRate}
          onChange={set('mileageRate')}
        />

        <label>Shop coordinates (optional)</label>
        <div className="row" style={{ gap: 12 }}>
          <input
            style={{ flex: 1 }}
            type="number"
            inputMode="decimal"
            step="0.000001"
            placeholder="Latitude"
            value={form.shopLat}
            onChange={set('shopLat')}
          />
          <input
            style={{ flex: 1 }}
            type="number"
            inputMode="decimal"
            step="0.000001"
            placeholder="Longitude"
            value={form.shopLng}
            onChange={set('shopLng')}
          />
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Coordinates override the address for mileage accuracy. They never appear on the Bill of Sale.
        </p>
```

- [ ] **Step 5: Verify build and hand-check**

Run: `npm run build`
Expected: build succeeds.

Hand-verify: open Settings → Business profile, set a Mileage rate and (optionally) coordinates, Save, reload — values persist.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Settings.jsx
git commit -m "feat(mileage): business-profile mileage rate and shop coordinates"
```

---

### Task 4: WorkOrderNew — compute, display, persist

**Files:**
- Modify: `src/pages/WorkOrderNew.jsx`

**Interfaces:**
- Consumes: `computeRoundTripMiles`, `resolveOrigin`, `resolveDest` from `mileage.js`; `profile` (already from `useLiveQuery(getProfile)`).
- Produces: `workOrder.roundTripMiles` (number) written by `createWorkOrder`.

Hand-verified (React + network).

- [ ] **Step 1: Import the helpers and add mileage state**

At the top of `src/pages/WorkOrderNew.jsx`, add the import:

```js
import { computeRoundTripMiles, resolveOrigin, resolveDest } from '../lib/mileage.js';
```

Add state near the other `useState` hooks (e.g. after `const [gps, setGps] = useState(draft?.gps || null);`):

```js
  const [miles, setMiles] = useState(draft?.miles ?? null);
```

Add `miles` to the `draftData` object so it survives a reload:

```js
    gps,
    miles,
    serviceDate,
```

- [ ] **Step 2: Add a recompute helper**

Add inside the component (near `useShopAddress`):

```js
  // Recompute round-trip miles from the shop to a job location. Silent on failure /
  // offline — we just keep whatever we had. Not awaited by callers.
  async function recomputeMiles(location) {
    const origin = resolveOrigin(profile);
    const dest = resolveDest(location);
    if (!origin || !dest || !navigator.onLine) return;
    const m = await computeRoundTripMiles({ origin, dest });
    if (m != null) setMiles(m);
  }
```

- [ ] **Step 3: Trigger recompute when the location changes**

In the `AddressAutocomplete` `onPick` handler, after setting text/gps, recompute with the picked coordinates:

```jsx
        onPick={({ label, lat, lng }) => {
          setLocationText(label);
          const g = lat != null && lng != null ? { lat, lng } : null;
          setGps(g);
          recomputeMiles({ text: label, ...(g || {}) });
        }}
```

In `useShopAddress`, after `setGps(null)`, clear miles (shop-to-shop is zero and not billable):

```js
    setLocationText(addr);
    setGps(null);
    setMiles(0);
```

Note: a picked address recomputes immediately via `onPick`; a *typed-only* address (no coordinates) is computed authoritatively at save time in Step 4. No blur handler is needed.

- [ ] **Step 4: Compute at save and persist `roundTripMiles`**

In `save()`, replace the `createWorkOrder({ ... })` call so mileage is computed authoritatively from the final location before the record is written:

```js
      const finalLocation = { text: locationText.trim(), ...(gps || {}) };
      let finalMiles = miles;
      if (navigator.onLine) {
        const m = await computeRoundTripMiles({ origin: resolveOrigin(profile), dest: resolveDest(finalLocation) });
        if (m != null) finalMiles = m;
      }

      const woId = await createWorkOrder({
        accountId: acctId,
        contactId: ctctId || null,
        location: finalLocation,
        roundTripMiles: finalMiles ?? undefined,
        serviceDate: fromDateInput(serviceDate) || Date.now(),
        issue: issue.trim(),
        unitNumber: unitNumber.trim(),
        referenceNumber: referenceNumber.trim(),
        isEstimate,
        workTypeId: workTypeId || null,
        templateItems: resolveTemplateItems(
          workTypes.find((w) => w.id === workTypeId)?.items || [],
          new Map(catalog.map((c) => [c.id, c]))
        ).map(({ description, qty, unitPrice }) => ({ description, qty, unitPrice })),
      });
```

- [ ] **Step 5: Display the mileage**

Immediately after the `<LocationMap ... />` element, add:

```jsx
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        Round trip from shop: {miles != null ? `${miles} mi` : '—'}
      </p>
```

- [ ] **Step 6: Verify build and hand-check**

Run: `npm run build`
Expected: build succeeds.

Hand-verify (Google enabled + key + a Mileage rate set): create a WO, pick an address → "Round trip from shop: N mi" appears; save; reopen the WO → the value is stored (visible again in Task 5).

- [ ] **Step 7: Commit**

```bash
git add src/pages/WorkOrderNew.jsx
git commit -m "feat(mileage): compute and display round-trip miles on new work orders"
```

---

### Task 5: WorkOrderDetail — load profile, compute, display, persist

**Files:**
- Modify: `src/pages/WorkOrderDetail.jsx`

**Interfaces:**
- Consumes: `computeRoundTripMiles`, `resolveOrigin`, `resolveDest` from `mileage.js`; `getProfile`, `updateWorkOrder` (updateWorkOrder already imported).
- Produces: updates `workOrder.roundTripMiles`.

Hand-verified.

- [ ] **Step 1: Imports and profile load**

At the top of `src/pages/WorkOrderDetail.jsx`, add:

```js
import { computeRoundTripMiles, resolveOrigin, resolveDest } from '../lib/mileage.js';
```

Ensure `getProfile` is in the `../db/db.js` import list (add it if absent). Add a profile query alongside the other `useLiveQuery` calls (near `const workTypes = useLiveQuery(listWorkTypes) || [];`):

```js
  const profile = useLiveQuery(getProfile);
```

- [ ] **Step 2: Add mileage state seeded from the order**

Add state near the other `useState` hooks (e.g. after `const [gps, setGps] = useState(null);`):

```js
  const [miles, setMiles] = useState(null);
```

In the load effect (`if (data?.order && !loaded) { ... }`), seed it from the stored value:

```js
      setReferenceNumber(data.order.referenceNumber || '');
      setMiles(data.order.roundTripMiles ?? null);
      setLoaded(true);
```

- [ ] **Step 3: Recompute + persist when the location is picked**

In the `AddressAutocomplete` `onPick` handler, recompute and persist:

```jsx
        onPick={({ label, lat, lng }) => {
          setLocationText(label);
          const g = lat != null && lng != null ? { lat, lng } : null;
          setGps(g);
          if (navigator.onLine) {
            computeRoundTripMiles({ origin: resolveOrigin(profile), dest: resolveDest({ text: label, ...(g || {}) }) })
              .then((m) => {
                if (m != null) {
                  setMiles(m);
                  updateWorkOrder(id, { roundTripMiles: m });
                }
              });
          }
        }}
```

- [ ] **Step 4: Display the mileage**

Immediately after the `<LocationMap ... />` element (before `<NavigateLink ... />`), add:

```jsx
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        Round trip from shop: {miles != null ? `${miles} mi` : '—'}
      </p>
```

- [ ] **Step 5: Verify build and hand-check**

Run: `npm run build`
Expected: build succeeds.

Hand-verify: open a WO saved in Task 4 → its round-trip miles show. Change the address to a new picked location → the number updates and persists across reload.

- [ ] **Step 6: Commit**

```bash
git add src/pages/WorkOrderDetail.jsx
git commit -m "feat(mileage): display and recompute round-trip miles on work-order detail"
```

---

### Task 6: BillEditor — seed the Mileage line once

**Files:**
- Modify: `src/pages/BillEditor.jsx`

**Interfaces:**
- Consumes: `order.roundTripMiles`, `profile.mileageRate`, `order.mileageBilled`; `updateWorkOrder` (add to import if absent).
- Produces: sets `workOrder.mileageBilled = true`; appends a `{ description: 'Mileage', qty, unitPrice }` line to the bill's items.

Hand-verified.

- [ ] **Step 1: Ensure `updateWorkOrder` is imported**

`BillEditor.jsx` already imports `updateWorkOrder` from `../db/db.js`. Confirm it is present in the import block; no change if so.

- [ ] **Step 2: Seed the line in the no-existing-bill branch**

In the init effect, the `else` branch (no existing `bill`) currently seeds `items` from `order.templateItems`. Replace that `else` branch so it builds the item list from template items and appends a one-time Mileage line:

```js
      } else {
        setCcFeeRate(defaultCcRate);
        if (profile?.taxRate) setTaxRate(String(profile.taxRate));
        const seeded = (order.templateItems || []).map((li) => ({
          id: crypto.randomUUID(),
          description: li.description,
          qty: li.qty ?? 1,
          unitPrice: li.unitPrice ?? '',
        }));
        // Seed a billable Mileage line exactly once, independent of work type.
        if (!order.mileageBilled && order.roundTripMiles > 0 && profile?.mileageRate) {
          seeded.push({
            id: crypto.randomUUID(),
            description: 'Mileage',
            qty: order.roundTripMiles,
            unitPrice: profile.mileageRate,
          });
          await updateWorkOrder(order.id, { mileageBilled: true });
        }
        if (seeded.length) setItems(seeded);
      }
```

(The `(async () => { ... })()` wrapper in the effect already allows `await`.)

- [ ] **Step 3: Verify build and hand-check**

Run: `npm run build`
Expected: build succeeds.

Hand-verify: with a Mileage rate set and a WO that has round-trip miles, open the Bill editor for the first time → a "Mileage" line appears with qty = miles and unit price = rate, regardless of the work type. Edit or delete it, leave and re-open the bill → it is NOT re-added (respects `mileageBilled` / the saved bill). A WO with no miles or no rate seeds no Mileage line.

- [ ] **Step 4: Commit**

```bash
git add src/pages/BillEditor.jsx
git commit -m "feat(mileage): seed a one-time billable Mileage line on the bill"
```

---

### Task 7: Reports — Business mileage total + CSV column

**Files:**
- Modify: `src/pages/Reports.jsx`

**Interfaces:**
- Consumes: `data.orders` (map of work orders, already loaded), each with `serviceDate` and `roundTripMiles`.
- Produces: a "Business mileage" section (This month / YTD) and a `Round trip (mi)` CSV column.

Hand-verified.

- [ ] **Step 1: Total miles in the `report` memo**

In the `report` `useMemo`, add mileage accumulators. After the `let mtdBilled = 0, ...` line add:

```js
    let mtdMiles = 0, ytdMiles = 0;
```

After the existing `for (const b of data.bills) { ... }` loop, add a work-order loop (mileage is per WO, keyed by service date, independent of billing):

```js
    for (const o of Object.values(data.orders)) {
      const miles = o.roundTripMiles || 0;
      if (!miles) continue;
      const t = o.serviceDate || 0;
      if (t >= monthStart) mtdMiles += miles;
      if (t >= yearStart) ytdMiles += miles;
    }
```

Add `mtdMiles` and `ytdMiles` to the memo's `return { ... }`:

```js
    return { mtdBilled, mtdPaid, ytdBilled, ytdPaid, mtdMiles, ytdMiles, accountRows, months, maxMonth, tax };
```

- [ ] **Step 2: Render the Business mileage section**

After the "Year to date" `stat-grid` block (before the "Sales tax" `section-title`), add:

```jsx
      <div className="section-title">Business mileage</div>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat__label">This month</div>
          <div className="stat__value">{r.mtdMiles.toFixed(1)} mi</div>
        </div>
        <div className="stat">
          <div className="stat__label">Year to date</div>
          <div className="stat__value">{r.ytdMiles.toFixed(1)} mi</div>
        </div>
      </div>
```

- [ ] **Step 3: Add the CSV column**

In `exportCsv`, add the header and per-row value. Update the header array:

```js
    const header = ['Date', 'Bill #', 'Account', 'Subtotal', 'Tax', 'Card fee', 'Total', 'Status', 'Method', 'Round trip (mi)'];
```

In the row `.map`, add the miles from the WO after the `b.paymentMethod || ''` entry:

```js
          b.paymentStatus || 'unpaid',
          b.paymentMethod || '',
          (data.orders[b.workOrderId]?.roundTripMiles || 0).toFixed(1),
        ].map(esc).join(',');
```

- [ ] **Step 4: Verify build and hand-check**

Run: `npm run build`
Expected: build succeeds.

Hand-verify: Reports shows a "Business mileage" section with this-month / YTD totals matching the sum of WO round-trip miles by service date; Export CSV includes the `Round trip (mi)` column.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Reports.jsx
git commit -m "feat(mileage): business-mileage totals in Reports and CSV export"
```

---

## Self-Review

**Spec coverage:**
- Data model (`mileageRate`, `shopLat/shopLng`, `roundTripMiles`, `mileageBilled`, no migration) → Tasks 3, 4, 6.
- `mileage.js` pure helpers + `computeRoundTripMiles` (Distance Matrix via routes lib) → Tasks 1, 2.
- Shop origin precedence (coords over address) → `resolveOrigin` Task 1; shop coords never on PDF → they're only read by mileage code (never passed to `pdf.js`).
- WO display on New + Detail, cached, "—" fallback → Tasks 4, 5.
- Billed line seeded once, then editable → Task 6.
- Reports section + CSV column → Task 7.
- Offline/failure returns null, never blocks save → `computeRoundTripMiles` (Task 2), guarded by `navigator.onLine` at call sites (Tasks 4, 5).
- No `mileageRate` → miles still tracked/displayed, no billed line → Task 6 guard (`profile?.mileageRate`).

**Placeholder scan:** No TBD/TODO; all steps carry concrete code or exact commands. (Task 4 Step 3 notes that typed-only addresses are handled by the save-time compute in Step 4 rather than a blur handler — intentional simplification, not a placeholder.)

**Type consistency:** `computeRoundTripMiles(origin, dest)` called with `(resolveOrigin(profile), resolveDest(location))` everywhere; `resolveDest` always receives `{ text, lat?, lng? }`; `roundTripMiles` is a number|undefined throughout; `loadRoutes(key)` used only inside `computeRoundTripMiles`. `mileageBilled` boolean set only in Task 6, read only in Task 6.
