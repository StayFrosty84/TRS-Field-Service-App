import { describe, it, expect } from 'vitest';
import { smsHref } from './format.js';

describe('smsHref', () => {
  it('builds an sms: link from a phone number', () => {
    expect(smsHref({ number: '5185551234' })).toBe('sms:5185551234');
  });

  it('strips formatting characters, keeping +, *, #', () => {
    expect(smsHref({ number: '+1 (518) 555-1234' })).toBe('sms:+15185551234');
  });

  it('ignores the extension (cannot auto-text an extension)', () => {
    expect(smsHref({ number: '5185551234', ext: '42' })).toBe('sms:5185551234');
  });

  it('returns sms: with empty body for a missing/blank number', () => {
    expect(smsHref({})).toBe('sms:');
    expect(smsHref(null)).toBe('sms:');
  });
});
