import Dexie from 'dexie';

// Single local IndexedDB database. Everything lives on the device.
export const db = new Dexie('field-service');

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

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const now = () => Date.now();

export const PROFILE_ID = 'profile';

// ---- Business profile -------------------------------------------------------
export async function getProfile() {
  return (await db.businessProfile.get(PROFILE_ID)) || null;
}

export async function saveProfile(data) {
  // Merge so fields managed elsewhere (e.g. nextBillNumber) aren't wiped.
  const existing = (await db.businessProfile.get(PROFILE_ID)) || {};
  await db.businessProfile.put({ ...existing, ...data, id: PROFILE_ID });
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
}

// ---- Contacts ---------------------------------------------------------------
export async function createContact(data) {
  const id = uid();
  await db.contacts.add({ id, createdAt: now(), ...data });
  return id;
}

export async function updateContact(id, data) {
  await db.contacts.update(id, data);
}

export async function deleteContact(id) {
  await db.contacts.delete(id);
}

// ---- Work orders ------------------------------------------------------------
export async function createWorkOrder(data) {
  const id = uid();
  await db.workOrders.add({
    id,
    status: 'open',
    serviceDate: now(),
    createdAt: now(),
    completedAt: null,
    ...data,
  });
  return id;
}

export async function updateWorkOrder(id, data) {
  await db.workOrders.update(id, data);
}

export async function deleteWorkOrder(id) {
  const photos = await db.photos.where('workOrderId').equals(id).toArray();
  const bills = await db.billsOfSale.where('workOrderId').equals(id).toArray();
  await db.photos.bulkDelete(photos.map((p) => p.id));
  await db.billsOfSale.bulkDelete(bills.map((b) => b.id));
  await db.workOrders.delete(id);
}

// ---- Photos -----------------------------------------------------------------
export async function addPhoto(workOrderId, blob) {
  const id = uid();
  await db.photos.add({ id, workOrderId, blob, createdAt: now() });
  return id;
}

export async function deletePhoto(id) {
  await db.photos.delete(id);
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
      await db.billsOfSale.update(existing.id, { ...data, billNumber });
      return existing.id;
    }
    const id = uid();
    await db.billsOfSale.add({
      id,
      workOrderId,
      createdAt: now(),
      paymentStatus: 'unpaid',
      billNumber,
      ...data,
    });
    return id;
  });
}

export async function savePdfToBill(billId, pdfBlob) {
  await db.billsOfSale.update(billId, { pdfBlob, pdfGeneratedAt: now() });
}

export async function markBillPaid(id, method, reference = '') {
  await db.billsOfSale.update(id, {
    paymentStatus: 'paid',
    paymentMethod: method || '',
    paymentReference: reference || '',
    paidAt: now(),
  });
}

export async function markBillUnpaid(id) {
  await db.billsOfSale.update(id, { paymentStatus: 'unpaid', paidAt: null });
}

// ---- Parts & labor catalog --------------------------------------------------
export async function listCatalog() {
  return db.catalogItems.orderBy('description').toArray();
}

export async function createCatalogItem(data) {
  const id = uid();
  await db.catalogItems.add({ id, createdAt: now(), ...data });
  return id;
}

export async function updateCatalogItem(id, data) {
  await db.catalogItems.update(id, data);
}

export async function deleteCatalogItem(id) {
  await db.catalogItems.delete(id);
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
  await db.workTypes.add({ id, createdAt: now(), icon: 'wrench', items: [], ...data });
  return id;
}

export async function updateWorkType(id, data) {
  await db.workTypes.update(id, data);
}

export async function deleteWorkType(id) {
  await db.workTypes.delete(id);
}

// Seed starter work types exactly once. The flag lives on the profile so deleting
// them all won't re-add them on the next boot.
export async function ensureSeedWorkTypes() {
  const profile = await db.businessProfile.get(PROFILE_ID);
  if (profile?.workTypesSeeded) return;
  if ((await db.workTypes.count()) === 0) {
    await db.workTypes.bulkAdd(DEFAULT_WORK_TYPES.map((w) => ({ id: uid(), createdAt: now(), ...w })));
  }
  await saveProfile({ workTypesSeeded: true });
}

export async function updatePhoto(id, blob) {
  await db.photos.update(id, { blob, annotatedAt: now() });
}
