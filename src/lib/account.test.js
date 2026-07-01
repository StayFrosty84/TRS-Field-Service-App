import { describe, it, expect } from 'vitest';
import { accountOutstanding, accountWarning } from './unpaid.js';

const DAY = 86400000;
const NOW = new Date(2026, 5, 21, 10).getTime();

describe('accountOutstanding', () => {
  it('sums the balance of unpaid bills only', () => {
    const bills = [
      { id: 'b1', total: 300, paymentStatus: 'unpaid' },
      { id: 'b2', total: 999, paymentStatus: 'paid', paidAt: NOW },
      { id: 'b3', total: 500, paymentStatus: 'unpaid' },
    ];
    expect(accountOutstanding(bills).totalUnpaid).toBe(800);
  });

  it('counts only the remaining balance on a partially-paid bill', () => {
    const bills = [
      { id: 'b1', total: 400, payments: [{ id: 'p1', amount: 150, date: NOW - DAY }] },
      { id: 'b2', total: 100, paymentStatus: 'unpaid' },
    ];
    expect(accountOutstanding(bills).totalUnpaid).toBe(350);
  });

  it('excludes a bill fully paid via payments[]', () => {
    const bills = [
      { id: 'b1', total: 200, payments: [{ id: 'p1', amount: 200, date: NOW }] },
      { id: 'b2', total: 100, paymentStatus: 'unpaid' },
    ];
    expect(accountOutstanding(bills).totalUnpaid).toBe(100);
  });

  it('returns the most recent paidAt as lastPaidDate (legacy bills)', () => {
    const bills = [
      { id: 'b1', total: 100, paymentStatus: 'paid', paidAt: NOW - 5 * DAY },
      { id: 'b2', total: 100, paymentStatus: 'paid', paidAt: NOW - 1 * DAY },
    ];
    expect(accountOutstanding(bills).lastPaidDate).toBe(NOW - 1 * DAY);
  });

  it('uses the latest payments[] date for lastPaidDate, including partials', () => {
    const bills = [
      { id: 'b1', total: 400, payments: [{ id: 'p1', amount: 100, date: NOW - 2 * DAY }] },
      { id: 'b2', total: 100, paymentStatus: 'paid', paidAt: NOW - 5 * DAY },
    ];
    expect(accountOutstanding(bills).lastPaidDate).toBe(NOW - 2 * DAY);
  });

  it('treats missing total as 0', () => {
    const bills = [{ id: 'b1', paymentStatus: 'unpaid' }];
    expect(accountOutstanding(bills).totalUnpaid).toBe(0);
  });

  it('returns null lastPaidDate when nothing is paid', () => {
    const bills = [{ id: 'b1', total: 50, paymentStatus: 'unpaid' }];
    expect(accountOutstanding(bills).lastPaidDate).toBeNull();
  });

  it('ignores paid bills with no payment date when picking lastPaidDate', () => {
    const bills = [
      { id: 'b1', total: 100, paymentStatus: 'paid' },
      { id: 'b2', total: 100, paymentStatus: 'paid', paidAt: NOW - 3 * DAY },
    ];
    expect(accountOutstanding(bills).lastPaidDate).toBe(NOW - 3 * DAY);
  });

  it('handles an empty bill list', () => {
    expect(accountOutstanding([])).toEqual({ totalUnpaid: 0, lastPaidDate: null });
  });

  it('handles undefined input', () => {
    expect(accountOutstanding()).toEqual({ totalUnpaid: 0, lastPaidDate: null });
  });
});

describe('accountWarning', () => {
  it('warns for a do-not-service account (doNotService flag)', () => {
    expect(accountWarning({ doNotService: true })).toMatch(/do.?not.?service/i);
  });

  it('warns for a legacy do-not-service term (back-compat)', () => {
    expect(accountWarning({ terms: 'Do-not-service' })).toMatch(/do.?not.?service/i);
  });

  it('does not warn for an ordinary term once do-not-service is a flag', () => {
    expect(accountWarning({ terms: 'Net-30' })).toBeNull();
  });

  it('warns for a rating of 1', () => {
    expect(accountWarning({ rating: 1 })).toMatch(/rating/i);
  });

  it('warns for a rating below 1 (defensive)', () => {
    expect(accountWarning({ rating: 0 })).toMatch(/rating/i);
  });

  it('returns null for a healthy account', () => {
    expect(accountWarning({ rating: 4, terms: 'Net-30' })).toBeNull();
  });

  it('returns null for an account with no rating or terms set', () => {
    expect(accountWarning({})).toBeNull();
    expect(accountWarning()).toBeNull();
  });

  it('prefers the do-not-service message when both conditions apply', () => {
    expect(accountWarning({ rating: 1, terms: 'Do-not-service' })).toMatch(/do.?not.?service/i);
  });
});
