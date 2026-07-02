import { getGoogleKey } from './addrProvider.js';
import { loadRoutes } from './googlePlaces.js';

// Pure helpers for mileage computation (node-testable).
// computeRoundTripMiles is appended below (impure, uses Maps JS).

// Resolve shop origin from business profile.
// Returns { lat, lng } when both shopLat and shopLng are set,
// { text } when profile.address is non-empty, else null.
export function resolveOrigin(profile) {
  if (profile?.shopLat != null && profile?.shopLng != null) {
    return { lat: profile.shopLat, lng: profile.shopLng };
  }
  if (profile?.address) return { text: profile.address };
  return null;
}

// Resolve job destination from a WO location object.
// Returns { lat, lng } when both are set, { text } when location.text is non-empty, else null.
export function resolveDest(location) {
  if (location?.lat != null && location?.lng != null) {
    return { lat: location.lat, lng: location.lng };
  }
  if (location?.text) return { text: location.text };
  return null;
}

// Round-trip distance: one-way miles × 2, rounded to 0.1.
export function roundTrip(oneWayMiles) {
  return Math.round(oneWayMiles * 2 * 10) / 10;
}

// Impure: calls Google Maps DistanceMatrixService.
// origin and dest each accept { lat, lng } or { text }.
// Returns a number (round-trip miles) or null on any failure.
export async function computeRoundTripMiles({ origin, dest }) {
  if (!origin || !dest) return null;
  try {
    const key = getGoogleKey();
    if (!key) return null;
    const { DistanceMatrixService } = await loadRoutes(key);
    const svc = new DistanceMatrixService();
    const toLatLng = (p) => (p.lat != null ? { lat: p.lat, lng: p.lng } : p.text);
    const response = await svc.getDistanceMatrix({
      origins: [toLatLng(origin)],
      destinations: [toLatLng(dest)],
      travelMode: 'DRIVING',
    });
    const element = response?.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') return null;
    const meters = element.distance?.value;
    if (meters == null) return null;
    const oneWayMiles = meters / 1609.344;
    return roundTrip(oneWayMiles);
  } catch {
    return null;
  }
}
