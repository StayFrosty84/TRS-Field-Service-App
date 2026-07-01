import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  createCatalogItem,
  deleteCatalogItem,
  createWorkType,
  catalogItemUsage,
  setCatalogItemWorkTypes,
} from './db.js';

beforeEach(async () => {
  await db.catalogItems.clear();
  await db.workTypes.clear();
  await db.tombstones.clear();
});

describe('catalog ↔ work-type linkage', () => {
  it('catalogItemUsage lists names of work types referencing the item', async () => {
    const cid = await createCatalogItem({ description: 'Labor / hr', unitPrice: 95 });
    await createWorkType({ name: 'Tire Job', items: [{ catalogItemId: cid, qty: 2 }] });
    await createWorkType({ name: 'Brake Job', items: [{ catalogItemId: cid, qty: 1 }] });
    await createWorkType({ name: 'Legacy', items: [{ description: 'x', qty: 1, unitPrice: 5 }] });

    expect((await catalogItemUsage(cid)).sort()).toEqual(['Brake Job', 'Tire Job']);
  });

  it('deleteCatalogItem is blocked when referenced, with the work-type names', async () => {
    const cid = await createCatalogItem({ description: 'Labor / hr', unitPrice: 95 });
    await createWorkType({ name: 'Tire Job', items: [{ catalogItemId: cid, qty: 2 }] });

    await expect(deleteCatalogItem(cid)).rejects.toMatchObject({ usedIn: ['Tire Job'] });
    expect(await db.catalogItems.get(cid)).toBeTruthy(); // not deleted
    expect(await db.tombstones.get(['catalogItems', cid])).toBeUndefined();
  });

  it('deleteCatalogItem succeeds and tombstones when unreferenced', async () => {
    const cid = await createCatalogItem({ description: 'Spare', unitPrice: 1 });
    await deleteCatalogItem(cid);
    expect(await db.catalogItems.get(cid)).toBeUndefined();
    expect(await db.tombstones.get(['catalogItems', cid])).toBeTruthy();
  });

  it('setCatalogItemWorkTypes adds rows to checked types and removes from unchecked, idempotently', async () => {
    const cid = await createCatalogItem({ description: 'Labor / hr', unitPrice: 95 });
    const t1 = await createWorkType({ name: 'Tire Job', items: [] });
    const t2 = await createWorkType({ name: 'Brake Job', items: [{ catalogItemId: cid, qty: 1 }] });
    const t3 = await createWorkType({ name: 'Oil Change', items: [] });

    // Check t1 and t2, leave t3 unchecked.
    await setCatalogItemWorkTypes(cid, [t1, t2]);
    const has = async (id) => (await db.workTypes.get(id)).items.some((it) => it.catalogItemId === cid);
    expect(await has(t1)).toBe(true);
    expect(await has(t2)).toBe(true);
    expect(await has(t3)).toBe(false);

    // t1 should have exactly one row (no duplicate) at qty 1.
    const t1row = (await db.workTypes.get(t1)).items.filter((it) => it.catalogItemId === cid);
    expect(t1row).toEqual([{ catalogItemId: cid, qty: 1 }]);

    // Re-running with t2 unchecked removes it; re-checking t1 does not duplicate.
    await setCatalogItemWorkTypes(cid, [t1]);
    expect(await has(t1)).toBe(true);
    expect(await has(t2)).toBe(false);
    expect((await db.workTypes.get(t1)).items.filter((it) => it.catalogItemId === cid)).toHaveLength(1);
  });

  it('setCatalogItemWorkTypes preserves other rows on a work type', async () => {
    const cid = await createCatalogItem({ description: 'Labor / hr', unitPrice: 95 });
    const other = { description: 'Keep me', qty: 1, unitPrice: 9 };
    const t1 = await createWorkType({ name: 'Tire Job', items: [other] });
    await setCatalogItemWorkTypes(cid, [t1]);
    const items = (await db.workTypes.get(t1)).items;
    expect(items).toContainEqual(other);
    expect(items).toContainEqual({ catalogItemId: cid, qty: 1 });
  });
});
