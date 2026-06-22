import { beforeEach, describe, it, expect } from 'vitest';
import { db, createAccount, addPhoto } from '../../db/db.js';
import { buildLocalState, applyMergedState } from './state.js';
import { mergeStates } from './merge.js';

async function resetDb() {
  if (db.isOpen()) db.close();
  await db.delete();
  await db.open();
  localStorage.clear();
}

describe('state build + apply', () => {
  beforeEach(resetDb);

  it('encodes blob fields as content-hash refs and collects the blob bytes', async () => {
    const photoBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    const photoId = await addPhoto('wo1', photoBlob);

    const { state, blobs } = await buildLocalState();

    const row = state.data.photos.find((p) => p.id === photoId);
    expect(row.blob).toMatchObject({ __blob: expect.any(String), mime: 'image/png' });
    expect(row.blob).not.toBeInstanceOf(Blob);
    expect(blobs.has(row.blob.__blob)).toBe(true);
  });

  it('round-trips a peer record and a blob through merge → apply', async () => {
    const accountId = await createAccount({ name: 'Acme' });
    const photoBlob = new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' });
    const photoId = await addPhoto('wo1', photoBlob);

    const { state, blobs } = await buildLocalState();
    const remote = {
      data: { contacts: [{ id: 'c1', accountId, name: 'Sam', updatedAt: 999 }] },
      tombstones: [],
    };
    const merged = mergeStates([state, remote]);

    await applyMergedState(merged, (id) => blobs.get(id));

    expect((await db.contacts.get('c1')).name).toBe('Sam');
    const photo = await db.photos.get(photoId);
    expect(photo.blob).toBeInstanceOf(Blob);
    expect([...new Uint8Array(await photo.blob.arrayBuffer())]).toEqual([9, 8, 7]);
    expect((await db.accounts.get(accountId)).name).toBe('Acme');
  });

  it('applies a tombstone by deleting the local row and persisting the tombstone', async () => {
    const accountId = await createAccount({ name: 'ToDelete' });
    const { state } = await buildLocalState();
    const merged = mergeStates([
      state,
      { data: {}, tombstones: [{ table: 'accounts', key: accountId, deletedAt: Date.now() + 1000 }] },
    ]);

    await applyMergedState(merged, () => null);

    expect(await db.accounts.get(accountId)).toBeUndefined();
    expect(await db.tombstones.get(['accounts', accountId])).toBeTruthy();
  });
});
