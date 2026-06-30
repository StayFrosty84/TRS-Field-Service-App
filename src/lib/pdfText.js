import { money, fmtDate } from './format.js';
import { normalizePayments, billBalance } from './payments.js';

// The payments/PAID lines for the PDF: one line per recorded payment (amount, method,
// optional reference, date), trailed by "PAID IN FULL" or "Balance due: $X". A blank
// reference is omitted. Returns [] when nothing is paid.
export function paymentLines(bill) {
  const payments = normalizePayments(bill);
  if (payments.length === 0) return [];
  const lines = payments.map((p) => {
    const ref = (p.reference || '').trim();
    return (
      `${money(p.amount)} (${p.method || 'payment'})` +
      `${ref ? ` · Ref: ${ref}` : ''}` +
      ` · ${fmtDate(p.date)}`
    );
  });
  const bal = billBalance(bill);
  lines.push(bal <= 0 ? 'PAID IN FULL' : `Balance due: ${money(bal)}`);
  return lines;
}

// Work-order Unit #/Reference # lines for the Service column — only when filled.
export function infoLines(workOrder) {
  const lines = [];
  const unit = (workOrder?.unitNumber || '').trim();
  const ref = (workOrder?.referenceNumber || '').trim();
  if (unit) lines.push(`Unit #: ${unit}`);
  if (ref) lines.push(`Reference #: ${ref}`);
  return lines;
}
