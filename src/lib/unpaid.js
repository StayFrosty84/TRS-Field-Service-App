// "Who owes me money": the unpaid bills, biggest balance first, joined to their account
// name and aged in days. Pure so it's unit-testable; the dashboard renders the result.
// Outstanding is the per-bill *balance* (payments aware), not the gross total — a
// partially-paid bill contributes only what's still owed.
import { billBalance, isPaid, lastPaymentDate } from './payments.js';

const DAY = 86400000;
const billTs = (b) => b.billDate || b.pdfGeneratedAt || b.createdAt || 0;

export function unpaidBills(bills, ordersById = {}, accounts = {}, now = Date.now()) {
  return bills
    .filter((b) => !isPaid(b))
    .map((b) => {
      const acctId = ordersById[b.workOrderId]?.accountId;
      const balance = billBalance(b);
      return {
        workOrderId: b.workOrderId,
        name: accounts[acctId]?.name || 'Unknown',
        // `total` keeps its key for existing dashboard readers but now carries the
        // remaining balance; `balance` is the explicit alias.
        total: balance,
        balance,
        ageDays: Math.max(0, Math.floor((now - billTs(b)) / DAY)),
      };
    })
    .sort((a, b) => b.balance - a.balance);
}

// Per-account rollup: total still owed across the account's bills, and when it
// last paid. `bills` is just that account's bills. Pure for easy unit testing.
export function accountOutstanding(bills = []) {
  let totalUnpaid = 0;
  let lastPaidDate = null;
  for (const b of bills) {
    if (!isPaid(b)) totalUnpaid += billBalance(b);
    const paidOn = lastPaymentDate(b);
    if (paidOn != null && (lastPaidDate == null || paidOn > lastPaidDate)) lastPaidDate = paidOn;
  }
  return { totalUnpaid, lastPaidDate };
}

// Warning shown before starting a new work order for a risky account.
// Returns the message to display, or null when the account is fine.
export function accountWarning(account = {}) {
  if (!account) return null;
  if (account.terms === 'Do-not-service') {
    return 'This account is flagged Do-not-service.';
  }
  if (account.rating != null && account.rating <= 1) {
    return 'Low account rating — proceed with caution.';
  }
  return null;
}
