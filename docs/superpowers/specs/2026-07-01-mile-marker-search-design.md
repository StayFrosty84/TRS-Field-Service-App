# Mile-marker search (NY interstates) — design

**Date:** 2026-07-01
**Roadmap item:** "Search mile markers" (Parking lot → promoted by this spec). Roadside jobs
are often called in as "I-90 mile marker 436", not a street address; today the app can only
geocode addresses.

## Goal

Let the user set a work-order location by picking an interstate + mile marker and get real
lat/long — fully offline — so Navigate, the embedded map, and round-trip mileage work exactly
as they do for a street address.

## Decisions (from brainstorm)

1. **Coverage: all NY interstates.** Thruway-system roads (I-87/I-90 Mainline, Berkshire I-90,
   I-190, I-95, I-287) use the Thruway Authority's posted-milepost dataset (authoritative,
   tenth-mile precision). Non-Thruway interstates (I-81, I-84, I-86, I-88, I-290, I-390,
   I-490, I-590, I-690, I-781, I-990, the I-87 Northway, …) get **derived whole-mile points**
   computed from NYSDOT's measured route geometry. NY/US touring routes (e.g. NY-5) are out of
   scope for v1.
2. **Bundled at build time.** A Node script (run manually, output committed) produces one
   compact JSON asset precached by the PWA. No runtime network dependency — mile-marker search
   is the one location search that works offline. Markers essentially never move; refresh =
   re-run the script.
3. **Dedicated mode, structured input.** The WO location field gets an
   **Address | Mile marker** segmented toggle (default Address; address mode unchanged).
   Mile-marker mode is a route picker + numeric marker input — no free-text parsing, no typo
   risk, glove-friendly.
4. **Enriched labels.** Each marker carries its nearest town (computed at build time from the
   free Census gazetteer of NY places), e.g. `I-90 MM 436.0 · Thruway Mainline · near Angola`.
   The town is what disambiguates the two I-87s (Thruway Mainline vs Adirondack Northway —
   posted mileposts restart at Albany, so "I-87 MM 30" legitimately matches both, but their
   nearest towns differ; the user picks). County was dropped from v1: the Census places
   gazetteer carries no county, and the Thruway source carries none either, so there is no
   clean single-source way to attach it without shipping county polygons — not worth it when
   nearest town already disambiguates.
5. **Direction-neutral points.** The source data has one point per posted marker (no N/S–E/W
   carriageway split), and the maps app routes to the correct side. No fabricated direction
   data.
6. **Existing pick contract.** Choosing a marker emits `{ label, lat, lng }` — the same shape
   `AddressAutocomplete` emits — so the WO location, `mapsHref` Navigate link, `embedMapSrc`,
   and `computeRoundTripMiles` all work with **zero downstream changes**. The label is saved
   as the WO location text and renders on screens/PDF like any typed address.

## Data sources (verified live, 2026-07-01)

| Source | Service | What we take |
| --- | --- | --- |
| NYS Thruway Authority | `services2.arcgis.com/gubH6kG9JCAsMX2M/…/NY_State_Thruway_Mileposts/FeatureServer/1` | 5,703 tenth-mile posted mileposts; fields `RTE_ABBR` (ML/B/N/NE/CW/GS), `ROAD_NAME`, `POSTED_MILEPOST`, point geometry (request `outSR=4326`) |
| NYSDOT | `gis.dot.ny.gov/hostingny/rest/services/Milepoint/MapServer/0` (Interstate) | Measured polylines (`hasM`) with `ROUTE_NUMBER`, `DIRECTION`, `COUNTY_ORDER` — walked to emit whole-mile points |
| US Census gazetteer | `2024_Gaz_place_national.zip` → `2024_Gaz_place_national.txt`, filtered `USPS == 'NY'` (~1,293 places; cols `NAME`, `INTPTLAT`, `INTPTLONG`) | Nearest town/village/city per marker (build-time haversine; not shipped) |

Notes:

- The Thruway `GS` route (Garden State Parkway Connector) is not an interstate — excluded.
- The Thruway `ML` Mainline is searchable under **both** I-87 and I-90 (posted mileposts are
  continuous NYC→PA line; drivers on either signed route report the same posts). Each marker
  row stores its signed routes as an array (`"r": ["I-87", "I-90"]`) so no rows are
  duplicated.
- **Dedup rule:** a NYSDOT-derived point is dropped when a Thruway-posted point for the same
  route number lies within 0.5 mi. This keeps the authoritative posts where systems overlap
  (e.g. I-95, where only the New England Thruway segment is Thruway-operated).

## Data pipeline — `scripts/buildMileMarkers.mjs`

Node script, no app dependencies. Steps:

1. Fetch all Thruway milepost features (paged; `maxRecordCount` 1000) → one row per post,
   tagged with its signed interstates (ML → `["I-87", "I-90"]`).
2. Fetch NYSDOT Interstate polylines with M-values, group by `ROUTE_NUMBER` (primary
   `DIRECTION` only), order segments by `COUNTY_ORDER`, accumulate great-circle length along
   vertices, emit a point at each whole mile. Mark `approx`.
3. Apply the dedup rule; attach nearest gazetteer place (town) to every marker.
4. **Self-check before writing:** every expected route present, per-route counts within sane
   bounds, all points inside the NY bounding box, max gap between consecutive markers ≤ 1.5 mi
   (warn otherwise). Fail loudly rather than write a bad file.
5. Write `src/data/mileMarkers.json` (~7k rows, ~600 KB raw / ~150 KB gzipped):

```json
{ "v": 1, "generated": "2026-07-01", "markers": [
  { "r": ["I-87", "I-90"], "road": "Thruway Mainline", "mm": 436.0,
    "lat": 42.63, "lng": -79.06, "town": "Angola" },
  { "r": ["I-81"], "road": "I-81", "mm": 120, "approx": true,
    "lat": 43.45, "lng": -76.11, "town": "Central Square" }
] }
```

## Matcher — `src/lib/mileMarkers.js`

Pure and node-testable, following the `mileage.js` pattern.

- `loadMileMarkers()` — dynamic `import()` of the JSON (code-split; main bundle unchanged),
  cached in module state.
- `listRoutes(data)` — distinct route numbers for the picker, numerically sorted.
- `searchMileMarkers(data, { route, query })` — `query` is the raw numeric input. Matches:
  exact `mm` first (tenths hit Thruway tenth-mile posts directly), then string-prefix matches
  on whole markers ("43" → 43, 430–439…), then nearest whole marker when a tenth is asked of
  a derived (whole-mile-only) route. Returns ≤ 5 rows sorted by `mm`, each with a composed
  `label` and `lat`/`lng`. Empty input or no match → `[]`.
- `markerLabel(m)` — `"I-90 MM 436.0 · Thruway Mainline · near Angola"`
  (road segment omitted when it just repeats the route, as on I-81; town clause omitted when
  no nearby place was found).

## UI — `LocationInput.jsx` (new) + `MileMarkerPicker.jsx` (new)

- **`LocationInput.jsx`** wraps the location field on `WorkOrderNew.jsx` and
  `WorkOrderDetail.jsx`: a small segmented **Address | Mile marker** toggle above the input,
  passing through the existing `value` / `onChangeText` / `onPick` props. Address mode renders
  today's `AddressAutocomplete` untouched. Toggle state is ephemeral and always defaults to
  Address in v1.
- **`MileMarkerPicker.jsx`**: route `<select>` (from `listRoutes`) + marker number input
  (`inputmode="decimal"`), suggestions rendered with the same `.ac-list` styling as address
  results. Tapping a match calls `onPick({ label, lat, lng })` and fills the text input with
  the label. No network, no debounce needed — matching is a local array filter.

## Error handling & edges

- **Offline:** everything is local; this mode never degrades.
- **Out-of-range / unknown marker:** picker shows a quiet "No marker found" row; nothing is
  emitted; the user can still switch to Address mode and type anything.
- **Ambiguous route (I-87, I-90 Mainline vs Berkshire):** all matching roads are listed; the
  town/county in the label disambiguates.
- **Derived accuracy:** NYSDOT-derived points are geometry-measured, so they can drift from
  posted signs by a curve's worth. Acceptable for "get the driver near the truck"; the Thruway
  (where most long-haul calls happen) uses exact posted data.
- **Editing later:** the saved location is ordinary `{ text, lat, lng }` — editing it in
  Address mode just overwrites it, same as any address.

## Testing

- `mileMarkers.js` unit tests with a small fixture: route listing, exact/tenth/prefix/nearest
  matching, ≤ 5 cap, label composition, empty-input and no-match cases.
- `buildMileMarkers.mjs` is guarded by its own self-checks (step 4) rather than unit tests;
  its committed output is reviewed once by loading the app.
- Toggle UX, picker rendering, Navigate/map/mileage flow-through — hand-verified in-app
  (DOM/Maps paths are outside the node harness), per DEPLOYMENT.md.

## Non-goals

- Other states; NY/US touring routes (NY-5 etc.); NYSDOT green reference-marker *panel* search
  (different numbering system than posted mileposts).
- Direction-specific carriageway points.
- In-app data refresh/versioning — the dataset updates by re-running the script.
- A standalone quick-lookup outside work orders (possible later; the matcher is reusable).
