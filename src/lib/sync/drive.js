// Thin Google Drive client used as the serverless sync store. Auth uses the OAuth
// authorization-code flow with PKCE and a long-lived refresh token: the app redirects to
// Google's consent screen, a small serverless endpoint (a Google Apps Script web app) exchanges
// the code for tokens (it holds the client secret), and access tokens are refreshed silently — no
// hidden iframe, so iOS Safari/PWA no longer forces a reconnect every session. Scope is
// `drive.file`, so the app only ever sees the files it creates.
//
// Network/redirect boundary lives here; the pure PKCE/refresh logic is in ./pkce.js (tested).
import { randomVerifier, challengeFromVerifier, needsRefresh, buildAuthUrl } from './pkce.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const CLIENT_ID_KEY = 'fs-gdrive-client-id';
const ENDPOINT_KEY = 'fs-gdrive-endpoint';
const TOKENS_KEY = 'fs-gdrive-tokens';
const PKCE_KEY = 'fs-gdrive-pkce';

// ---- Client ID (entered once in Settings, or via VITE_GOOGLE_CLIENT_ID) ----
export function getClientId() {
  return localStorage.getItem(CLIENT_ID_KEY) || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
}
export function setClientId(id) {
  localStorage.setItem(CLIENT_ID_KEY, (id || '').trim());
}

// ---- Token-exchange endpoint (the Google Apps Script /exec URL; via Settings or VITE_SYNC_ENDPOINT) ----
export function getSyncEndpoint() {
  const url = localStorage.getItem(ENDPOINT_KEY) || import.meta.env.VITE_SYNC_ENDPOINT || '';
  return url.trim().replace(/\/$/, '');
}
export function setSyncEndpoint(url) {
  localStorage.setItem(ENDPOINT_KEY, (url || '').trim());
}

// ---- Auth ------------------------------------------------------------------
// Redirect URI = this deployment's base URL (e.g. https://host/field-service-app-v3/). Must be
// byte-identical between the consent request and the exchange, and registered in Google Console.
function redirectUri() {
  return window.location.origin + import.meta.env.BASE_URL;
}

let tokens = loadTokens(); // { refresh_token, access_token, expiry }
function loadTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY)) || {};
  } catch {
    return {};
  }
}
function setTokens(patch) {
  tokens = { ...tokens, ...patch };
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

// Start interactive sign-in: redirect the whole page to Google's consent screen. Returns only
// in the sense that the page then navigates away; the code comes back via completeAuthFromRedirect.
export async function beginAuth() {
  const clientId = getClientId();
  if (!clientId) throw new Error('No Google Client ID configured.');
  if (!getSyncEndpoint()) throw new Error('No sync endpoint (Apps Script URL) configured.');
  const verifier = randomVerifier();
  const state = randomVerifier();
  const challenge = await challengeFromVerifier(verifier);
  localStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  window.location.assign(buildAuthUrl({ clientId, redirectUri: redirectUri(), challenge, state }));
}

// On app load, exchange a `?code=` (if Google just redirected back) for tokens. Returns true when
// it handled a sign-in return, false when there's no code. Throws on error/state mismatch.
export async function completeAuthFromRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return false;

  let pkce = {};
  try {
    pkce = JSON.parse(localStorage.getItem(PKCE_KEY)) || {};
  } catch {
    /* treat as missing */
  }
  localStorage.removeItem(PKCE_KEY);
  // Strip the code/error from the URL so a reload can't replay it.
  window.history.replaceState(null, '', window.location.origin + window.location.pathname);

  if (error) throw new Error(`Google sign-in failed: ${error}`);
  if (!pkce.verifier || params.get('state') !== pkce.state) {
    throw new Error('Sign-in could not be verified — please try connecting again.');
  }

  // text/plain keeps this a CORS "simple" request so the Apps Script endpoint needs no preflight.
  const res = await fetch(getSyncEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'exchange', code, code_verifier: pkce.verifier, redirect_uri: redirectUri() }),
  });
  if (!res.ok) throw new Error(`Sign-in token exchange failed (${res.status}).`);
  const data = await res.json();
  // Apps Script always replies 200, so a failure arrives as an { error } body, not a bad status.
  if (!data.access_token) {
    throw new Error(data.error ? `Sign-in failed: ${data.error}` : 'Sign-in returned no access token.');
  }
  setTokens({
    refresh_token: data.refresh_token || tokens.refresh_token,
    access_token: data.access_token,
    expiry: Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600000),
  });
  return true;
}

// Returns a valid access token: the cached one until ~1 min before expiry, otherwise a silent
// refresh via the endpoint. Throws (→ engine shows "reconnect") if there's no refresh token.
export async function getToken() {
  if (tokens.access_token && !needsRefresh(tokens.expiry, Date.now())) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error('Not connected — please reconnect Google Drive.');
  const endpoint = getSyncEndpoint();
  if (!endpoint) throw new Error('No sync endpoint (Apps Script URL) configured.');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'refresh', refresh_token: tokens.refresh_token }),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}). Please reconnect.`);
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(data.error ? `Token refresh failed: ${data.error}` : 'Token refresh returned no access token.');
  }
  setTokens({
    access_token: data.access_token,
    expiry: Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600000),
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
  });
  return tokens.access_token;
}

export function forgetToken() {
  tokens = {};
  localStorage.removeItem(TOKENS_KEY);
}

// ---- REST helpers ----------------------------------------------------------
async function call(path, { method = 'GET', token, query, body, headers } = {}) {
  const url = new URL(path.startsWith('http') ? path : API + path);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
  if (!res.ok) throw new Error(`Drive ${method} ${url.pathname} → ${res.status}`);
  return res;
}

// Find the app's sync folder (created by us, so visible under drive.file), or create it.
export async function findOrCreateFolder(token, name) {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
  const res = await call('/files', { token, query: { q, fields: 'files(id,name)', spaces: 'drive' } });
  const { files } = await res.json();
  if (files?.length) return files[0].id;
  const created = await call('/files', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    query: { fields: 'id' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  });
  return (await created.json()).id;
}

export async function listFolder(token, folderId) {
  const files = [];
  let pageToken;
  do {
    const query = {
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id,name)',
      pageSize: '1000',
    };
    if (pageToken) query.pageToken = pageToken;
    const json = await (await call('/files', { token, query })).json();
    files.push(...(json.files || []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return files;
}

export async function readJson(token, fileId) {
  return (await call(`/files/${fileId}`, { token, query: { alt: 'media' } })).json();
}

export async function downloadBlob(token, fileId) {
  return (await call(`/files/${fileId}`, { token, query: { alt: 'media' } })).blob();
}

// Create a new file (multipart) or replace an existing file's content (media PATCH).
export async function writeFile(token, { folderId, name, fileId, blob, contentType }) {
  if (fileId) {
    const res = await call(`${UPLOAD}/files/${fileId}`, {
      method: 'PATCH',
      token,
      query: { uploadType: 'media', fields: 'id' },
      headers: { 'Content-Type': contentType || blob.type || 'application/octet-stream' },
      body: blob,
    });
    return (await res.json()).id;
  }
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify({ name, parents: [folderId] })], { type: 'application/json' })
  );
  form.append('file', blob);
  const res = await call(`${UPLOAD}/files`, {
    method: 'POST',
    token,
    query: { uploadType: 'multipart', fields: 'id' },
    body: form,
  });
  return (await res.json()).id;
}
