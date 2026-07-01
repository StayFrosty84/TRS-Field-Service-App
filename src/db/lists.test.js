import { describe, it, expect, beforeEach } from 'vitest';
import { db, createListItem, listItems, updateListItem, deleteListItem } from './db.js';

beforeEach(async () => {
  await db.lists.clear();
  await db.tombstones.clear();
});

describe('admin picklists (lists table)', () => {
  it('createListItem appends in order; listItems filters by kind and sorts by order', async () => {
    await createListItem('paymentMethod', 'Cash');
    await createListItem('paymentMethod', 'Check');
    await createListItem('phoneLabel', 'Mobile');

    const methods = await listItems('paymentMethod');
    expect(methods.map((m) => m.name)).toEqual(['Cash', 'Check']);
    expect(methods.map((m) => m.order)).toEqual([0, 1]);

    const labels = await listItems('phoneLabel');
    expect(labels.map((l) => l.name)).toEqual(['Mobile']);
  });

  it('updateListItem renames an item', async () => {
    const id = await createListItem('paymentMethod', 'Zelle');
    await updateListItem(id, { name: 'Venmo' });
    expect((await db.lists.get(id)).name).toBe('Venmo');
  });

  it('deleteListItem removes the row and records a tombstone', async () => {
    const id = await createListItem('accountTerm', 'Net-30');
    await deleteListItem(id);
    expect(await db.lists.get(id)).toBeUndefined();
    expect(await db.tombstones.get(['lists', id])).toBeTruthy();
  });
});
