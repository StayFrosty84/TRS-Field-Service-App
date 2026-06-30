import Dexie from 'dexie';
import { normalizePayments } from '../lib/payments.js';
import { DEFAULT_STAGES, seedStageHistory } from '../lib/stages.js';

// Single local IndexedDB database. Everything lives on the device.
// v3 uses its own DB name so it can run side-by-side with v2 on the same github.io origin
// without v2 and v3 fighting over one database (IndexedDB is scoped per origin, not per path).
export const db = new Dexie('field-service-v3');

// Primary key first, then indexed fields used for lookups/sorting.
db.version(1).stores({
  businessProfile: 'id', // always the single row id 'profile'
  accounts: 'id, name, createdAt',
  contacts: 'id, accountId, name, createdAt',
  workOrders: 'id, accountId, contactId, status, createdAt',
  photos: 'id, workOrderId, createdAt',
  billsOfSale: 'id, workOrderId, createdAt',
});

// v2: parts/labor catalog + payment tracking on bills.
db.version(2).stores({
  catalogItems: 'id, description, createdAt',
  billsOfSale: 'id, workOrderId, createdAt, paymentStatus',
});

// v3: work-type line-item templates.
db.version(3).stores({
  workTypes: 'id, name, createdAt',
});

// v4: deletion tombstones + an `updatedAt` convention on every row, for Google Drive sync
// (last-writer-wins needs a timestamp on every record, and deletes need to propagate).
export const SYNCED_TABLES = [
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

db.version(4)
  .stores({
    tombstones: '[table+key], deletedAt',
  })
  .upgrade(async (tx) => {
    // Backfill so every existing row has an updatedAt for merge comparisons.
    // Explicit list of tables that existed at v4 — NOT SYNCED_TABLES, which may
    // gain tables (e.g. `stages` in v5) that don't exist yet during this upgrade.
    for (const name of ['businessProfile', 'accounts', 'contacts', 'workOrders', 'photos', 'billsOfSale', 'catalogItems', 'workTypes']) {
      await tx
        .table(name)
        .toCollection()
        .modify((row) => {
          if (row.updatedAt == null) row.updatedAt = row.createdAt || Date.now();
        });
    }
  });

// v5: configurable work-order stage pipeline (admin-defined stages table).
// Work orders gain `stageId` + `stageHistory` schemalessly (no index, no migration);
// legacy open/completed records map onto the pipeline lazily via resolveStage.
db.version(5).stores({
  stages: 'id, order, createdAt',
});

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const now = () => Date.now();

export const PROFILE_ID = 'profile';

// ---- Sync helpers -----------------------------------------------------------
const DEVICE_ID_KEY = 'fs-device-id';

// Stable per-device/browser id, used to name this device's sync file and break LWW ties.
export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = uid();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// Record a deletion so it propagates to peers and isn't resurrected by a stale copy.
export async function recordTombstone(table, key) {
  await db.tombstones.put({ table, key, deletedAt: now() });
}

// ---- Business profile -------------------------------------------------------
export async function getProfile() {
  return (await db.businessProfile.get(PROFILE_ID)) || null;
}

export async function saveProfile(data) {
  // Merge so fields managed elsewhere (e.g. nextBillNumber) aren't wiped.
  const existing = (await db.businessProfile.get(PROFILE_ID)) || {};
  await db.businessProfile.put({ ...existing, ...data, id: PROFILE_ID, updatedAt: now() });
}

// ---- Accounts ---------------------------------------------------------------
export async function createAccount(data) {
  const id = uid();
  await db.accounts.add({ id, createdAt: now(), updatedAt: now(), ...data });
  return id;
}

export async function updateAccount(id, data) {
  await db.accounts.update(id, { ...data, updatedAt: now() });
}

export async function deleteAccount(id) {
  // Cascade: remove contacts, and their work orders + children.
  const contacts = await db.contacts.where('accountId').equals(id).toArray();
  const orders = await db.workOrders.where('accountId').equals(id).toArray();
  await Promise.all(orders.map((o) => deleteWorkOrder(o.id)));
  await db.contacts.bulkDelete(contacts.map((c) => c.id));
  await db.accounts.delete(id);
  await Promise.all([
    ...contacts.map((c) => recordTombstone('contacts', c.id)),
    recordTombstone('accounts', id),
  ]);
}

// ---- Contacts ---------------------------------------------------------------
export async function createContact(data) {
  const id = uid();
  await db.contacts.add({ id, createdAt: now(), updatedAt: now(), ...data });
  return id;
}

export async function updateContact(id, data) {
  await db.contacts.update(id, { ...data, updatedAt: now() });
}

export async function deleteContact(id) {
  await db.contacts.delete(id);
  await recordTombstone('contacts', id);
}

// ---- Work orders ------------------------------------------------------------
export async function createWorkOrder(data) {
  const id = uid();
  // Start in the first pipeline stage (by order) and seed one history entry, so
  // "days in stage" / "stuck" work from creation. Keeps the legacy status shadow.
  const first = (await listStages())[0] || null;
  const ts = data?.createdAt ?? now();
  await db.workOrders.add({
    id,
    status: 'open',
    serviceDate: now(),
    createdAt: now(),
    updatedAt: now(),
    completedAt: null,
    ...(first ? { stageId: first.id, stageHistory: [{ stageId: first.id, at: ts }] } : {}),
    ...data,
  });
  return id;
}

export async function updateWorkOrder(id, data) {
  await db.workOrders.update(id, { ...data, updatedAt: now() });
}

export async function deleteWorkOrder(id) {
  const photos = await db.photos.where('workOrderId').equals(id).toArray();
  const bills = await db.billsOfSale.where('workOrderId').equals(id).toArray();
  await db.photos.bulkDelete(photos.map((p) => p.id));
  await db.billsOfSale.bulkDelete(bills.map((b) => b.id));
  await db.workOrders.delete(id);
  await Promise.all([
    ...photos.map((p) => recordTombstone('photos', p.id)),
    ...bills.map((b) => recordTombstone('billsOfSale', b.id)),
    recordTombstone('workOrders', id),
  ]);
}

// ---- Photos -----------------------------------------------------------------
export async function addPhoto(workOrderId, blob) {
  const id = uid();
  await db.photos.add({ id, workOrderId, blob, createdAt: now(), updatedAt: now() });
  return id;
}

export async function deletePhoto(id) {
  await db.photos.delete(id);
  await recordTombstone('photos', id);
}

// ---- Bills of sale ----------------------------------------------------------
export async function getBillForWorkOrder(workOrderId) {
  return (await db.billsOfSale.where('workOrderId').equals(workOrderId).first()) || null;
}

// Bill number format: YYYYMMDD + XX, where XX is the 2-digit count for that day (01, 02…).
function dayPrefix(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export async function saveBill(workOrderId, data) {
  return db.transaction('rw', db.billsOfSale, async () => {
    const existing = await db.billsOfSale.where('workOrderId').equals(workOrderId).first();

    // Assign a date-based bill number once, the first time a bill is saved.
    let billNumber = existing?.billNumber;
    if (!billNumber) {
      const prefix = dayPrefix(data.billDate || Date.now());
      const all = await db.billsOfSale.toArray();
      const seq = all.reduce((max, b) => {
        const bn = String(b.billNumber || '');
        if (bn.startsWith(prefix) && bn.length === 10) {
          const n = parseInt(bn.slice(8), 10);
          if (Number.isFinite(n) && n > max) return n;
        }
        return max;
      }, 0);
      billNumber = `${prefix}${String(seq + 1).padStart(2, '0')}`;
    }

    if (existing) {
      await db.billsOfSale.update(existing.id, { ...data, billNumber, updatedAt: now() });
      return existing.id;
    }
    const id = uid();
    await db.billsOfSale.add({
      id,
      workOrderId,
      createdAt: now(),
      updatedAt: now(),
      paymentStatus: 'unpaid',
      billNumber,
      ...data,
    });
    return id;
  });
}

export async function savePdfToBill(billId, pdfBlob) {
  await db.billsOfSale.update(billId, { pdfBlob, pdfGeneratedAt: now(), updatedAt: now() });
}

// ---- Payments (list) --------------------------------------------------------
// A bill carries `payments: Payment[]`; paid/balance derive from it (see lib/payments.js).
// Each write mirrors the derived status into the legacy `paymentStatus` field so the
// v2 paymentStatus index and any not-yet-migrated reader stay correct (no db.version bump).

// Paid status derived from an EXPLICIT payments list — never from the legacy
// paymentStatus. (normalizePayments falls back to paymentStatus when the list is
// empty, which would make clearing a legacy paid bill re-mark it paid.)
function paidFromList(total, payments) {
  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return (total || 0) > 0 && (total || 0) - paid <= 0;
}

// Persist an explicit payment list and mirror the derived paid/unpaid status +
// paidAt. Caller must run this inside a billsOfSale rw transaction.
async function persistPayments(id, total, payments) {
  const derivedPaid = paidFromList(total, payments);
  await db.billsOfSale.update(id, {
    payments,
    paymentStatus: derivedPaid ? 'paid' : 'unpaid',
    paidAt: derivedPaid ? now() : null,
    updatedAt: now(),
  });
}

// Each mutator does its read-modify-write inside one rw transaction so concurrent
// calls (e.g. clear then add) can't interleave and lose or resurrect payments.
export function addBillPayment(id, payment) {
  return db.transaction('rw', db.billsOfSale, async () => {
    const bill = await db.billsOfSale.get(id);
    const payments = [
      ...normalizePayments(bill),
      {
        id: uid(),
        amount: Number(payment.amount) || 0,
        method: payment.method || '',
        date: payment.date || now(),
        reference: (payment.reference || '').trim(),
      },
    ];
    await persistPayments(id, bill?.total, payments);
  });
}

export function removeBillPayment(id, paymentId) {
  return db.transaction('rw', db.billsOfSale, async () => {
    const bill = await db.billsOfSale.get(id);
    const payments = normalizePayments(bill).filter((p) => p.id !== paymentId);
    await persistPayments(id, bill?.total, payments);
  });
}

// One-tap "paid in full": adds a payment for the current outstanding balance.
// Preserves the quick-pay UX. No-op when already fully paid.
export function markBillPaid(id, method, reference = '') {
  return db.transaction('rw', db.billsOfSale, async () => {
    const bill = await db.billsOfSale.get(id);
    const payments = normalizePayments(bill);
    const balance = (bill?.total || 0) - payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    if (balance <= 0) return;
    await persistPayments(id, bill?.total, [
      ...payments,
      { id: uid(), amount: balance, method: method || '', date: now(), reference: (reference || '').trim() },
    ]);
  });
}

// Clear all payments (correct-a-mistake) and mirror status back to unpaid.
export function markBillUnpaid(id) {
  return db.transaction('rw', db.billsOfSale, async () => {
    await db.billsOfSale.update(id, { payments: [], paymentStatus: 'unpaid', paidAt: null, updatedAt: now() });
  });
}

// ---- Parts & labor catalog --------------------------------------------------
export async function listCatalog() {
  return db.catalogItems.orderBy('description').toArray();
}

export async function createCatalogItem(data) {
  const id = uid();
  await db.catalogItems.add({ id, createdAt: now(), updatedAt: now(), ...data });
  return id;
}

export async function updateCatalogItem(id, data) {
  await db.catalogItems.update(id, { ...data, updatedAt: now() });
}

export async function deleteCatalogItem(id) {
  await db.catalogItems.delete(id);
  await recordTombstone('catalogItems', id);
}

// ---- Work types -------------------------------------------------------------
export const DEFAULT_WORK_TYPES = [
  { name: 'Service Call', icon: 'wrench', items: [{ description: 'Service call / trip fee', qty: 1, unitPrice: 65 }] },
  { name: 'Diagnostic', icon: 'search', items: [{ description: 'Diagnostic fee', qty: 1, unitPrice: 95 }] },
  {
    name: 'Tire Job',
    icon: 'wrench',
    items: [
      { description: 'Tire mount & balance', qty: 4, unitPrice: 25 },
      { description: 'Shop supplies', qty: 1, unitPrice: 10 },
    ],
  },
];

export async function listWorkTypes() {
  return db.workTypes.orderBy('createdAt').toArray();
}

export async function createWorkType(data) {
  const id = uid();
  await db.workTypes.add({ id, createdAt: now(), updatedAt: now(), icon: 'wrench', items: [], ...data });
  return id;
}

export async function updateWorkType(id, data) {
  await db.workTypes.update(id, { ...data, updatedAt: now() });
}

export async function deleteWorkType(id) {
  await db.workTypes.delete(id);
  await recordTombstone('workTypes', id);
}

// Seed starter work types exactly once. The flag lives on the profile so deleting
// them all won't re-add them on the next boot.
export async function ensureSeedWorkTypes() {
  const profile = await db.businessProfile.get(PROFILE_ID);
  if (profile?.workTypesSeeded) return;
  if ((await db.workTypes.count()) === 0) {
    await db.workTypes.bulkAdd(
      DEFAULT_WORK_TYPES.map((w) => ({ id: uid(), createdAt: now(), updatedAt: now(), ...w }))
    );
  }
  await saveProfile({ workTypesSeeded: true });
}

export async function updatePhoto(id, blob) {
  await db.photos.update(id, { blob, annotatedAt: now(), updatedAt: now() });
}

// ---- Work-order stages (pipeline) -------------------------------------------
export async function listStages() {
  return db.stages.orderBy('order').toArray();
}

export async function createStage(data) {
  const id = uid();
  // Append at the end of the pipeline by default.
  const max = (await db.stages.toArray()).reduce((m, s) => Math.max(m, s.order ?? 0), -1);
  await db.stages.add({
    id,
    order: max + 1,
    color: 'open',
    isTerminal: false,
    createdAt: now(),
    updatedAt: now(),
    ...data,
  });
  return id;
}

export async function updateStage(id, data) {
  await db.stages.update(id, { ...data, updatedAt: now() });
}

// Block deletion when any work order currently points to this stage (avoids
// orphaning a stageId). Returns the count of in-use work orders, 0 if deleted.
export async function deleteStage(id) {
  // stageId isn't indexed; scan (work-order lists are small for this app).
  const orders = await db.workOrders.toArray();
  const using = orders.filter((o) => o.stageId === id).length;
  if (using > 0) return using;
  await db.stages.delete(id);
  await recordTombstone('stages', id);
  return 0;
}

// Move a work order into a stage. Appends a stageHistory entry (seeding history
// from the legacy status the first time a legacy WO is touched) and keeps the
// compatibility shadow: status + completedAt derived from the target's isTerminal.
export async function setWorkOrderStage(orderId, stage) {
  const order = await db.workOrders.get(orderId);
  if (!order) return;
  const stages = await listStages();
  const history = Array.isArray(order.stageHistory) && order.stageHistory.length
    ? order.stageHistory
    : seedStageHistory(order, stages);
  const enteringTerminal = !!stage.isTerminal;
  // completedAt: stamp on first entry to ANY terminal stage; keep while moving
  // between terminal stages; clear when returning to a non-terminal stage.
  const completedAt = enteringTerminal ? (order.completedAt ?? now()) : null;
  await updateWorkOrder(orderId, {
    stageId: stage.id,
    stageHistory: [...history, { stageId: stage.id, at: now() }],
    status: enteringTerminal ? 'completed' : 'open',
    completedAt,
  });
}

// Seed the default pipeline exactly once. Flag lives on the profile so deleting
// all stages won't re-add them (mirrors ensureSeedWorkTypes).
export async function ensureSeedStages() {
  const profile = await db.businessProfile.get(PROFILE_ID);
  if (profile?.stagesSeeded) return;
  if ((await db.stages.count()) === 0) {
    await db.stages.bulkAdd(
      DEFAULT_STAGES.map((s, i) => ({ id: uid(), order: i, createdAt: now(), updatedAt: now(), ...s }))
    );
  }
  await saveProfile({ stagesSeeded: true });
}
