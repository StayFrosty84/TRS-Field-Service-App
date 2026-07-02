import { describe, it, expect } from 'vitest';
import { fillShareMessage, shareMessageValues, DEFAULT_SHARE_TEMPLATE } from './shareMessage.js';

const values = {
  accountName: 'Acme Trucking',
  businessName: 'TRS Repair',
  docType: 'bill',
  docNumber: '#2026070101',
  total: '$150.00',
};

describe('fillShareMessage', () => {
  it('fills the default template when no custom template is set', () => {
    expect(fillShareMessage('', values)).toBe(
      'Hi Acme Trucking — your bill #2026070101 from TRS Repair is attached. Total: $150.00. Thank you!'
    );
    expect(fillShareMessage(null, values)).toBe(fillShareMessage(DEFAULT_SHARE_TEMPLATE, values));
  });

  it('fills a custom template', () => {
    expect(fillShareMessage('{docType} for {accountName}', values)).toBe('bill for Acme Trucking');
  });

  it('drops empty values and collapses the leftover spacing', () => {
    expect(fillShareMessage('your {docType} {docNumber} is attached', { ...values, docNumber: '' })).toBe(
      'your bill is attached'
    );
  });

  it('leaves unknown tokens visible so typos are easy to spot', () => {
    expect(fillShareMessage('total {tota}', values)).toBe('total {tota}');
  });

  it('preserves newlines in multi-line templates', () => {
    expect(fillShareMessage('Hi {accountName},\n\nYour {docType} is attached.', values)).toBe(
      'Hi Acme Trucking,\n\nYour bill is attached.'
    );
  });
});

describe('shareMessageValues', () => {
  it('derives values from profile, account, order, and bill', () => {
    expect(
      shareMessageValues({
        profile: { businessName: 'TRS Repair' },
        account: { name: 'Acme Trucking' },
        order: { isEstimate: false },
        bill: { billNumber: 2026070101, total: 150 },
      })
    ).toEqual({
      accountName: 'Acme Trucking',
      businessName: 'TRS Repair',
      docType: 'bill',
      docNumber: '#2026070101',
      total: '$150.00',
    });
  });

  it('degrades gracefully when data is missing', () => {
    expect(shareMessageValues({ order: { isEstimate: true }, bill: null })).toEqual({
      accountName: '',
      businessName: '',
      docType: 'estimate',
      docNumber: '',
      total: '',
    });
  });
});
