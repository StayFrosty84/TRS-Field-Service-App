// NY interstate mile-marker matcher. Pure query helpers (node-testable) + a dynamic-import
// loader (the only impure part), mirroring the split in mileage.js. The dataset is bundled as
// a JS chunk via dynamic import so the PWA precaches it (workbox globs **/*.js, not **/*.json).

// Sort key: numeric part of an "I-NN" route id ascending.
const routeNum = (r) => parseInt(r.slice(2), 10);

// Routes surfaced first in the picker, in this exact order: the Western NY service area —
// Buffalo (I-90, I-190, I-290, I-990) then Rochester (I-390, I-490, I-590). Everything else
// follows in numeric order. (This also makes the picker default to I-90.)
const PRIORITY_ROUTES = ['I-90', 'I-190', 'I-290', 'I-990', 'I-390', 'I-490', 'I-590'];
const priorityRank = (r) => {
  const i = PRIORITY_ROUTES.indexOf(r);
  return i === -1 ? Infinity : i;
};

export function listRoutes(data) {
  const set = new Set();
  for (const m of data.markers) for (const r of m.r) set.add(r);
  return [...set].sort(
    (a, b) => priorityRank(a) - priorityRank(b) || routeNum(a) - routeNum(b),
  );
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
