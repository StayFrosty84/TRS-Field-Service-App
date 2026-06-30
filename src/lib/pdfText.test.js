import { describe, it, expect } from 'vitest';
import { paymentLines, infoLines } from './pdfText.js';

const D = new Date(2026, 5, 21).getTime();

describe('paymentLines', () => {
  it('returns [] when no payments recorded', () => {
    expect(paymentLines({ total: 100, payments: [] })).toEqual([]);
    expect(paymentLines({ total: 100, paymentStatus: 'unpaid' })).toEqual([]);
  });

  it('omits a blank reference', () => {
    const lines = paymentLines({
      total: 100,
      payments: [{ id: 'p1', amount: 100, method: 'Cash', date: D, reference: '  ' }],
    });
    expect(lines[0]).not.toMatch(/Ref:/);
    expect(lines[0]).toMatch(/Cash/);
  });

  it('shows a present reference', () => {
    const lines = paymentLines({
      total: 100,
      payments: [{ id: 'p1', amount: 100, method: 'Check', date: D, reference: '1234' }],
    });
    expect(lines[0]).toMatch(/Ref: 1234/);
    expect(lines[0]).toMatch(/Check/);
  });

  it('uses a generic label when method is blank', () => {
    const lines = paymentLines({
      total: 100,
      payments: [{ id: 'p1', amount: 100, method: '', date: D, reference: '' }],
    });
    expect(lines[0]).toMatch(/\(payment\)/);
  });

  it('lists each payment and trails with PAID IN FULL when balance is cleared', () => {
    const lines = paymentLines({
      total: 100,
      payments: [
        { id: 'p1', amount: 40, method: 'Cash', date: D, reference: '' },
        { id: 'p2', amount: 60, method: 'Check', date: D, reference: '99' },
      ],
    });
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('PAID IN FULL');
  });

  it('trails with Balance due when a balance remains', () => {
    const lines = paymentLines({
      total: 100,
      payments: [{ id: 'p1', amount: 40, method: 'Cash', date: D, reference: '' }],
    });
    expect(lines[lines.length - 1]).toMatch(/^Balance due:/);
  });

  it('synthesizes the line for a legacy paid bill', () => {
    const lines = paymentLines({
      total: 50,
      paymentStatus: 'paid',
      paymentMethod: 'Card',
      paymentReference: 'TXN-9',
      paidAt: D,
    });
    expect(lines[0]).toMatch(/Card/);
    expect(lines[0]).toMatch(/Ref: TXN-9/);
    expect(lines[lines.length - 1]).toBe('PAID IN FULL');
  });
});

describe('infoLines', () => {
  it('omits blank fields', () => {
    expect(infoLines({ unitNumber: '', referenceNumber: '  ' })).toEqual([]);
  });
  it('includes present fields', () => {
    expect(infoLines({ unitNumber: '42', referenceNumber: 'PO-7' }))
      .toEqual(['Unit #: 42', 'Reference #: PO-7']);
  });
});
