import { describe, it, expect, beforeEach } from 'vitest';
import { db, createWorkType, cloneWorkType, listWorkTypes } from './db.js';

beforeEach(async () => {
  await db.workTypes.clear();
});

describe('cloneWorkType', () => {
  it('creates an independent copy with "(copy)" name, same icon and items', async () => {
    const src = await createWorkType({
      name: 'Tire Job',
      icon: 'wrench',
      items: [{ catalogItemId: 'abc', qty: 2 }, { description: 'One-off', qty: 1, unitPrice: 10 }],
    });

    const cloneId = await cloneWorkType(src);
    expect(cloneId).toBeTruthy();
    expect(cloneId).not.toBe(src);

    const clone = await db.workTypes.get(cloneId);
    expect(clone.name).toBe('Tire Job (copy)');
    expect(clone.icon).toBe('wrench');
    expect(clone.items).toEqual([{ catalogItemId: 'abc', qty: 2 }, { description: 'One-off', qty: 1, unitPrice: 10 }]);
    expect(await listWorkTypes()).toHaveLength(2);
  });

  it('deep-copies items so editing the clone does not mutate the original', async () => {
    const src = await createWorkType({ name: 'Brake Job', icon: 'wrench', items: [{ catalogItemId: 'x', qty: 1 }] });
    const cloneId = await cloneWorkType(src);

    const clone = await db.workTypes.get(cloneId);
    clone.items[0].qty = 99;
    await db.workTypes.put(clone);

    expect((await db.workTypes.get(src)).items[0].qty).toBe(1);
  });

  it('returns null for a missing work type', async () => {
    expect(await cloneWorkType('nope')).toBeNull();
  });
});
