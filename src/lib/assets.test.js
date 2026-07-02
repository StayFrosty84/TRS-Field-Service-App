import { describe, it, expect } from 'vitest';
import { assetLabel, normalizeVin } from './assets.js';

describe('assetLabel', () => {
  it('joins unit number and year/make/model', () => {
    expect(assetLabel({ unitNumber: '12', year: 2019, make: 'Ford', model: 'F-350' })).toBe(
      'Unit 12 — 2019 Ford F-350'
    );
  });

  it('works with partial data', () => {
    expect(assetLabel({ make: 'Kenworth' })).toBe('Kenworth');
    expect(assetLabel({ unitNumber: '7' })).toBe('Unit 7');
    expect(assetLabel({})).toBe('Asset');
    expect(assetLabel(null)).toBe('');
  });
});

describe('normalizeVin', () => {
  it('uppercases and trims to alphanumerics', () => {
    expect(normalizeVin(' 1ftfw1et5dfc10312 ')).toBe('1FTFW1ET5DFC10312');
  });

  it('strips the door-jamb import prefix from an 18-char scan', () => {
    expect(normalizeVin('I1FTFW1ET5DFC10312')).toBe('1FTFW1ET5DFC10312');
  });

  it('returns empty string for nullish input', () => {
    expect(normalizeVin(null)).toBe('');
  });
});
