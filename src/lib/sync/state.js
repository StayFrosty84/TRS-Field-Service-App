// Bridges the local Dexie DB and the pure merge: builds this device's "state" doc and
// applies a merged result back. Blob fields (photos, signatures, logo) are replaced with
// content-hash references; the actual bytes travel separately (uploaded once to Drive,
// fetched on demand). This keeps the state JSON small and blobs immutable / de-duplicated.
import { db, SYNCED_TABLES, getDeviceId } from '../../db/db.js';

const SCHEMA_VERSION = 4;

// Blob-valued fields to externalize as references, and regenerable fields to drop entirely.
const BLOB_FIELDS = {
  businessProfile: ['logoBlob'],
  photos: ['blob'],
  billsOfSale: ['signatureBlob'],
};
const OMIT_FIELDS = { billsOfSale: ['pdfBlob'] };

async function hashBlob(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const isBlobRef = (v) => v && typeof v === 'object' && typeof v.__blob === 'string';

// Read the whole DB into a state doc + a map of the blob bytes it references.
export async function buildLocalState() {
  const data = {};
  const blobs = new Map(); // blobId (sha256) -> Blob
  for (const table of SYNCED_TABLES) {
    const rows = await db[table].toArray();
    const blobFields = BLOB_FIELDS[table] || [];
    const omit = OMIT_FIELDS[table] || [];
    data[table] = await Promise.all(
      rows.map(async (row) => {
        const out = { ...row };
        if (out.updatedAt == null) out.updatedAt = out.createdAt || 0; // safety net for merge
        for (const f of omit) delete out[f];
        for (const f of blobFields) {
          if (out[f] instanceof Blob) {
            const id = await hashBlob(out[f]);
            blobs.set(id, out[f]);
            out[f] = { __blob: id, mime: out[f].type };
          }
        }
        return out;
      })
    );
  }
  const tombstones = await db.tombstones.toArray();
  const state = {
    app: 'field-service',
    schemaVersion: SCHEMA_VERSION,
    deviceId: getDeviceId(),
    exportedAt: new Date().toISOString(),
    data,
    tombstones,
  };
  return { state, blobs };
}

// Apply a merged { data, tombstones } into the local DB: upsert winning rows (re-attaching
// blob bytes), delete tombstoned rows, and persist the merged tombstone set so it keeps
// propagating. `resolveBlob(blobId)` returns the bytes for a referenced blob (local cache or
// a Drive download). Rows whose blob can't be resolved yet are deferred to a later sync.
export async function applyMergedState(merged, resolveBlob) {
  // Resolve referenced blobs up front — network/IO must not happen inside the Dexie txn.
  const resolved = new Map();
  for (const table of SYNCED_TABLES) {
    for (const f of BLOB_FIELDS[table] || []) {
      for (const row of merged.data[table] || []) {
        const ref = row[f];
        if (isBlobRef(ref) && !resolved.has(ref.__blob)) {
          const blob = await resolveBlob(ref.__blob);
          if (blob instanceof Blob) resolved.set(ref.__blob, blob);
        }
      }
    }
  }

  const deletedByTable = {};
  for (const t of merged.tombstones || []) (deletedByTable[t.table] ||= new Set()).add(t.key);

  const tables = SYNCED_TABLES.map((t) => db[t]).concat(db.tombstones);
  await db.transaction('rw', tables, async () => {
    for (const table of SYNCED_TABLES) {
      const blobFields = BLOB_FIELDS[table] || [];
      const toPut = [];
      for (const row of merged.data[table] || []) {
        const out = { ...row };
        let ready = true;
        for (const f of blobFields) {
          if (isBlobRef(out[f])) {
            const blob = resolved.get(out[f].__blob);
            if (blob) out[f] = blob;
            else {
              ready = false; // bytes not available yet — try again next sync
              break;
            }
          }
        }
        if (ready) toPut.push(out);
      }
      if (toPut.length) await db[table].bulkPut(toPut);
      const del = deletedByTable[table];
      if (del?.size) await db[table].bulkDelete([...del]);
    }
    if (merged.tombstones?.length) await db.tombstones.bulkPut(merged.tombstones);
  });
}
