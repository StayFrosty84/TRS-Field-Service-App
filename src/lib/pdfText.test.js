import { describe, it, expect } from 'vitest';
import { paidLine, infoLines } from './pdfText.js';

describe('paidLine', () => {
  it('returns null when unpaid', () => {
    expect(paidLine({ paymentStatus: 'unpaid' })).toBeNull();
  });
  it('PAID with method and reference', () => {
    expect(paidLine({ paymentStatus: 'paid', paymentMethod: 'Check', paymentReference: '1234' }))
      .toBe('PAID (Check) · Ref: 1234');
  });
  it('PAID with method only', () => {
    expect(paidLine({ paymentStatus: 'paid', paymentMethod: 'Cash' })).toBe('PAID (Cash)');
  });
  it('PAID with reference only', () => {
    expect(paidLine({ paymentStatus: 'paid', paymentReference: 'TXN-9' })).toBe('PAID · Ref: TXN-9');
  });
  it('bare PAID', () => {
    expect(paidLine({ paymentStatus: 'paid' })).toBe('PAID');
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
