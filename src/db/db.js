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

export async function saveBill(workOrderId, data) {
  return db.transaction('rw', db.billsOfSale, db.businessProfile, async () => {
    const existing = await db.billsOfSale.where('workOrderId').equals(workOrderId).first();

    // Assign a sequential bill number once, the first time a bill is saved.
    let billNumber = existing?.billNumber;
    if (!billNumber) {
      const profile = (await db.businessProfile.get(PROFILE_ID)) || { id: PROFILE_ID };
      billNumber = profile.nextBillNumber || 1;
      await db.businessProfile.put({ ...profile, nextBillNumber: billNumber + 1 });
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

export async function markBillPaid(id, method) {
  await db.billsOfSale.update(id, { paymentStatus: 'paid', paymentMethod: method || '', paidAt: now() });
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
