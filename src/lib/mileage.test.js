import { describe, it, expect } from 'vitest';
import { resolveOrigin, resolveDest, roundTrip } from './mileage.js';

describe('resolveOrigin', () => {
  it('returns lat/lng when both shop coordinates are set', () => {
    const profile = { shopLat: 42.8864, shopLng: -78.8784, address: '123 Main St' };
    expect(resolveOrigin(profile)).toEqual({ lat: 42.8864, lng: -78.8784 });
  });

  it('falls back to address text when shop coords are absent', () => {
    const profile = { address: '123 Main St, Buffalo, NY' };
    expect(resolveOrigin(profile)).toEqual({ text: '123 Main St, Buffalo, NY' });
  });

  it('falls back to address text when only one coord is set', () => {
    const profile = { shopLat: 42.8864, address: '123 Main St' };
    expect(resolveOrigin(profile)).toEqual({ text: '123 Main St' });
  });

  it('returns null when no coords and no address', () => {
    expect(resolveOrigin({})).toBeNull();
    expect(resolveOrigin(null)).toBeNull();
  });
});

describe('resolveDest', () => {
  it('returns lat/lng when both are set on location', () => {
    const location = { lat: 43.0, lng: -79.0, text: 'Somewhere' };
    expect(resolveDest(location)).toEqual({ lat: 43.0, lng: -79.0 });
  });

  it('falls back to text when lat/lng are absent', () => {
    const location = { text: '456 Elm St, Buffalo, NY' };
    expect(resolveDest(location)).toEqual({ text: '456 Elm St, Buffalo, NY' });
  });

  it('returns null when location is empty or null', () => {
    expect(resolveDest({})).toBeNull();
    expect(resolveDest(null)).toBeNull();
  });
});

describe('roundTrip', () => {
  it('doubles one-way miles and rounds to 0.1', () => {
    expect(roundTrip(12.4)).toBe(24.8);
    expect(roundTrip(12.35)).toBe(24.7);
    expect(roundTrip(0)).toBe(0);
  });

  it('handles fractional miles correctly', () => {
    expect(roundTrip(5.55)).toBe(11.1);
  });
});
