import { describe, it, expect, beforeEach } from 'vitest';
import { db, markBillPaid } from './db.js';

beforeEach(async () => {
  await db.billsOfSale.clear();
  await db.billsOfSale.add({ id: 'b1', workOrderId: 'w1', total: 100, paymentStatus: 'unpaid' });
});

describe('markBillPaid', () => {
  it('records a full-balance payment with its method and reference', async () => {
    await markBillPaid('b1', 'Check', '5567');
    const b = await db.billsOfSale.get('b1');
    expect(b.paymentStatus).toBe('paid'); // mirrored for the v2 index
    expect(b.payments).toHaveLength(1);
    expect(b.payments[0]).toMatchObject({ amount: 100, method: 'Check', reference: '5567' });
  });

  it('defaults reference to empty string', async () => {
    await markBillPaid('b1', 'Cash');
    const b = await db.billsOfSale.get('b1');
    expect(b.payments[0].reference).toBe('');
  });
});
