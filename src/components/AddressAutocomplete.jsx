import { useEffect, useRef, useState } from 'react';

// Keyless address autocomplete via Photon (OpenStreetMap). No API key, CORS-enabled.
// Falls back gracefully: typing always works, and if the request fails (offline) the
// user just keeps whatever they typed.
const PHOTON_URL = 'https://photon.komoot.io/api/';

// Results are limited to the US + Canada and ranked toward Western New York
// (proximity bias near Buffalo, NY) since that's the service area.
const WNY_LAT = 42.8864;
const WNY_LON = -78.8784;
const ALLOWED_COUNTRIES = new Set(['US', 'CA']);
const inUsaOrCanada = (p = {}) =>
  ALLOWED_COUNTRIES.has(p.countrycode) || ['United States', 'Canada'].includes(p.country);

function formatLabel(p = {}) {
  const line1 = [p.housenumber, p.street].filter(Boolean).join(' ') || p.name;
  const line2 = [p.city || p.town || p.village || p.county, p.state, p.postcode]
    .filter(Boolean)
    .join(', ');
  return [line1, line2, p.country].filter(Boolean).join(', ');
}

export default function AddressAutocomplete({ value, onChangeText, onPick, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const onDocDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  function handleInput(text) {
    onChangeText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(text.trim()), 300);
  }

  async function search(q) {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        limit: '10',
        lang: 'en',
        lat: String(WNY_LAT),
        lon: String(WNY_LON),
      });
      const res = await fetch(`${PHOTON_URL}?${params}`, { signal: ac.signal });
      const data = await res.json();
      const items = (data.features || [])
        .filter((f) => inUsaOrCanada(f.properties))
        .map((f) => ({
          label: formatLabel(f.properties),
          lat: f.geometry?.coordinates?.[1],
          lng: f.geometry?.coordinates?.[0],
        }))
        .filter((i) => i.label)
        .slice(0, 5);
      setSuggestions(items);
      setOpen(items.length > 0);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setSuggestions([]);
        setOpen(false);
      }
    } finally {
      setLoading(false);
    }
  }

  function pick(s) {
    onPick(s);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div className="ac-wrap" ref={boxRef}>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => suggestions.length && setOpen(true)}
        autoComplete="off"
        autoCapitalize="words"
      />
      {loading && <span className="ac-hint muted">…</span>}
      {open && (
        <div className="ac-list">
          {suggestions.map((s, i) => (
            <button key={i} type="button" className="ac-item" onClick={() => pick(s)}>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
