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
