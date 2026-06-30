// Best-effort draft persistence for not-yet-saved forms (e.g. the New Work Order
// screen). Drafts live in localStorage so a user can wander off — review account
// history, get interrupted — and return with their entries intact, until they
// either save the record or hit Cancel.

export const NEW_WORK_ORDER_DRAFT = 'fs:new-wo-draft';

export function loadDraft(key = NEW_WORK_ORDER_DRAFT) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // missing or corrupt — start fresh
  }
}

export function saveDraft(data, key = NEW_WORK_ORDER_DRAFT) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* storage full or unavailable — drafts are best-effort */
  }
}

export function clearDraft(key = NEW_WORK_ORDER_DRAFT) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// Worth persisting once the user has entered something real. Defaults like the
// service date (always pre-filled with today) don't count.
export function draftHasContent(d) {
  if (!d) return false;
  const filled = [
    d.accountId,
    d.newAccountName,
    d.contactId,
    d.newContactName,
    d.newContactPhone,
    d.locationText,
    d.issue,
    d.unitNumber,
    d.referenceNumber,
    d.workTypeId,
  ].some((v) => (v ?? '').toString().trim() !== '');
  return filled || Boolean(d.isEstimate);
}
