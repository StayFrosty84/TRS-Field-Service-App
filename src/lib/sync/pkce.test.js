import { describe, it, expect } from 'vitest';
import {
  base64UrlEncode,
  randomVerifier,
  challengeFromVerifier,
  needsRefresh,
  buildAuthUrl,
} from './pkce.js';

describe('base64UrlEncode', () => {
  it('uses url-safe characters instead of + and /', () => {
    expect(base64UrlEncode(new Uint8Array([251, 255, 191]))).toBe('-_-_');
  });

  it('strips padding', () => {
    expect(base64UrlEncode(new Uint8Array([255]))).toBe('_w');
  });
});

describe('randomVerifier', () => {
  it('produces a 43-char url-safe string (RFC 7636 length)', () => {
    const v = randomVerifier();
    expect(v).toHaveLength(43);
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is different each call', () => {
    expect(randomVerifier()).not.toBe(randomVerifier());
  });
});

describe('challengeFromVerifier', () => {
  it('matches the RFC 7636 known-answer vector', async () => {
    expect(await challengeFromVerifier('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    );
  });
});

describe('needsRefresh', () => {
  it('is false for a token comfortably before expiry', () => {
    expect(needsRefresh(1_000_000, 0)).toBe(false);
  });

  it('is true once within the skew window', () => {
    expect(needsRefresh(100_000, 50_000, 60_000)).toBe(true);
  });

  it('is true for an expired token', () => {
    expect(needsRefresh(100_000, 200_000)).toBe(true);
  });

  it('is true when there is no expiry', () => {
    expect(needsRefresh(0, 5_000)).toBe(true);
    expect(needsRefresh(undefined, 5_000)).toBe(true);
  });
});

describe('buildAuthUrl', () => {
  it('builds a Google consent URL with PKCE + offline-access params', () => {
    const url = buildAuthUrl({
      clientId: 'cid',
      redirectUri: 'https://app.example/',
      challenge: 'chal',
      state: 'st',
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const q = u.searchParams;
    expect(q.get('client_id')).toBe('cid');
    expect(q.get('redirect_uri')).toBe('https://app.example/');
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('prompt')).toBe('consent');
    expect(q.get('code_challenge')).toBe('chal');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('state')).toBe('st');
  });
});
