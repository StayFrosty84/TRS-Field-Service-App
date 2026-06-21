export const money = (n) =>
  (Number(n) || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export const fmtDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

// <input type="date"> helpers (local-time safe).
export const toDateInput = (ts) => {
  const d = ts ? new Date(ts) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const fromDateInput = (str) => {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
};

export const fmtDateTime = (ts) =>
  ts
    ? new Date(ts).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

// ---- Phone numbers ----------------------------------------------------------
// Accounts/contacts store `phones: [{ label, number, ext }]`. Older records used a
// single `phone` string; normalize both shapes to one list for display + calling.
export function getPhones(entity) {
  const list = Array.isArray(entity?.phones) ? entity.phones : [];
  const cleaned = list.filter((p) => (p?.number || '').trim());
  if (cleaned.length) return cleaned;
  if (entity?.phone) return [{ label: '', number: entity.phone, ext: '' }];
  return [];
}

// tel: link; a comma makes the dialer pause before sending the extension digits.
export function telHref(p) {
  const num = String(p?.number || '').replace(/[^\d+*#]/g, '');
  const ext = String(p?.ext || '').replace(/\D/g, '');
  return ext ? `tel:${num},${ext}` : `tel:${num}`;
}

export function fmtPhone(p) {
  const num = (p?.number || '').trim();
  const ext = (p?.ext || '').trim();
  return ext ? `${num} ext. ${ext}` : num;
}

// Bill-of-sale totals from line items + optional tax and credit-card surcharge.
// The card fee (when applied) is charged on subtotal + tax — the amount that hits the card.
export function computeTotals(lineItems = [], taxRate = 0, ccFeeRate = 0, ccFeeApplied = false) {
  const subtotal = lineItems.reduce(
    (sum, li) => sum + (Number(li.qty) || 0) * (Number(li.unitPrice) || 0),
    0
  );
  const taxAmount = subtotal * ((Number(taxRate) || 0) / 100);
  const beforeFee = subtotal + taxAmount;
  const ccFeeAmount = ccFeeApplied ? beforeFee * ((Number(ccFeeRate) || 0) / 100) : 0;
  return { subtotal, taxAmount, ccFeeAmount, total: beforeFee + ccFeeAmount };
}
