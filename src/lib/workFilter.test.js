import { describe, it, expect } from 'vitest';
import { dateRangeBounds, filterWorkOrders } from './workFilter.js';

// June 21, 2026, 10:00 local — fixed "now" so date math is deterministic.
const NOW = new Date(2026, 5, 21, 10, 0, 0).getTime();
const startOfDay = (y, m, d) => new Date(y, m, d, 0, 0, 0, 0).getTime();
const DAY = 86400000;

describe('dateRangeBounds', () => {
  it('returns an unbounded range for "any"', () => {
    const { from, to } = dateRangeBounds('any', NOW);
    expect(from).toBe(-Infinity);
    expect(to).toBe(Infinity);
  });

  it('bounds "today" to the current calendar day', () => {
    const { from, to } = dateRangeBounds('today', NOW);
    expect(from).toBe(startOfDay(2026, 5, 21));
    expect(to).toBe(startOfDay(2026, 5, 21) + DAY - 1);
  });

  it('bounds "month" to the current calendar month', () => {
    const { from, to } = dateRangeBounds('month', NOW);
    expect(from).toBe(startOfDay(2026, 5, 1));
    expect(to).toBe(startOfDay(2026, 6, 1) - 1);
  });

  it('bounds "quarter" to the current calendar quarter', () => {
    const { from, to } = dateRangeBounds('quarter', NOW); // June → Apr–Jun
    expect(from).toBe(startOfDay(2026, 3, 1));
    expect(to).toBe(startOfDay(2026, 6, 1) - 1);
  });

  it('covers the last 7 calendar days inclusive for "7d"', () => {
    const { from, to } = dateRangeBounds('7d', NOW);
    expect(from).toBe(startOfDay(2026, 5, 21) - 6 * DAY);
    expect(to).toBe(startOfDay(2026, 5, 21) + DAY - 1);
  });
});

describe('filterWorkOrders', () => {
  const accounts = {
    a1: { id: 'a1', name: 'Acme Plumbing' },
    a2: { id: 'a2', name: 'Beta LLC' },
  };
  const orders = [
    { id: 'o1', accountId: 'a1', status: 'open', serviceDate: new Date(2026, 5, 21, 12).getTime() },
    { id: 'o2', accountId: 'a2', status: 'completed', serviceDate: new Date(2026, 4, 10, 12).getTime() },
    { id: 'o3', accountId: 'a1', status: 'open', serviceDate: new Date(2026, 5, 1, 12).getTime(), issue: 'Leaky faucet' },
  ];
  const billByWo = {
    o1: { workOrderId: 'o1', billNumber: '2026062101', paymentStatus: 'unpaid' },
    o2: { workOrderId: 'o2', billNumber: '2026051002', paymentStatus: 'paid' },
  };
  const base = { query: '', status: 'all', dateKey: 'any', billByWo, accounts, now: NOW };
  const ids = (rows) => rows.map((o) => o.id);

  it('returns everything with no filters', () => {
    expect(ids(filterWorkOrders(orders, base))).toEqual(['o1', 'o2', 'o3']);
  });

  it('filters by open status', () => {
    expect(ids(filterWorkOrders(orders, { ...base, status: 'open' }))).toEqual(['o1', 'o3']);
  });

  it('filters by unpaid (bill exists and not paid)', () => {
    expect(ids(filterWorkOrders(orders, { ...base, status: 'unpaid' }))).toEqual(['o1']);
  });

  it('matches the search query against account name', () => {
    expect(ids(filterWorkOrders(orders, { ...base, query: 'acme' }))).toEqual(['o1', 'o3']);
  });

  it('matches the search query against the issue text', () => {
    expect(ids(filterWorkOrders(orders, { ...base, query: 'faucet' }))).toEqual(['o3']);
  });

  it('matches the search query against the bill number', () => {
    expect(ids(filterWorkOrders(orders, { ...base, query: '2026062101' }))).toEqual(['o1']);
  });

  it('filters by the current month, excluding out-of-range service dates', () => {
    expect(ids(filterWorkOrders(orders, { ...base, dateKey: 'month' }))).toEqual(['o1', 'o3']);
  });

  it('filters by today', () => {
    expect(ids(filterWorkOrders(orders, { ...base, dateKey: 'today' }))).toEqual(['o1']);
  });
});
