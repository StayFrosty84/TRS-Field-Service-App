// Thin Google Drive client used as the serverless sync store. Auth uses Google Identity
// Services' browser "token model" (no refresh token in the page — ~1h access tokens, renewed
// on demand). Scope is `drive.file`, so the app only ever sees the files it creates.
//
// This module is the untestable boundary (it talks to live Google), so logic is kept minimal.

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const CLIENT_ID_KEY = 'fs-gdrive-client-id';

// ---- Client ID (entered once in Settings, or via VITE_GOOGLE_CLIENT_ID) ----
export function getClientId() {
  return localStorage.getItem(CLIENT_ID_KEY) || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
}
export function setClientId(id) {
  localStorage.setItem(CLIENT_ID_KEY, (id || '').trim());
}

// ---- Auth ------------------------------------------------------------------
let gisPromise;
function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

let tokenClient;
let accessToken = '';
let tokenExpiry = 0;

async function ensureTokenClient() {
  await loadGis();
  const clientId = getClientId();
  if (!clientId) throw new Error('No Google Client ID configured.');
  if (!tokenClient || tokenClient.__clientId !== clientId) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: () => {},
    });
    tokenClient.__clientId = clientId;
  }
  return tokenClient;
}

// Returns a valid access token, reusing the cached one until ~1 min before expiry.
// `interactive` allows Google to show its sign-in/consent UI; background syncs pass false
// and simply fail (caught by the engine → "reconnect") if interaction would be required.
export async function getToken({ interactive = false } = {}) {
  if (accessToken && Date.now() < tokenExpiry - 60000) return accessToken;
  const client = await ensureTokenClient();
  return new Promise((resolve, reject) => {
    client.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error));
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3600000);
      resolve(accessToken);
    };
    try {
      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    } catch (e) {
      reject(e);
    }
  });
}

export function forgetToken() {
  accessToken = '';
  tokenExpiry = 0;
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
