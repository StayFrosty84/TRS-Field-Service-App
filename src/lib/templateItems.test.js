import { describe, it, expect } from 'vitest';
import { resolveTemplateItem, resolveTemplateItems, workTypesUsing } from './templateItems.js';

const catalog = new Map([
  ['abc', { id: 'abc', description: 'Labor / hr', unitPrice: 95 }],
  ['def', { id: 'def', description: 'Tire disposal', unitPrice: 6 }],
]);

describe('resolveTemplateItem', () => {
  it('resolves a catalog reference to the live description and price', () => {
    expect(resolveTemplateItem({ catalogItemId: 'abc', qty: 2 }, catalog)).toEqual({
      catalogItemId: 'abc',
      description: 'Labor / hr',
      unitPrice: 95,
      qty: 2,
      missing: false,
    });
  });

  it('flags a reference whose catalog item is gone', () => {
    const r = resolveTemplateItem({ catalogItemId: 'zzz', qty: 1 }, catalog);
    expect(r.missing).toBe(true);
    expect(r.unitPrice).toBe(0);
  });

  it('passes a legacy free-form row through using its own fields', () => {
    expect(resolveTemplateItem({ description: 'Disposal fee', qty: 3, unitPrice: 25 }, catalog)).toEqual({
      description: 'Disposal fee',
      unitPrice: 25,
      qty: 3,
      missing: false,
    });
  });

  it('defaults qty to 1', () => {
    expect(resolveTemplateItem({ catalogItemId: 'def' }, catalog).qty).toBe(1);
  });
});

describe('resolveTemplateItems', () => {
  it('resolves a mixed list', () => {
    const out = resolveTemplateItems(
      [{ catalogItemId: 'abc', qty: 2 }, { description: 'One-off', qty: 1, unitPrice: 10 }],
      catalog
    );
    expect(out.map((i) => i.description)).toEqual(['Labor / hr', 'One-off']);
    expect(out.map((i) => i.unitPrice)).toEqual([95, 10]);
  });
});

describe('workTypesUsing', () => {
  const types = [
    { id: 't1', name: 'Tire Job', items: [{ catalogItemId: 'abc', qty: 2 }, { catalogItemId: 'def', qty: 1 }] },
    { id: 't2', name: 'Brake Job', items: [{ catalogItemId: 'abc', qty: 1 }] },
    { id: 't3', name: 'Legacy', items: [{ description: 'Freeform', qty: 1, unitPrice: 5 }] },
    { id: 't4', name: 'Empty' },
  ];

  it('returns only work types referencing the catalog item', () => {
    expect(workTypesUsing(types, 'abc').map((t) => t.name)).toEqual(['Tire Job', 'Brake Job']);
    expect(workTypesUsing(types, 'def').map((t) => t.name)).toEqual(['Tire Job']);
  });

  it('ignores legacy free-form rows and empty work types', () => {
    expect(workTypesUsing(types, 'nope')).toEqual([]);
  });
});
