import { describe, it, expect } from 'vitest';
import { listRoutes, searchMileMarkers, markerLabel } from './mileMarkers.js';

const DATA = {
  v: 1,
  generated: '2026-07-01',
  markers: [
    { r: ['I-87', 'I-90'], road: 'Thruway Mainline', mm: 436.0, lat: 42.63, lng: -79.06, town: 'Angola' },
    { r: ['I-87', 'I-90'], road: 'Thruway Mainline', mm: 436.3, lat: 42.64, lng: -79.05, town: 'Angola' },
    { r: ['I-87', 'I-90'], road: 'Thruway Mainline', mm: 437.0, lat: 42.65, lng: -79.03, town: 'Angola' },
    { r: ['I-87'], road: 'Adirondack Northway', mm: 30, lat: 43.2, lng: -73.7, town: 'Gansevoort', approx: true },
    { r: ['I-81'], road: 'I-81', mm: 120, lat: 43.45, lng: -76.11, town: 'Central Square', approx: true },
    { r: ['I-81'], road: 'I-81', mm: 121, lat: 43.46, lng: -76.10, town: 'Central Square', approx: true },
  ],
};

describe('listRoutes', () => {
  it('surfaces WNY priority routes first, then the rest by number', () => {
    // I-90 is a priority (Buffalo) route so it leads; I-81 and I-87 follow numerically.
    expect(listRoutes(DATA)).toEqual(['I-90', 'I-81', 'I-87']);
  });

  it('orders the full priority block ahead of non-priority routes', () => {
    const data = { markers: [
      { r: ['I-84'] }, { r: ['I-490'] }, { r: ['I-990'] },
      { r: ['I-90'] }, { r: ['I-190'] }, { r: ['I-290'] },
      { r: ['I-390'] }, { r: ['I-590'] }, { r: ['I-81'] },
    ] };
    expect(listRoutes(data)).toEqual([
      'I-90', 'I-190', 'I-290', 'I-990', 'I-390', 'I-490', 'I-590', // WNY block, in order
      'I-81', 'I-84', // remainder, numeric
    ]);
  });
});

describe('markerLabel', () => {
  it('shows Thruway posts at tenth precision (non-approx)', () => {
    expect(markerLabel({ ...DATA.markers[0], route: 'I-90' })).toBe(
      'I-90 MM 436.0 · Thruway Mainline · near Angola',
    );
  });
  it('shows derived whole markers without a decimal, omitting a road that repeats the route', () => {
    expect(markerLabel({ ...DATA.markers[4], route: 'I-81' })).toBe(
      'I-81 MM 120 · near Central Square',
    );
  });
  it('omits the town clause when there is no town', () => {
    expect(markerLabel({ r: ['I-90'], road: 'I-90', mm: 5, route: 'I-90', approx: true })).toBe(
      'I-90 MM 5',
    );
  });
});

describe('searchMileMarkers', () => {
  it('exact-matches a whole marker on a route', () => {
    const r = searchMileMarkers(DATA, { route: 'I-81', query: '120' });
    expect(r.map((m) => m.mm)).toEqual([120]);
    expect(r[0].lat).toBe(43.45);
    expect(r[0].label).toBe('I-81 MM 120 · near Central Square');
  });

  it('matches a tenth-mile Thruway post exactly', () => {
    const r = searchMileMarkers(DATA, { route: 'I-90', query: '436.3' });
    expect(r.map((m) => m.mm)).toEqual([436.3]);
  });

  it('prefix-matches whole markers (43 → 436, 437)', () => {
    const r = searchMileMarkers(DATA, { route: 'I-90', query: '43' });
    expect(r.map((m) => m.mm)).toEqual([436, 436.3, 437]);
  });

  it('disambiguates the two I-87s by returning only that route’s markers', () => {
    const r = searchMileMarkers(DATA, { route: 'I-87', query: '30' });
    expect(r.map((m) => m.road)).toEqual(['Adirondack Northway']);
  });

  it('caps results at 5', () => {
    const many = { ...DATA, markers: Array.from({ length: 20 }, (_, i) => ({
      r: ['I-90'], road: 'I-90', mm: 400 + i, lat: 42, lng: -78,
    })) };
    expect(searchMileMarkers(many, { route: 'I-90', query: '4' })).toHaveLength(5);
  });

  it('returns [] for blank query or no match', () => {
    expect(searchMileMarkers(DATA, { route: 'I-90', query: '' })).toEqual([]);
    expect(searchMileMarkers(DATA, { route: 'I-90', query: '9999' })).toEqual([]);
  });
});
