// Build a turn-by-turn directions link for a work-order location.
// Prefers GPS coordinates; otherwise uses the typed address. iOS opens Apple Maps,
// everything else opens Google Maps. Returns null when there's no location to route to.
export function mapsHref({ text, lat, lng } = {}, { ios = false } = {}) {
  let dest = null;
  if (lat != null && lng != null) {
    dest = `${lat},${lng}`;
  } else if ((text || '').trim()) {
    dest = encodeURIComponent(text.trim());
  }
  if (!dest) return null;
  const host = ios ? 'https://maps.apple.com' : 'https://maps.google.com';
  return `${host}/?daddr=${dest}`;
}

// Build a view-only Google Maps Embed URL (free Maps Embed API) for the location.
// Same location precedence as mapsHref (GPS over text). Returns null when there's no
// key or no location, so callers can simply skip rendering the map.
export function embedMapSrc({ text, lat, lng } = {}, key) {
  if (!key) return null;
  let dest = null;
  if (lat != null && lng != null) {
    dest = `${lat},${lng}`;
  } else if ((text || '').trim()) {
    dest = encodeURIComponent(text.trim());
  }
  if (!dest) return null;
  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${dest}&zoom=15`;
}
