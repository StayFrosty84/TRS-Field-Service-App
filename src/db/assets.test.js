import { beforeEach, describe, it, expect } from 'vitest';
import {
  db,
  createAccount,
  deleteAccount,
  createWorkOrder,
  createAsset,
  updateAsset,
  deleteAsset,
  assetsForAccount,
  assetHistory,
  SYNCED_TABLES,
} from './db.js';

async function resetDb() {
  if (db.isOpen()) db.close();
  await db.delete();
  await db.open();
  localStorage.clear();
}

describe('assets', () => {
  beforeEach(resetDb);

  it('creates, updates, and lists assets per account (createdAt order)', async () => {
    const acctA = await createAccount({ name: 'Acme' });
    const acctB = await createAccount({ name: 'Bravo' });
    const a1 = await createAsset(acctA, { make: 'Ford', model: 'F-350', unitNumber: '12' });
    const a2 = await createAsset(acctA, { make: 'Kenworth', model: 'T680' });
    await createAsset(acctB, { make: 'Mack' });

    await updateAsset(a2, { plate: 'ABC-123' });

    const list = await assetsForAccount(acctA);
    expect(list.map((a) => a.id)).toEqual([a1, a2]);
    expect(list[1].plate).toBe('ABC-123');
    expect(list[1].updatedAt).toBeGreaterThanOrEqual(list[1].createdAt);
  });

  it('assetHistory returns only that asset\'s work orders, newest first', async () => {
    const acct = await createAccount({ name: 'Acme' });
    const asset = await createAsset(acct, { make: 'Ford' });
    const wo1 = await createWorkOrder({ accountId: acct, assetId: asset, createdAt: 1000 });
    const wo2 = await createWorkOrder({ accountId: acct, assetId: asset, createdAt: 2000 });
    await createWorkOrder({ accountId: acct, assetId: null, createdAt: 3000 });

    const history = await assetHistory(asset);
    expect(history.map((o) => o.id)).toEqual([wo2, wo1]);
  });

  it('deleteAsset records a tombstone and leaves linked WOs untouched', async () => {
    const acct = await createAccount({ name: 'Acme' });
    const asset = await createAsset(acct, { make: 'Ford', unitNumber: '7' });
    const wo = await createWorkOrder({ accountId: acct, assetId: asset, unitNumber: '7' });

    await deleteAsset(asset);

    expect(await db.assets.get(asset)).toBeUndefined();
    expect(await db.tombstones.get(['assets', asset])).toBeTruthy();
    const order = await db.workOrders.get(wo);
    expect(order.assetId).toBe(asset); // dangling link is fine
    expect(order.unitNumber).toBe('7'); // snapshot survives
  });

  it('deleteAccount cascades to its assets with tombstones', async () => {
    const acct = await createAccount({ name: 'Acme' });
    const asset = await createAsset(acct, { make: 'Ford' });

    await deleteAccount(acct);

    expect(await db.assets.get(asset)).toBeUndefined();
    expect(await db.tombstones.get(['assets', asset])).toBeTruthy();
  });

  it('assets is registered for sync', () => {
    expect(SYNCED_TABLES).toContain('assets');
  });
});
