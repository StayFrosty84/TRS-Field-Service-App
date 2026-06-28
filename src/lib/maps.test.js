import { describe, it, expect } from 'vitest';
import { mapsHref } from './maps.js';

describe('mapsHref', () => {
  it('builds a Google Maps directions link from GPS by default', () => {
    expect(mapsHref({ lat: 40.7, lng: -73.9 })).toBe('https://maps.google.com/?daddr=40.7,-73.9');
  });

  it('builds an Apple Maps link from GPS on iOS', () => {
    expect(mapsHref({ lat: 40.7, lng: -73.9 }, { ios: true })).toBe(
      'https://maps.apple.com/?daddr=40.7,-73.9'
    );
  });

  it('falls back to the address text, URL-encoded', () => {
    expect(mapsHref({ text: '123 Main St, Albany NY' })).toBe(
      'https://maps.google.com/?daddr=123%20Main%20St%2C%20Albany%20NY'
    );
  });

  it('prefers GPS over text when both are present', () => {
    expect(mapsHref({ text: '123 Main St', lat: 1, lng: 2 })).toBe(
      'https://maps.google.com/?daddr=1,2'
    );
  });

  it('returns null when there is no location', () => {
    expect(mapsHref({ text: '   ' })).toBeNull();
    expect(mapsHref({})).toBeNull();
  });
});
