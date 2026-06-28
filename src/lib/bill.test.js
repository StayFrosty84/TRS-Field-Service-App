import { describe, it, expect } from 'vitest';
import { cleanLineItems, billHasContent } from './bill.js';

describe('cleanLineItems', () => {
  it('drops blank rows and coerces numbers', () => {
    const rows = [
      { id: '1', description: '  Filter ', qty: '2', unitPrice: '10' },
      { id: '2', description: '', qty: '', unitPrice: '' },
      { id: '3', description: '', qty: '1', unitPrice: '5' }, // priced, no desc → kept
    ];
    expect(cleanLineItems(rows)).toEqual([
      { description: 'Filter', qty: 2, unitPrice: 10 },
      { description: '', qty: 1, unitPrice: 5 },
    ]);
  });
});

describe('billHasContent', () => {
  it('is false for only-blank rows', () => {
    expect(billHasContent([{ description: '', qty: '', unitPrice: '' }])).toBe(false);
  });
  it('is true when a described or priced row exists', () => {
    expect(billHasContent([{ description: 'Labor', qty: 1, unitPrice: 0 }])).toBe(true);
    expect(billHasContent([{ description: '', qty: 1, unitPrice: 25 }])).toBe(true);
  });
});
