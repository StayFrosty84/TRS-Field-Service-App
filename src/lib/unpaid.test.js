import { describe, it, expect } from 'vitest';
import { unpaidBills } from './unpaid.js';

const DAY = 86400000;
const NOW = new Date(2026, 5, 21, 10).getTime();

const ordersById = {
  wo1: { id: 'wo1', accountId: 'a1' },
  wo2: { id: 'wo2', accountId: 'a2' },
  wo3: { id: 'wo3', accountId: 'a3' },
};
const accounts = { a1: { name: 'Acme' }, a2: { name: 'Beta' }, a3: { name: 'Gamma' } };

const bills = [
  { id: 'b1', workOrderId: 'wo1', total: 300, paymentStatus: 'unpaid', billDate: NOW - 5 * DAY },
  { id: 'b2', workOrderId: 'wo2', total: 999, paymentStatus: 'paid', billDate: NOW - 2 * DAY },
  { id: 'b3', workOrderId: 'wo3', total: 500, paymentStatus: 'unpaid', billDate: NOW - 12 * DAY },
];

describe('unpaidBills', () => {
  it('returns only unpaid bills, biggest balance first', () => {
    const rows = unpaidBills(bills, ordersById, accounts, NOW);
    expect(rows.map((r) => r.workOrderId)).toEqual(['wo3', 'wo1']);
  });

  it('joins the account name and computes age in days', () => {
    const [top] = unpaidBills(bills, ordersById, accounts, NOW);
    expect(top).toMatchObject({ workOrderId: 'wo3', name: 'Gamma', total: 500, ageDays: 12 });
  });

  it('falls back to "Unknown" when the account is missing', () => {
    const rows = unpaidBills(
      [{ id: 'b9', workOrderId: 'missing', total: 10, paymentStatus: 'unpaid', billDate: NOW }],
      {},
      {},
      NOW
    );
    expect(rows[0].name).toBe('Unknown');
  });

  it('shows a partial bill with its remaining balance, not its gross total', () => {
    const partial = [
      {
        id: 'bp',
        workOrderId: 'wo1',
        total: 400,
        payments: [{ id: 'p1', amount: 150, date: NOW - DAY }],
        billDate: NOW - 3 * DAY,
      },
    ];
    const [row] = unpaidBills(partial, ordersById, accounts, NOW);
    expect(row).toMatchObject({ workOrderId: 'wo1', total: 250, balance: 250 });
  });

  it('excludes a bill fully paid via payments[]', () => {
    const paidViaPayments = [
      { id: 'bx', workOrderId: 'wo1', total: 200, payments: [{ id: 'p1', amount: 200, date: NOW }] },
    ];
    expect(unpaidBills(paidViaPayments, ordersById, accounts, NOW)).toEqual([]);
  });

  it('still excludes a legacy paymentStatus:"paid" bill (no payments[])', () => {
    const legacy = [{ id: 'bl', workOrderId: 'wo1', total: 200, paymentStatus: 'paid' }];
    expect(unpaidBills(legacy, ordersById, accounts, NOW)).toEqual([]);
  });
});
