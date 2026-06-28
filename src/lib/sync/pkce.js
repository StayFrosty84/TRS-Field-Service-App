// Pure PKCE + token-refresh helpers for the Google Drive authorization-code flow.
// No DOM/network here, so it's unit-tested directly (see pkce.test.js).

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

// Base64url (RFC 4648 §5): url-safe alphabet, no padding.
export function base64UrlEncode(bytes) {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 32 random bytes → 43-char base64url string (within RFC 7636's 43–128 range).
export function randomVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

// S256 code challenge = BASE64URL(SHA-256(ASCII(verifier))).
export async function challengeFromVerifier(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// True when the cached access token is missing, expired, or within `skewMs` of expiry.
export function needsRefresh(expiry, now, skewMs = 60000) {
  return !expiry || now >= expiry - skewMs;
}

// Google consent URL requesting an authorization code with offline access (→ refresh token).
export function buildAuthUrl({ clientId, redirectUri, challenge, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${AUTH_ENDPOINT}?${params}`;
}
