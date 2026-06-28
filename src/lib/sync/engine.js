// Sync engine: one cycle pulls every peer's state file from the Drive folder, merges them
// with the local DB (last-writer-wins), applies the result locally, then pushes this device's
// merged state back. Runs automatically while the app is open and online; never real-time.
import { getDeviceId } from '../../db/db.js';
import { buildLocalState, applyMergedState } from './state.js';
import { mergeStates } from './merge.js';
import * as drive from './drive.js';

const FOLDER = 'Field Service Sync';
const STATE_PREFIX = 'state-';
const BLOB_PREFIX = 'blob-';
const INTERVAL_MS = 20000;
const CONNECTED_KEY = 'fs-gdrive-connected';

let status = {
  configured: drive.getClientId() !== '' && drive.getSyncEndpoint() !== '',
  connected: false,
  syncing: false,
  lastSyncedAt: 0,
  error: null,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
};
const listeners = new Set();
function setStatus(patch) {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}
export function subscribe(fn) {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}
export const getStatus = () => status;
export const isConfigured = () => drive.getClientId() !== '' && drive.getSyncEndpoint() !== '';

let folderId = null;
let timer = null;
let lastPushedJson = '';

const myStateName = () => `${STATE_PREFIX}${getDeviceId()}.json`;

// Interactive: redirects the whole page to Google's consent screen. The page navigates away
// here; the returning authorization code is picked up by init() on the next load.
export async function connect() {
  await drive.beginAuth();
}

export function disconnect() {
  stopAuto();
  folderId = null;
  lastPushedJson = '';
  drive.forgetToken();
  localStorage.removeItem(CONNECTED_KEY);
  setStatus({ connected: false, lastSyncedAt: 0, error: null });
}

export async function syncNow() {
  if (!isConfigured() || status.syncing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  setStatus({ syncing: true, error: null });
  try {
    const token = await drive.getToken();
    if (!folderId) folderId = await drive.findOrCreateFolder(token, FOLDER);
    const files = await drive.listFolder(token, folderId);
    const mine = myStateName();

    const { state, blobs } = await buildLocalState();

    // Pull peers' state files.
    const remoteStates = [];
    for (const f of files) {
      if (f.name !== mine && f.name.startsWith(STATE_PREFIX) && f.name.endsWith('.json')) {
        try {
          remoteStates.push(await drive.readJson(token, f.id));
        } catch {
          /* skip an unreadable peer file this cycle */
        }
      }
    }

    const merged = mergeStates([state, ...remoteStates]);

    // Map of blob hash -> Drive fileId already uploaded.
    const driveBlob = new Map();
    for (const f of files) {
      if (f.name.startsWith(BLOB_PREFIX)) driveBlob.set(f.name.slice(BLOB_PREFIX.length), f.id);
    }

    // Resolve blobs the merge needs: prefer local bytes, else download from Drive.
    const downloaded = new Map();
    const resolveBlob = async (hash) => {
      if (blobs.has(hash)) return blobs.get(hash);
      if (downloaded.has(hash)) return downloaded.get(hash);
      const fileId = driveBlob.get(hash);
      if (!fileId) return null;
      const b = await drive.downloadBlob(token, fileId);
      downloaded.set(hash, b);
      return b;
    };

    await applyMergedState(merged, resolveBlob);

    // Upload any local blobs Drive doesn't have yet (immutable, write-once).
    for (const [hash, blob] of blobs) {
      if (!driveBlob.has(hash)) {
        await drive.writeFile(token, {
          folderId,
          name: BLOB_PREFIX + hash,
          blob,
          contentType: blob.type || 'application/octet-stream',
        });
      }
    }

    // Push our post-merge state — but only if it actually changed, to spare quota.
    const myState = {
      app: 'field-service',
      schemaVersion: 4,
      deviceId: getDeviceId(),
      exportedAt: new Date().toISOString(),
      data: merged.data,
      tombstones: merged.tombstones,
    };
    const json = JSON.stringify({ data: myState.data, tombstones: myState.tombstones });
    if (json !== lastPushedJson) {
      const existing = files.find((f) => f.name === mine);
      await drive.writeFile(token, {
        folderId,
        name: mine,
        fileId: existing?.id,
        blob: new Blob([JSON.stringify(myState)], { type: 'application/json' }),
        contentType: 'application/json',
      });
      lastPushedJson = json;
    }

    setStatus({ connected: true, syncing: false, lastSyncedAt: Date.now(), error: null });
  } catch (e) {
    setStatus({ syncing: false, error: e.message || 'Sync failed' });
  }
}

// ---- Auto-sync (open + online only) ----------------------------------------
function maybeSync() {
  if (navigator.onLine && document.visibilityState === 'visible') syncNow();
}
function onOnline() {
  setStatus({ online: true });
  maybeSync();
}
function onOffline() {
  setStatus({ online: false });
}
function startAuto() {
  stopAuto();
  timer = setInterval(maybeSync, INTERVAL_MS);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', maybeSync);
}
function stopAuto() {
  if (timer) clearInterval(timer);
  timer = null;
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  document.removeEventListener('visibilitychange', maybeSync);
}

// Called once at app startup: finish a sign-in redirect if we're returning from one, otherwise
// resume sync silently if previously connected.
export function init() {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => setStatus({ online: true }));
  window.addEventListener('offline', () => setStatus({ online: false }));
  drive
    .completeAuthFromRedirect()
    .then((returned) => {
      if (returned) {
        localStorage.setItem(CONNECTED_KEY, '1');
        setStatus({ configured: true, connected: true, error: null });
        return syncNow().then(startAuto, startAuto);
      }
      if (isConfigured() && localStorage.getItem(CONNECTED_KEY) === '1') {
        setStatus({ connected: true });
        return syncNow().then(startAuto, startAuto);
      }
    })
    .catch((e) => setStatus({ error: e.message || 'Sign-in failed' }));
}
