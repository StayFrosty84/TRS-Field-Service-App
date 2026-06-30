import { db } from '../db/db.js';

const TABLES = [
  'businessProfile',
  'accounts',
  'contacts',
  'workOrders',
  'photos',
  'billsOfSale',
  'catalogItems',
  'workTypes',
  'stages',
];
const SCHEMA_VERSION = 3;
const LAST_BACKUP_KEY = 'fs-last-backup';

export const lastBackupAt = () => Number(localStorage.getItem(LAST_BACKUP_KEY) || 0);

// Fields that hold Blobs and must be base64-encoded for a portable JSON backup.
const BLOB_FIELDS = {
  businessProfile: ['logoBlob'],
  photos: ['blob'],
  billsOfSale: ['signatureBlob'],
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result); // data URL incl. mime
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = (head.match(/data:(.*?);base64/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Fields kept on-device but excluded from backups (regenerable, would bloat the file).
const OMIT_FIELDS = { billsOfSale: ['pdfBlob'] };

export async function exportBackup() {
  const data = {};
  for (const table of TABLES) {
    const rows = await db[table].toArray();
    const fields = BLOB_FIELDS[table] || [];
    const omit = OMIT_FIELDS[table] || [];
    data[table] = await Promise.all(
      rows.map(async (row) => {
        const out = { ...row };
        for (const f of omit) delete out[f];
        for (const f of fields) {
          if (out[f] instanceof Blob) out[f] = await blobToBase64(out[f]);
        }
        return out;
      })
    );
  }
  const bundle = {
    app: 'field-service',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  return new Blob([JSON.stringify(bundle)], { type: 'application/json' });
}

export async function importBackup(file) {
  const text = await file.text();
  const bundle = JSON.parse(text);
  if (bundle.app !== 'field-service' || !bundle.data) {
    throw new Error('This file is not a Field Service backup.');
  }

  // Replace everything with the backup's contents (full restore).
  await db.transaction('rw', TABLES.map((t) => db[t]), async () => {
    for (const table of TABLES) {
      const fields = BLOB_FIELDS[table] || [];
      const rows = (bundle.data[table] || []).map((row) => {
        const out = { ...row };
        for (const f of fields) {
          if (typeof out[f] === 'string' && out[f].startsWith('data:')) out[f] = dataUrlToBlob(out[f]);
        }
        return out;
      });
      await db[table].clear();
      if (rows.length) await db[table].bulkAdd(rows);
    }
  });

  // Summary counts for the confirmation toast.
  return Object.fromEntries(TABLES.map((t) => [t, (bundle.data[t] || []).length]));
}

export const backupFilename = () =>
  `field-service-backup-${new Date().toISOString().slice(0, 10)}.json`;
