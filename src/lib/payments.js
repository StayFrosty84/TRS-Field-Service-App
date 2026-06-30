// Source of truth for "how much is paid / owed on a bill". Pure so the DB layer,
// dashboards, PDF, and the per-account rollup all derive paid/unpaid + balance
// identically. Mirrors the existing pure-helper pattern (bill.js, unpaid.js, pdfText.js).
//
// A bill carries `payments: Payment[]` where
//   Payment = { id, amount: number, method: string, date: number (epoch ms), reference: string }.
// Legacy bills have no `payments[]` — only paymentStatus/paymentMethod/paymentReference/paidAt —
// so normalizePayments synthesizes one payment on read (no migration needed).

// Back-compat shim. Returns the bill's Payment[] (modern records pass through unchanged).
// A legacy paymentStatus==='paid' bill synthesizes a single payment for its total.
export function normalizePayments(bill) {
  if (!bill) return [];
  if (Array.isArray(bill.payments) && bill.payments.length > 0) return bill.payments;
  if (bill.paymentStatus === 'paid') {
    return [
      {
        id: 'legacy',
        amount: bill.total || 0,
        method: bill.paymentMethod || '',
        date: bill.paidAt || bill.billDate || bill.createdAt,
        reference: bill.paymentReference || '',
      },
    ];
  }
  return [];
}

export function amountPaid(bill) {
  return normalizePayments(bill).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

export function billBalance(bill) {
  return (bill?.total || 0) - amountPaid(bill);
}

// Derived "paid" status used everywhere a `paymentStatus === 'paid'` check exists today.
// The total > 0 guard keeps a $0 bill (or a draft with no line items) from reading as paid.
export function isPaid(bill) {
  return (bill?.total || 0) > 0 && billBalance(bill) <= 0;
}

export function paymentState(bill) {
  if (isPaid(bill)) return 'paid';
  return amountPaid(bill) > 0 ? 'partial' : 'unpaid';
}

// Latest payment date across a bill's payments, or null when nothing is recorded.
export function lastPaymentDate(bill) {
  let latest = null;
  for (const p of normalizePayments(bill)) {
    if (p.date != null && (latest == null || p.date > latest)) latest = p.date;
  }
  return latest;
}
