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

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const now = () => Date.now();

export const PROFILE_ID = 'profile';

// ---- Business profile -------------------------------------------------------
export async function getProfile() {
  return (await db.businessProfile.get(PROFILE_ID)) || null;
}

export async function saveProfile(data) {
  await db.businessProfile.put({ ...data, id: PROFILE_ID });
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
  const existing = await getBillForWorkOrder(workOrderId);
  if (existing) {
    await db.billsOfSale.update(existing.id, data);
    return existing.id;
  }
  const id = uid();
  await db.billsOfSale.add({ id, workOrderId, createdAt: now(), ...data });
  return id;
}
