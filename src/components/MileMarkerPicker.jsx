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
