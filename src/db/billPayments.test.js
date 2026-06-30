import { describe, it, expect, beforeEach } from 'vitest';
import { db, addBillPayment, markBillUnpaid } from './db.js';

beforeEach(async () => {
  await db.billsOfSale.clear();
});

describe('bill payment mutators are atomic', () => {
  it('keeps both payments when two adds race (no lost read-modify-write)', async () => {
    await db.billsOfSale.add({ id: 'b1', workOrderId: 'w1', total: 100, paymentStatus: 'unpaid' });
    await Promise.all([
      addBillPayment('b1', { amount: 30, method: 'Cash' }),
      addBillPayment('b1', { amount: 70, method: 'Check' }),
    ]);
    const b = await db.billsOfSale.get('b1');
    expect(b.payments).toHaveLength(2);
    expect(b.payments.reduce((s, p) => s + p.amount, 0)).toBe(100);
  });

  it('does not resurrect a synthesized legacy payment when clear races an add', async () => {
    // legacy paid bill (no payments[]), then clear + add in the same tick
    await db.billsOfSale.add({
      id: 'b2',
      workOrderId: 'w2',
      total: 200,
      paymentStatus: 'paid',
      paymentMethod: 'Cash',
      paidAt: 1,
    });
    await markBillUnpaid('b2'); // clear first
    await addBillPayment('b2', { amount: 50, method: 'Check' });
    const b = await db.billsOfSale.get('b2');
    // exactly the one real payment — no phantom id:'legacy' entry
    expect(b.payments).toHaveLength(1);
    expect(b.payments[0]).toMatchObject({ amount: 50, method: 'Check' });
    expect(b.payments.some((p) => p.id === 'legacy')).toBe(false);
  });
});
