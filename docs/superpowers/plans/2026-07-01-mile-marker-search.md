# Mile-marker search (NY interstates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user set a work-order location by picking an NY interstate + mile marker, fully offline, producing real lat/long so Navigate, the embedded map, and round-trip mileage work exactly as they do for a typed address.

**Architecture:** A build-time Node script pulls NY Thruway posted mileposts + NYSDOT interstate route geometry, enriches each point with its nearest town, and commits a compact `mileMarkers.json`. A pure matcher module (`mileMarkers.js`) loads that JSON via dynamic `import()` (so Vite bundles it into a precached JS chunk — the PWA precaches `**/*.js`, **not** `.json`) and answers route/marker queries. A `MileMarkerPicker` component renders route + marker inputs; a `LocationInput` wrapper adds an Address | Mile marker toggle above the existing `AddressAutocomplete` on both WO screens. Picking a marker emits the same `{ label, lat, lng }` shape address picks already emit, so nothing downstream changes.

**Tech Stack:** React 18, Vite, vitest, vite-plugin-pwa (workbox). Node 18+ for the build script (global `fetch`, ESM). No new dependencies.

## Global Constraints

- No new npm dependencies — build script uses only Node built-ins (`node:fs`, global `fetch`, `node:zlib`) and the app uses only React.
- Data asset MUST be loaded via dynamic `import('../data/mileMarkers.json')`, never `fetch('/…json')` — only bundled JS chunks are precached for offline use.
- The pick contract is exactly `onPick({ label, lat, lng })` — same shape `AddressAutocomplete` emits; `lat`/`lng` are numbers.
- Pure matcher functions live in `src/lib/mileMarkers.js` and are node-testable (no DOM, no network); the dynamic-import loader is the only impure part, mirroring the `mileage.js` split.
- Reuse existing CSS classes: `.chips` / `.chip` / `.chip--active` for the toggle, `.ac-wrap` / `.ac-list` / `.ac-item` for the suggestion dropdown. Add no new CSS unless a step says so.
- Route labels are canonical `I-NN` strings (e.g. `I-90`, `I-190`); marker numbers are numbers (tenths allowed).
- Follow repo conventions: ES modules, 2-space indent, vitest (`describe`/`it`/`expect`), `npm test` must stay green.

---

### Task 1: Build script — fetch, derive, enrich, and commit `mileMarkers.json`

Produces the committed dataset the whole feature reads. Not unit-tested (hits live network); guarded by in-script self-checks. The deliverable is a valid committed `src/data/mileMarkers.json`.

**Files:**
- Create: `field-service-app/scripts/buildMileMarkers.mjs`
- Create (generated, committed): `field-service-app/src/data/mileMarkers.json`
- Modify: `field-service-app/package.json` (add a `build:mile-markers` script)

**Interfaces:**
- Consumes: nothing (entry-point script).
- Produces: `src/data/mileMarkers.json` with shape
  `{ v: 1, generated: "YYYY-MM-DD", markers: Array<{ r: string[], road: string, mm: number, lat: number, lng: number, town?: string, approx?: true }> }`.
  This exact shape is what Task 2's matcher consumes.

- [ ] **Step 1: Create the build script**

Create `field-service-app/scripts/buildMileMarkers.mjs`:

```js
// Build-time generator for src/data/mileMarkers.json — NY interstate mile markers.
// Run manually when refreshing the dataset:  npm run build:mile-markers
// Sources (all public, no key):
//   - NY Thruway Authority posted mileposts (tenth-mile, authoritative on Thruway roads)
//   - NYSDOT Milepoint Interstate route geometry (M-valued polylines) → derived whole-mile pts
//   - US Census 2024 place gazetteer (national zip) → nearest town per point
// Never imported by the app; Node-only (global fetch, node:zlib for the gazetteer unzip).
import { writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const OUT = new URL('../src/data/mileMarkers.json', import.meta.url);

const THRUWAY =
  'https://services2.arcgis.com/gubH6kG9JCAsMX2M/arcgis/rest/services/NY_State_Thruway_Mileposts/FeatureServer/1';
const MILEPOINT =
  'https://gis.dot.ny.gov/hostingny/rest/services/Milepoint/MapServer/0';
const GAZETTEER =
  'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_place_national.zip';

// Thruway RTE_ABBR → signed interstate route number(s). GS (Garden State Connector) is not an
// interstate and is intentionally excluded. ML mainline is signed as both I-87 and I-90.
const THRUWAY_ROUTES = {
  ML: { routes: ['I-87', 'I-90'], road: 'Thruway Mainline' },
  B: { routes: ['I-90'], road: 'Berkshire Connector' },
  N: { routes: ['I-190'], road: 'Niagara Thruway' },
  NE: { routes: ['I-95'], road: 'New England Thruway' },
  CW: { routes: ['I-287'], road: 'Cross Westchester Expwy' },
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// Page through an ArcGIS query (maxRecordCount 1000) collecting all features.
async function queryAll(layer, params) {
  const out = [];
  let offset = 0;
  for (;;) {
    const qs = new URLSearchParams({
      where: '1=1',
      outSR: '4326',
      f: 'json',
      resultOffset: String(offset),
      resultRecordCount: '1000',
      ...params,
    });
    const data = await fetchJson(`${layer}/query?${qs}`);
    const feats = data.features || [];
    out.push(...feats);
    if (feats.length < 1000 || !data.exceededTransferLimit) break;
    offset += feats.length;
  }
  return out;
}

const R = 3958.7613; // Earth radius, miles
const toRad = (d) => (d * Math.PI) / 180;
function haversine(aLat, aLng, bLat, bLng) {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// --- Thruway posted mileposts (tenth mile) -------------------------------------------------
async function thruwayMarkers() {
  const feats = await queryAll(THRUWAY, { outFields: 'RTE_ABBR,POSTED_MILEPOST,ROAD_NAME' });
  const markers = [];
  for (const f of feats) {
    const cfg = THRUWAY_ROUTES[f.attributes.RTE_ABBR];
    if (!cfg) continue; // skips GS and anything unexpected
    const mm = Math.round(f.attributes.POSTED_MILEPOST * 10) / 10;
    markers.push({
      r: cfg.routes,
      road: cfg.road,
      mm,
      lat: round5(f.geometry.y),
      lng: round5(f.geometry.x),
    });
  }
  return markers;
}

// --- NYSDOT derived whole-mile points ------------------------------------------------------
// Interstate polylines carry an M-value (mile measure) per vertex, but M RESETS to 0 in each
// county segment. So per route we take the primary carriageway (DIRECTION '1'), order its
// segments by COUNTY_ORDER, and accumulate an offset to rebuild statewide mileposts
// (statewideM = sum of prior segment lengths + local M), then emit a point at each whole mile.
async function nysdotMarkers() {
  const feats = await queryAll(MILEPOINT, {
    outFields: 'ROUTE_NUMBER,DIRECTION,COUNTY_ORDER',
    returnM: 'true',
  });
  // Group features by route number; DIRECTION domain is '1'/'2' — '1' is the milepost-
  // increasing carriageway (verified: its M=0 end sits at the route's start / milepost 0).
  const byRoute = new Map();
  for (const f of feats) {
    if (String(f.attributes.DIRECTION) !== '1') continue;
    const num = f.attributes.ROUTE_NUMBER;
    if (!num) continue;
    if (!byRoute.has(num)) byRoute.set(num, []);
    byRoute.get(num).push(f);
  }
  const markers = [];
  for (const [num, features] of byRoute) {
    features.sort((a, b) =>
      String(a.attributes.COUNTY_ORDER).localeCompare(String(b.attributes.COUNTY_ORDER)),
    );
    // Concatenate segment vertices as [lng, lat, statewideM].
    const verts = [];
    let offset = 0;
    for (const f of features) {
      const local = (f.geometry?.paths || [])
        .flat()
        .filter((v) => v.length >= 3 && Number.isFinite(v[2]));
      if (!local.length) continue;
      local.sort((a, b) => a[2] - b[2]);
      for (const [lng, lat, m] of local) verts.push([lng, lat, offset + m]);
      offset += local[local.length - 1][2];
    }
    if (verts.length < 2) continue;
    let nextMile = Math.ceil(verts[0][2]);
    for (let i = 1; i < verts.length; i++) {
      const [lng0, lat0, m0] = verts[i - 1];
      const [lng1, lat1, m1] = verts[i];
      while (nextMile <= m1 && m1 > m0) {
        const t = (nextMile - m0) / (m1 - m0);
        markers.push({
          r: [`I-${num}`],
          road: `I-${num}`,
          mm: nextMile,
          lat: round5(lat0 + (lat1 - lat0) * t),
          lng: round5(lng0 + (lng1 - lng0) * t),
          approx: true,
        });
        nextMile += 1;
      }
    }
  }
  return markers;
}

// --- Census nearest-town enrichment --------------------------------------------------------
async function loadPlaces() {
  const buf = Buffer.from(await (await fetch(GAZETTEER)).arrayBuffer());
  const txt = unzipSingleEntry(buf);
  const lines = txt.split(/\r?\n/);
  const header = lines[0].split('\t').map((h) => h.trim());
  const iState = header.indexOf('USPS');
  const iName = header.indexOf('NAME');
  const iLat = header.indexOf('INTPTLAT');
  const iLng = header.indexOf('INTPTLONG');
  const places = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('\t');
    if (c[iState] !== 'NY') continue;
    const lat = parseFloat(c[iLat]);
    const lng = parseFloat(c[iLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    // Strip the LSAD suffix Census appends to NAME ("Angola village" → "Angola").
    const name = c[iName].replace(/\s+(village|city|town|CDP|borough)$/i, '').trim();
    places.push({ name, lat, lng });
  }
  return places;
}

// Minimal single-file unzip: read the first local file header, inflate its raw deflate body.
// The gazetteer zip contains exactly one .txt entry with deflate compression.
function unzipSingleEntry(buf) {
  // Local file header: sig(4) ver(2) flags(2) method(2) time(2) date(2) crc(4)
  // csize(4) usize(4) namelen(2) extralen(2)
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip');
  const method = buf.readUInt16LE(8);
  const compSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  const body = buf.subarray(start, start + compSize);
  if (method === 0) return body.toString('utf8'); // stored
  return inflateRawSync(body).toString('utf8'); // deflate
}

function attachTowns(markers, places) {
  for (const m of markers) {
    let best = null;
    let bestD = Infinity;
    for (const p of places) {
      const d = haversine(m.lat, m.lng, p.lat, p.lng);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    // Only label a town when it's plausibly "the nearest town" (within 12 miles).
    if (best && bestD <= 12) m.town = best.name;
  }
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

// --- Dedup: drop a derived point when a Thruway post for the same route is within 0.5 mi ----
// Distance-only (NOT mm-based): the Thruway and NYSDOT number the same route differently, so
// where they physically coincide (the Thruway mainline) we keep the POSTED Thruway numbering
// and drop the derived point; on free segments with no nearby Thruway post the derived point
// survives with the numbering actually signed there.
function dedup(thruway, derived) {
  const byRoute = new Map(); // route → [{lat,lng}]
  for (const m of thruway) for (const r of m.r) {
    if (!byRoute.has(r)) byRoute.set(r, []);
    byRoute.get(r).push(m);
  }
  return derived.filter((d) => {
    const posts = byRoute.get(d.r[0]);
    if (!posts) return true;
    return !posts.some((p) => haversine(d.lat, d.lng, p.lat, p.lng) <= 0.5);
  });
}

// --- Self-checks: fail loudly rather than commit a bad file --------------------------------
function selfCheck(markers) {
  const errs = [];
  const routes = new Set(markers.flatMap((m) => m.r));
  for (const need of ['I-87', 'I-90', 'I-190', 'I-95', 'I-287', 'I-81', 'I-88', 'I-390']) {
    if (!routes.has(need)) errs.push(`missing route ${need}`);
  }
  for (const m of markers) {
    if (!(m.lat > 40 && m.lat < 45.1 && m.lng > -80 && m.lng < -71.5)) {
      errs.push(`point out of NY bbox: ${m.r} MM ${m.mm} @ ${m.lat},${m.lng}`);
      break;
    }
  }
  if (markers.length < 3000) errs.push(`suspiciously few markers: ${markers.length}`);
  if (errs.length) {
    console.error('SELF-CHECK FAILED:\n' + errs.join('\n'));
    process.exit(1);
  }
}

async function main() {
  console.log('Fetching Thruway mileposts…');
  const thruway = await thruwayMarkers();
  console.log(`  ${thruway.length} posted mileposts`);
  console.log('Fetching NYSDOT interstate geometry…');
  const derivedAll = await nysdotMarkers();
  const derived = dedup(thruway, derivedAll);
  console.log(`  ${derivedAll.length} derived → ${derived.length} after dedup`);
  const markers = [...thruway, ...derived].sort(
    (a, b) => a.r[0].localeCompare(b.r[0]) || a.mm - b.mm,
  );
  console.log('Fetching Census gazetteer for town names…');
  attachTowns(markers, await loadPlaces());
  selfCheck(markers);
  const doc = { v: 1, generated: new Date().toISOString().slice(0, 10), markers };
  writeFileSync(OUT, JSON.stringify(doc));
  console.log(`Wrote ${markers.length} markers → ${OUT.pathname}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `field-service-app/package.json`, add to `"scripts"` (after `"icons"`):

```json
    "build:mile-markers": "node scripts/buildMileMarkers.mjs",
```

- [ ] **Step 3: Run the generator**

Run: `cd field-service-app && npm run build:mile-markers`
Expected output ends with `Wrote NNNN markers → …/src/data/mileMarkers.json` and no `SELF-CHECK FAILED`. Requires network access.

- [ ] **Step 4: Sanity-check the committed file**

Run:
```bash
cd field-service-app && node -e "const d=require('./src/data/mileMarkers.json'); \
const routes=[...new Set(d.markers.flatMap(m=>m.r))].sort(); \
console.log('markers:',d.markers.length,'routes:',routes.join(',')); \
const ml=d.markers.find(m=>m.road==='Thruway Mainline'&&m.town); console.log('sample:',JSON.stringify(ml));"
```
Expected: several thousand markers; routes include `I-81,I-87,I-88,I-90,I-190,I-287,I-390,I-95` (and more); sample row has `r`, `road`, `mm`, `lat`, `lng`, `town`.

- [ ] **Step 5: Commit**

```bash
cd field-service-app && git add scripts/buildMileMarkers.mjs src/data/mileMarkers.json package.json
git commit -m "feat: generate NY interstate mile-marker dataset"
```

---

### Task 2: Matcher module `mileMarkers.js` (pure + dynamic-import loader)

**Files:**
- Create: `field-service-app/src/lib/mileMarkers.js`
- Test: `field-service-app/src/lib/mileMarkers.test.js`

**Interfaces:**
- Consumes: the JSON shape from Task 1 (`{ v, generated, markers: [{ r, road, mm, lat, lng, town?, approx? }] }`).
- Produces (all pure except `loadMileMarkers`):
  - `listRoutes(data) → string[]` — distinct route ids, sorted by interstate number ascending.
  - `searchMileMarkers(data, { route, query }) → Array<{ label, lat, lng, mm, road }>` — ≤ 5 rows, sorted by `mm`. `route` is an `I-NN` string; `query` is the raw marker input (string or number). Empty/blank `query` or no match → `[]`.
  - `markerLabel(m) → string` — e.g. `"I-90 MM 436.0 · Thruway Mainline · near Angola"`; used internally by `searchMileMarkers` and reused by the picker. `m` here is a raw marker plus a `route` field naming which signed route is being shown.
  - `loadMileMarkers() → Promise<data>` — dynamic-imports the JSON once, caches it. Impure.

- [ ] **Step 1: Write the failing tests**

Create `field-service-app/src/lib/mileMarkers.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { listRoutes, searchMileMarkers, markerLabel } from './mileMarkers.js';

const DATA = {
  v: 1,
  generated: '2026-07-01',
  markers: [
    { r: ['I-87', 'I-90'], road: 'Thruway Mainline', mm: 436.0, lat: 42.63, lng: -79.06, town: 'Angola' },
    { r: ['I-87', 'I-90'], road: 'Thruway Mainline', mm: 436.3, lat: 42.64, lng: -79.05, town: 'Angola' },
    { r: ['I-87', 'I-90'], road: 'Thruway Mainline', mm: 437.0, lat: 42.65, lng: -79.03, town: 'Angola' },
    { r: ['I-87'], road: 'Adirondack Northway', mm: 30, lat: 43.2, lng: -73.7, town: 'Gansevoort', approx: true },
    { r: ['I-81'], road: 'I-81', mm: 120, lat: 43.45, lng: -76.11, town: 'Central Square', approx: true },
    { r: ['I-81'], road: 'I-81', mm: 121, lat: 43.46, lng: -76.10, town: 'Central Square', approx: true },
  ],
};

describe('listRoutes', () => {
  it('returns distinct routes sorted by interstate number', () => {
    expect(listRoutes(DATA)).toEqual(['I-81', 'I-87', 'I-90']);
  });
});

describe('markerLabel', () => {
  it('shows Thruway posts at tenth precision (non-approx)', () => {
    expect(markerLabel({ ...DATA.markers[0], route: 'I-90' })).toBe(
      'I-90 MM 436.0 · Thruway Mainline · near Angola',
    );
  });
  it('shows derived whole markers without a decimal, omitting a road that repeats the route', () => {
    expect(markerLabel({ ...DATA.markers[4], route: 'I-81' })).toBe(
      'I-81 MM 120 · near Central Square',
    );
  });
  it('omits the town clause when there is no town', () => {
    expect(markerLabel({ r: ['I-90'], road: 'I-90', mm: 5, route: 'I-90', approx: true })).toBe(
      'I-90 MM 5',
    );
  });
});

describe('searchMileMarkers', () => {
  it('exact-matches a whole marker on a route', () => {
    const r = searchMileMarkers(DATA, { route: 'I-81', query: '120' });
    expect(r.map((m) => m.mm)).toEqual([120]);
    expect(r[0].lat).toBe(43.45);
    expect(r[0].label).toBe('I-81 MM 120 · near Central Square');
  });

  it('matches a tenth-mile Thruway post exactly', () => {
    const r = searchMileMarkers(DATA, { route: 'I-90', query: '436.3' });
    expect(r.map((m) => m.mm)).toEqual([436.3]);
  });

  it('prefix-matches whole markers (43 → 436, 437)', () => {
    const r = searchMileMarkers(DATA, { route: 'I-90', query: '43' });
    expect(r.map((m) => m.mm)).toEqual([436, 436.3, 437]);
  });

  it('disambiguates the two I-87s by returning only that route’s markers', () => {
    const r = searchMileMarkers(DATA, { route: 'I-87', query: '30' });
    expect(r.map((m) => m.road)).toEqual(['Adirondack Northway']);
  });

  it('caps results at 5', () => {
    const many = { ...DATA, markers: Array.from({ length: 20 }, (_, i) => ({
      r: ['I-90'], road: 'I-90', mm: 400 + i, lat: 42, lng: -78,
    })) };
    expect(searchMileMarkers(many, { route: 'I-90', query: '4' })).toHaveLength(5);
  });

  it('returns [] for blank query or no match', () => {
    expect(searchMileMarkers(DATA, { route: 'I-90', query: '' })).toEqual([]);
    expect(searchMileMarkers(DATA, { route: 'I-90', query: '9999' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd field-service-app && npx vitest run src/lib/mileMarkers.test.js`
Expected: FAIL — `Failed to resolve import "./mileMarkers.js"` / functions not defined.

- [ ] **Step 3: Write the implementation**

Create `field-service-app/src/lib/mileMarkers.js`:

```js
// NY interstate mile-marker matcher. Pure query helpers (node-testable) + a dynamic-import
// loader (the only impure part), mirroring the split in mileage.js. The dataset is bundled as
// a JS chunk via dynamic import so the PWA precaches it (workbox globs **/*.js, not **/*.json).

// Sort key: numeric part of an "I-NN" route id ascending.
const routeNum = (r) => parseInt(r.slice(2), 10);

export function listRoutes(data) {
  const set = new Set();
  for (const m of data.markers) for (const r of m.r) set.add(r);
  return [...set].sort((a, b) => routeNum(a) - routeNum(b));
}

// Format a marker (with a `route` field naming the signed route being shown) as a label.
// Thruway posts (non-approx) carry real tenth-mile precision, so show one decimal even for
// whole values (436 → "436.0"); derived whole-mile points (approx) show no decimal.
export function markerLabel(m) {
  const mm = m.approx ? String(m.mm) : m.mm.toFixed(1);
  let s = `${m.route} MM ${mm}`;
  if (m.road && m.road !== m.route) s += ` · ${m.road}`;
  if (m.town) s += ` · near ${m.town}`;
  return s;
}

// Match markers on a route against a raw numeric query.
// Priority: exact mm, then whole-marker string-prefix, capped at 5, sorted by mm.
export function searchMileMarkers(data, { route, query }) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const onRoute = data.markers.filter((m) => m.r.includes(route));
  const asNum = Number(q);
  const hasDot = q.includes('.');

  let hits;
  const exact = Number.isFinite(asNum) ? onRoute.filter((m) => m.mm === asNum) : [];
  if (exact.length) {
    hits = exact;
  } else if (hasDot) {
    // A tenth was asked of a route that only has whole markers → nearest whole marker.
    hits = Number.isFinite(asNum)
      ? onRoute
          .filter((m) => Number.isInteger(m.mm))
          .sort((a, b) => Math.abs(a.mm - asNum) - Math.abs(b.mm - asNum))
          .slice(0, 1)
      : [];
  } else {
    // Whole-number prefix match: "43" → 43, 430..439, 436.3, etc.
    hits = onRoute.filter((m) => String(m.mm).startsWith(q) || Math.trunc(m.mm) === asNum);
  }

  return hits
    .slice()
    .sort((a, b) => a.mm - b.mm)
    .slice(0, 5)
    .map((m) => ({ label: markerLabel({ ...m, route }), lat: m.lat, lng: m.lng, mm: m.mm, road: m.road }));
}

// Dynamic-import the dataset once and cache it. Impure.
let _cache = null;
export async function loadMileMarkers() {
  if (!_cache) {
    const mod = await import('../data/mileMarkers.json');
    _cache = mod.default ?? mod;
  }
  return _cache;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd field-service-app && npx vitest run src/lib/mileMarkers.test.js`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
cd field-service-app && git add src/lib/mileMarkers.js src/lib/mileMarkers.test.js
git commit -m "feat: mile-marker matcher module with tests"
```

---

### Task 3: `MileMarkerPicker` component

**Files:**
- Create: `field-service-app/src/components/MileMarkerPicker.jsx`

**Interfaces:**
- Consumes: `listRoutes`, `searchMileMarkers`, `loadMileMarkers` from Task 2.
- Produces: default-exported React component
  `<MileMarkerPicker onPick={({ label, lat, lng }) => void} />`. On mount it loads the dataset; renders a route `<select>` + a numeric marker `<input>`; shows ≤ 5 suggestion buttons styled with `.ac-list` / `.ac-item`; clicking one calls `onPick`.

- [ ] **Step 1: Write the component**

Create `field-service-app/src/components/MileMarkerPicker.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { listRoutes, searchMileMarkers, loadMileMarkers } from '../lib/mileMarkers.js';

// Structured mile-marker input: pick an interstate, type a marker number, tap a match.
// Emits the same { label, lat, lng } shape as AddressAutocomplete so callers are identical.
// Fully offline — matching is a local array filter over the bundled dataset.
export default function MileMarkerPicker({ onPick }) {
  const [data, setData] = useState(null);
  const [route, setRoute] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    loadMileMarkers().then((d) => {
      if (!alive) return;
      setData(d);
      const routes = listRoutes(d);
      setRoute((r) => r || routes[0] || '');
    });
    return () => {
      alive = false;
    };
  }, []);

  const routes = useMemo(() => (data ? listRoutes(data) : []), [data]);
  const results = useMemo(
    () => (data && route ? searchMileMarkers(data, { route, query }) : []),
    [data, route, query],
  );

  if (!data) return <p className="muted" style={{ fontSize: 13 }}>Loading mile markers…</p>;

  return (
    <div className="ac-wrap">
      <div className="row" style={{ gap: 8 }}>
        <select value={route} onChange={(e) => setRoute(e.target.value)} style={{ maxWidth: 130 }}>
          {routes.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Mile marker #"
          inputMode="decimal"
          autoComplete="off"
        />
      </div>
      {query.trim() && (
        <div className="ac-list" style={{ position: 'static', marginTop: 6 }}>
          {results.length === 0 ? (
            <div className="ac-item muted">No marker found</div>
          ) : (
            results.map((m) => (
              <button
                key={`${m.mm}-${m.road}`}
                type="button"
                className="ac-item"
                onClick={() => onPick({ label: m.label, lat: m.lat, lng: m.lng })}
              >
                {m.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds (no test — DOM/Maps path is hand-verified per repo convention)**

Run: `cd field-service-app && npx vite build`
Expected: build succeeds; output includes a code-split chunk for `mileMarkers.json` (the dynamic import). No errors.

- [ ] **Step 3: Commit**

```bash
cd field-service-app && git add src/components/MileMarkerPicker.jsx
git commit -m "feat: MileMarkerPicker component"
```

---

### Task 4: `LocationInput` wrapper (Address | Mile marker toggle)

**Files:**
- Create: `field-service-app/src/components/LocationInput.jsx`

**Interfaces:**
- Consumes: `AddressAutocomplete` (existing) and `MileMarkerPicker` (Task 3).
- Produces: default-exported React component
  `<LocationInput value onChangeText onPick placeholder />` — same props `AddressAutocomplete` takes today. Renders an Address | Mile marker toggle (`.chips`/`.chip`) above the input; Address mode renders `AddressAutocomplete` unchanged; Mile marker mode renders `MileMarkerPicker`. Toggle state is local and defaults to Address.

- [ ] **Step 1: Write the component**

Create `field-service-app/src/components/LocationInput.jsx`:

```jsx
import { useState } from 'react';
import AddressAutocomplete from './AddressAutocomplete.jsx';
import MileMarkerPicker from './MileMarkerPicker.jsx';

// Location field with a mode toggle. Address mode is the existing autocomplete, untouched.
// Mile marker mode lets the user pick an NY interstate + marker offline. Both modes call the
// same onPick({ label, lat, lng }), so the parent WO screens treat every result identically.
export default function LocationInput({ value, onChangeText, onPick, placeholder }) {
  const [mode, setMode] = useState('address'); // 'address' | 'mile'

  return (
    <div>
      <div className="chips" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className={`chip ${mode === 'address' ? 'chip--active' : ''}`}
          onClick={() => setMode('address')}
        >
          Address
        </button>
        <button
          type="button"
          className={`chip ${mode === 'mile' ? 'chip--active' : ''}`}
          onClick={() => setMode('mile')}
        >
          Mile marker
        </button>
      </div>
      {mode === 'address' ? (
        <AddressAutocomplete
          value={value}
          onChangeText={onChangeText}
          onPick={onPick}
          placeholder={placeholder}
        />
      ) : (
        <MileMarkerPicker onPick={onPick} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd field-service-app && npx vite build`
Expected: build succeeds, no errors.

- [ ] **Step 3: Commit**

```bash
cd field-service-app && git add src/components/LocationInput.jsx
git commit -m "feat: LocationInput wrapper with Address | Mile marker toggle"
```

---

### Task 5: Wire `LocationInput` into both WO screens

**Files:**
- Modify: `field-service-app/src/pages/WorkOrderNew.jsx` (import at line 14; usage at lines 327-340)
- Modify: `field-service-app/src/pages/WorkOrderDetail.jsx` (import at line 31; usage at lines 256-279)

**Interfaces:**
- Consumes: `LocationInput` (Task 4). Replaces the `AddressAutocomplete` element only; the `onChangeText` / `onPick` callback bodies stay exactly as they are, so `gps`, `recomputeMiles`/`computeRoundTripMiles`, and persistence are unchanged.
- Produces: no new exports.

- [ ] **Step 1: WorkOrderNew — swap the import**

In `field-service-app/src/pages/WorkOrderNew.jsx`, change line 14 from:

```jsx
import AddressAutocomplete from '../components/AddressAutocomplete.jsx';
```
to:
```jsx
import LocationInput from '../components/LocationInput.jsx';
```

- [ ] **Step 2: WorkOrderNew — swap the element**

In the same file, replace the `<AddressAutocomplete …/>` element (currently lines 327-340) with the identical props on `LocationInput`:

```jsx
      <LocationInput
        value={locationText}
        placeholder="Search address, or type a description"
        onChangeText={(t) => {
          setLocationText(t);
          setGps(null); // manual edit no longer matches a picked address's coordinates
        }}
        onPick={({ label, lat, lng }) => {
          setLocationText(label);
          const g = lat != null && lng != null ? { lat, lng } : null;
          setGps(g);
          recomputeMiles({ text: label, ...(g || {}) });
        }}
      />
```

- [ ] **Step 3: WorkOrderDetail — swap the import**

In `field-service-app/src/pages/WorkOrderDetail.jsx`, change line 31 from:

```jsx
import AddressAutocomplete from '../components/AddressAutocomplete.jsx';
```
to:
```jsx
import LocationInput from '../components/LocationInput.jsx';
```

- [ ] **Step 4: WorkOrderDetail — swap the element**

In the same file, replace the `<AddressAutocomplete …/>` element (currently lines 256-279) with `LocationInput`, keeping the existing `onChangeText`/`onPick` bodies verbatim:

```jsx
      <LocationInput
        value={locationText}
        placeholder="Search address, or type a description"
        onChangeText={(t) => {
          setLocationText(t);
          setGps(null);
        }}
        onPick={({ label, lat, lng }) => {
          setLocationText(label);
          const g = lat != null && lng != null ? { lat, lng } : null;
          setGps(g);
          // New address invalidates the cached miles until a fresh value returns.
          setMiles(null);
          if (navigator.onLine) {
            computeRoundTripMiles({ origin: resolveOrigin(profile), dest: resolveDest({ text: label, ...(g || {}) }) })
              .then((m) => {
                setMiles(m);
                updateWorkOrder(id, { roundTripMiles: m ?? null });
              });
          } else {
            updateWorkOrder(id, { roundTripMiles: null });
          }
        }}
      />
```

- [ ] **Step 5: Verify build + existing tests still pass**

Run: `cd field-service-app && npx vite build && npm test`
Expected: build succeeds; `npm test` is green (including the new `mileMarkers.test.js`). Confirm no remaining `AddressAutocomplete` import errors:
Run: `cd field-service-app && grep -rn "AddressAutocomplete" src/pages/` → expect no matches.

- [ ] **Step 6: Commit**

```bash
cd field-service-app && git add src/pages/WorkOrderNew.jsx src/pages/WorkOrderDetail.jsx
git commit -m "feat: use LocationInput (address + mile marker) on WO screens"
```

---

### Task 6: Manual in-app verification + roadmap update

No automated coverage exists for DOM/Maps flows (repo convention). Verify by hand, then mark the roadmap item shipped per ROADMAP.md rules (build → verify → deploy → then Shipped).

**Files:**
- Modify: `field-service-app/docs/ROADMAP.md` (move the item to ✅ Shipped once deployed)

- [ ] **Step 1: Run the dev server and verify the happy path**

Run: `cd field-service-app && npm run dev`
Then in the browser:
1. New Work Order → tap **Mile marker** → route defaults to `I-81` (or lowest); pick **I-90**, type `436`.
2. Confirm a suggestion like `I-90 MM 436.0 · Thruway Mainline · near …` appears.
3. Tap it → the location field fills with that label; the embedded map centers on the point; "Round trip from shop" recomputes.
4. Open the created WO detail → tap **Navigate** → confirm the maps app opens to the marker's coordinates (not a text search).
5. Toggle back to **Address**, type a street address → confirm address autocomplete still works unchanged.

- [ ] **Step 2: Verify offline**

In DevTools → Network → Offline (after one online load so the SW cached the build), repeat Step 1.2–1.3. Mile-marker search must still return results (dataset is precached); address search may fail (expected).

- [ ] **Step 3: Deploy per DEPLOYMENT.md, then update the roadmap**

After deploying, move the **Mile-marker search (NY interstates)** bullet from **Ready** to **✅ Shipped** in `field-service-app/docs/ROADMAP.md`, dated, following the existing Shipped entry format, and commit:

```bash
cd field-service-app && git add docs/ROADMAP.md
git commit -m "docs: mark mile-marker search shipped"
```

---

## Notes for the implementer

- **Data refresh:** the dataset is static; re-run `npm run build:mile-markers` only when markers change (rare). The committed JSON is the source of truth for the app.
- **Why dynamic import, not `public/*.json`:** the PWA precache glob is `**/*.{js,css,html,svg,png,ico,woff2}` — a raw JSON in `public/` would be fetched at runtime and fail offline. Dynamic `import()` makes Vite emit a hashed `.js` chunk that IS precached.
- **`round5` / coordinate precision:** 5 decimals ≈ 1 m, plenty for navigation, and keeps the file small.
- **If a self-check fails** during Task 1 Step 3, read the printed reason — usually a source URL changed or a route's geometry is missing a direction; fix the query, don't weaken the check.
