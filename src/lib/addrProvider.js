// Address-search provider config. Device-only (localStorage), like the theme/zoom prefs —
// deliberately NOT stored on the business profile, so it never travels in backup files or
// cloud sync and the user's Google API key stays on this one device.
const ENABLED_KEY = 'fs-google-places';
const KEY_KEY = 'fs-google-key';

export function getGoogleEnabled() {
  return localStorage.getItem(ENABLED_KEY) === '1';
}

export function setGoogleEnabled(on) {
  if (on) localStorage.setItem(ENABLED_KEY, '1');
  else localStorage.removeItem(ENABLED_KEY);
}

export function getGoogleKey() {
  return localStorage.getItem(KEY_KEY) || '';
}

export function setGoogleKey(key) {
  const k = (key || '').trim();
  if (k) localStorage.setItem(KEY_KEY, k);
  else localStorage.removeItem(KEY_KEY);
}

// Use Google only when the user has both opted in and supplied a key; otherwise the
// component stays on the free keyless Photon search.
export function useGooglePlaces() {
  return getGoogleEnabled() && !!getGoogleKey();
}
