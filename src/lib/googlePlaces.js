// Google Places address autocomplete (opt-in, bring-your-own-key). Loaded only when the
// user has enabled it in Settings; the AddressAutocomplete component falls back to the free
// Photon search on any failure here (offline, bad key, quota).
//
// Uses the current Places API surface (AutocompleteSuggestion + Place), not the deprecated
// AutocompleteService. A single session token spans the keystrokes of one search and is
// retired when the user picks a result — this is what keeps requests inside the free tier.
import { getGoogleKey } from './addrProvider.js';

// Restrict to US + Canada and bias toward Western NY (Buffalo) — mirrors the Photon defaults.
const WNY_LAT = 42.8864;
const WNY_LON = -78.8784;
const REQUEST_DEFAULTS = {
  includedRegionCodes: ['us', 'ca'],
  locationBias: { center: { lat: WNY_LAT, lng: WNY_LON }, radius: 80000 },
  origin: { lat: WNY_LAT, lng: WNY_LON },
  language: 'en',
};

let bootstrapPromise = null;
let loaderPromise = null;
let sessionToken = null;

// Inject the Maps JS bootstrap script once. Separate from importLibrary so multiple
// libraries (places, routes) can each await the same bootstrap.
function bootstrap(key) {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.importLibrary) return resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      key
    )}&libraries=places&v=weekly&loading=async`;
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

// Resolve the Places library (used by autocomplete).
function loadPlaces(key) {
  if (loaderPromise) return loaderPromise;
  loaderPromise = bootstrap(key).then(() => window.google.maps.importLibrary('places'));
  return loaderPromise;
}

// Resolve the Routes library (used by DistanceMatrixService).
export async function loadRoutes(key) {
  await bootstrap(key);
  return window.google.maps.importLibrary('routes');
}

// Pure: map a fetched Place to the app's { label, lat, lng } shape. location may expose
// lat/lng as accessor methods (LatLng) or as a plain literal.
export function placeToResult(place) {
  const loc = place?.location;
  const lat = typeof loc?.lat === 'function' ? loc.lat() : loc?.lat;
  const lng = typeof loc?.lng === 'function' ? loc.lng() : loc?.lng;
  return {
    label: place?.formattedAddress || place?.displayName || '',
    lat: lat == null ? undefined : lat,
    lng: lng == null ? undefined : lng,
  };
}

// Returns [{ label, prediction }] — coordinates are fetched lazily in resolvePick().
export async function fetchSuggestions(query) {
  const key = getGoogleKey();
  if (!key) throw new Error('No Google key');
  const { AutocompleteSuggestion, AutocompleteSessionToken } = await loadPlaces(key);
  if (!sessionToken) sessionToken = new AutocompleteSessionToken();
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    ...REQUEST_DEFAULTS,
    input: query,
    sessionToken,
  });
  return (suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) => ({ label: p.text?.toString() || '', prediction: p }))
    .filter((s) => s.label)
    .slice(0, 5);
}

// Resolve a chosen suggestion to coordinates. fetchFields() consumes the session token, so
// we clear it to begin a fresh (separately-billed) session for the next search.
export async function resolvePick(suggestion) {
  const place = suggestion.prediction.toPlace();
  await place.fetchFields({ fields: ['formattedAddress', 'displayName', 'location'] });
  sessionToken = null;
  const result = placeToResult(place);
  result.label = result.label || suggestion.label;
  return result;
}
