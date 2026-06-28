import { describe, it, expect } from 'vitest';
import { placeToResult } from './googlePlaces.js';

describe('placeToResult', () => {
  it('reads lat/lng from a LatLng with accessor methods', () => {
    const place = {
      formattedAddress: '123 Main St, Buffalo, NY 14201, USA',
      location: { lat: () => 42.9, lng: () => -78.8 },
    };
    expect(placeToResult(place)).toEqual({
      label: '123 Main St, Buffalo, NY 14201, USA',
      lat: 42.9,
      lng: -78.8,
    });
  });

  it('reads lat/lng from a plain literal location', () => {
    const place = { formattedAddress: '1 A St', location: { lat: 1, lng: 2 } };
    expect(placeToResult(place)).toEqual({ label: '1 A St', lat: 1, lng: 2 });
  });

  it('falls back to displayName when there is no formatted address', () => {
    const place = { displayName: "Joe's Garage", location: { lat: 1, lng: 2 } };
    expect(placeToResult(place).label).toBe("Joe's Garage");
  });

  it('returns undefined coordinates when location is missing', () => {
    const r = placeToResult({ formattedAddress: 'x' });
    expect(r.lat).toBeUndefined();
    expect(r.lng).toBeUndefined();
  });
});
