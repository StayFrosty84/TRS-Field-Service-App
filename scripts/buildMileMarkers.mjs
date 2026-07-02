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
