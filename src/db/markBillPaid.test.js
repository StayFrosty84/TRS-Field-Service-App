import { describe, it, expect, beforeEach } from 'vitest';
import { db, markBillPaid } from './db.js';

beforeEach(async () => {
  await db.billsOfSale.clear();
  await db.billsOfSale.add({ id: 'b1', workOrderId: 'w1', total: 100, paymentStatus: 'unpaid' });
});

describe('markBillPaid', () => {
  it('stores method and reference', async () => {
    await markBillPaid('b1', 'Check', '5567');
    const b = await db.billsOfSale.get('b1');
    expect(b.paymentStatus).toBe('paid');
    expect(b.paymentMethod).toBe('Check');
    expect(b.paymentReference).toBe('5567');
  });

  it('defaults reference to empty string', async () => {
    await markBillPaid('b1', 'Cash');
    const b = await db.billsOfSale.get('b1');
    expect(b.paymentReference).toBe('');
  });
});
