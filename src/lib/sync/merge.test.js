import { describe, it, expect } from 'vitest';
import { mergeStates } from './merge.js';

// A "state" is one device's view: { data: { table: rows[] }, tombstones: [{table,key,deletedAt}] }.
// Every row has an `id` and an `updatedAt`. mergeStates is a pure last-writer-wins merge
// across any number of states; output data arrays are sorted by id for determinism.

describe('mergeStates', () => {
  it('keeps the record version with the newer updatedAt', () => {
    const a = { data: { accounts: [{ id: '1', name: 'Old', updatedAt: 100 }] }, tombstones: [] };
    const b = { data: { accounts: [{ id: '1', name: 'New', updatedAt: 200 }] }, tombstones: [] };
    const merged = mergeStates([a, b]);
    expect(merged.data.accounts).toEqual([{ id: '1', name: 'New', updatedAt: 200 }]);
    expect(merged.tombstones).toEqual([]);
  });

  it('unions distinct records from different states', () => {
    const a = { data: { accounts: [{ id: '1', name: 'A', updatedAt: 100 }] }, tombstones: [] };
    const b = { data: { accounts: [{ id: '2', name: 'B', updatedAt: 100 }] }, tombstones: [] };
    const merged = mergeStates([a, b]);
    expect(merged.data.accounts).toEqual([
      { id: '1', name: 'A', updatedAt: 100 },
      { id: '2', name: 'B', updatedAt: 100 },
    ]);
  });

  it('lets a tombstone beat a stale update (record is deleted)', () => {
    const a = { data: { contacts: [{ id: '1', name: 'X', updatedAt: 100 }] }, tombstones: [] };
    const b = { data: { contacts: [] }, tombstones: [{ table: 'contacts', key: '1', deletedAt: 200 }] };
    const merged = mergeStates([a, b]);
    expect(merged.data.contacts).toEqual([]);
    expect(merged.tombstones).toEqual([{ table: 'contacts', key: '1', deletedAt: 200 }]);
  });

  it('lets a newer update beat a stale tombstone (record survives)', () => {
    const a = { data: { contacts: [{ id: '1', name: 'X', updatedAt: 300 }] }, tombstones: [] };
    const b = { data: { contacts: [] }, tombstones: [{ table: 'contacts', key: '1', deletedAt: 200 }] };
    const merged = mergeStates([a, b]);
    expect(merged.data.contacts).toEqual([{ id: '1', name: 'X', updatedAt: 300 }]);
    expect(merged.tombstones).toEqual([]);
  });

  it('is idempotent: merging a merged result with itself changes nothing', () => {
    const a = { data: { accounts: [{ id: '1', name: 'New', updatedAt: 200 }] }, tombstones: [{ table: 'contacts', key: '9', deletedAt: 50 }] };
    const once = mergeStates([a]);
    const twice = mergeStates([once, once]);
    expect(twice).toEqual(once);
  });

  it('is commutative: state order does not affect the result', () => {
    const a = { data: { accounts: [{ id: '1', name: 'Old', updatedAt: 100 }] }, tombstones: [] };
    const b = { data: { accounts: [{ id: '1', name: 'New', updatedAt: 200 }] }, tombstones: [] };
    expect(mergeStates([a, b])).toEqual(mergeStates([b, a]));
  });
});
