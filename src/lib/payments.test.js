import { describe, it, expect } from 'vitest';
import {
  normalizePayments,
  amountPaid,
  billBalance,
  isPaid,
  paymentState,
} from './payments.js';

describe('normalizePayments', () => {
  it('returns the modern payments[] as-is when present', () => {
    const payments = [{ id: 'p1', amount: 50, method: 'Cash', date: 1000, reference: '' }];
    expect(normalizePayments({ total: 100, payments })).toBe(payments);
  });

  it('synthesizes a single payment from a legacy paid bill', () => {
    const bill = {
      total: 120,
      paymentStatus: 'paid',
      paymentMethod: 'Check',
      paymentReference: '1234',
      paidAt: 5000,
    };
    expect(normalizePayments(bill)).toEqual([
      { id: 'legacy', amount: 120, method: 'Check', date: 5000, reference: '1234' },
    ]);
  });

  it('falls back to billDate then createdAt for the synthesized date', () => {
    expect(normalizePayments({ total: 10, paymentStatus: 'paid', billDate: 200 })[0].date).toBe(200);
    expect(normalizePayments({ total: 10, paymentStatus: 'paid', createdAt: 300 })[0].date).toBe(300);
  });

  it('synthesizes amount 0 and blank fields when legacy data is missing', () => {
    expect(normalizePayments({ paymentStatus: 'paid' })).toEqual([
      { id: 'legacy', amount: 0, method: '', date: undefined, reference: '' },
    ]);
  });

  it('returns [] for a legacy unpaid bill', () => {
    expect(normalizePayments({ total: 100, paymentStatus: 'unpaid' })).toEqual([]);
  });

  it('returns [] for a bill with an empty payments array (not a legacy paid bill)', () => {
    expect(normalizePayments({ total: 100, payments: [] })).toEqual([]);
  });

  it('handles undefined / null bill', () => {
    expect(normalizePayments(undefined)).toEqual([]);
    expect(normalizePayments(null)).toEqual([]);
  });
});

describe('amountPaid', () => {
  it('sums the payment amounts', () => {
    const bill = { total: 100, payments: [{ amount: 30 }, { amount: 20.5 }] };
    expect(amountPaid(bill)).toBe(50.5);
  });

  it('treats missing/invalid amounts as 0', () => {
    const bill = { total: 100, payments: [{ amount: 'x' }, { amount: 10 }, {}] };
    expect(amountPaid(bill)).toBe(10);
  });

  it('is 0 for an unpaid bill', () => {
    expect(amountPaid({ total: 100, paymentStatus: 'unpaid' })).toBe(0);
  });

  it('counts the synthesized legacy payment', () => {
    expect(amountPaid({ total: 80, paymentStatus: 'paid' })).toBe(80);
  });
});

describe('billBalance', () => {
  it('is total minus amountPaid', () => {
    expect(billBalance({ total: 100, payments: [{ amount: 40 }] })).toBe(60);
  });

  it('treats missing total as 0', () => {
    expect(billBalance({ payments: [{ amount: 0 }] })).toBe(0);
  });

  it('can go negative on overpayment (clamping is the caller’s job)', () => {
    expect(billBalance({ total: 100, payments: [{ amount: 120 }] })).toBe(-20);
  });
});

describe('isPaid', () => {
  it('is true when total > 0 and balance <= 0', () => {
    expect(isPaid({ total: 100, payments: [{ amount: 100 }] })).toBe(true);
    expect(isPaid({ total: 100, payments: [{ amount: 150 }] })).toBe(true);
  });

  it('is false when a balance remains', () => {
    expect(isPaid({ total: 100, payments: [{ amount: 99 }] })).toBe(false);
  });

  it('is false for a $0 bill with no payments', () => {
    expect(isPaid({ total: 0, payments: [] })).toBe(false);
    expect(isPaid({ payments: [] })).toBe(false);
  });

  it('is true for a legacy paid bill', () => {
    expect(isPaid({ total: 50, paymentStatus: 'paid' })).toBe(true);
  });
});

describe('paymentState', () => {
  it('returns paid when fully paid', () => {
    expect(paymentState({ total: 100, payments: [{ amount: 100 }] })).toBe('paid');
  });

  it('returns partial when 0 < paid < total', () => {
    expect(paymentState({ total: 100, payments: [{ amount: 40 }] })).toBe('partial');
  });

  it('returns unpaid when nothing is paid', () => {
    expect(paymentState({ total: 100, payments: [] })).toBe('unpaid');
  });

  it('returns unpaid for a $0 bill with no payments', () => {
    expect(paymentState({ total: 0, payments: [] })).toBe('unpaid');
  });
});
