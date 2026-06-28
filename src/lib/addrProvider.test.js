import { describe, it, expect, beforeEach } from 'vitest';
import {
  getGoogleEnabled,
  setGoogleEnabled,
  getGoogleKey,
  setGoogleKey,
  useGooglePlaces,
} from './addrProvider.js';

beforeEach(() => localStorage.clear());

describe('address provider config', () => {
  it('defaults to disabled with no key', () => {
    expect(getGoogleEnabled()).toBe(false);
    expect(getGoogleKey()).toBe('');
    expect(useGooglePlaces()).toBe(false);
  });

  it('persists the enabled flag', () => {
    setGoogleEnabled(true);
    expect(getGoogleEnabled()).toBe(true);
    setGoogleEnabled(false);
    expect(getGoogleEnabled()).toBe(false);
  });

  it('trims and persists the key, and clears it when blank', () => {
    setGoogleKey('  abc123  ');
    expect(getGoogleKey()).toBe('abc123');
    setGoogleKey('   ');
    expect(getGoogleKey()).toBe('');
  });

  it('uses Google only when enabled AND a key is present', () => {
    setGoogleEnabled(true);
    expect(useGooglePlaces()).toBe(false); // no key yet
    setGoogleKey('abc123');
    expect(useGooglePlaces()).toBe(true);
    setGoogleEnabled(false);
    expect(useGooglePlaces()).toBe(false); // key present but disabled
  });
});
