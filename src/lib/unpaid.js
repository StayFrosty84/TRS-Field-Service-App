// "Who owes me money": the unpaid bills, biggest first, joined to their account
// name and aged in days. Pure so it's unit-testable; the dashboard renders the result.
const DAY = 86400000;
const billTs = (b) => b.billDate || b.pdfGeneratedAt || b.createdAt || 0;

export function unpaidBills(bills, ordersById = {}, accounts = {}, now = Date.now()) {
  return bills
    .filter((b) => b.paymentStatus !== 'paid')
    .map((b) => {
      const acctId = ordersById[b.workOrderId]?.accountId;
      return {
        workOrderId: b.workOrderId,
        name: accounts[acctId]?.name || 'Unknown',
        total: b.total || 0,
        ageDays: Math.max(0, Math.floor((now - billTs(b)) / DAY)),
      };
    })
    .sort((a, b) => b.total - a.total);
}

// Per-account rollup: total still owed across the account's bills, and when it
// last paid. `bills` is just that account's bills. Pure for easy unit testing.
export function accountOutstanding(bills = []) {
  let totalUnpaid = 0;
  let lastPaidDate = null;
  for (const b of bills) {
    if (b.paymentStatus !== 'paid') {
      totalUnpaid += b.total || 0;
    } else if (b.paidAt && (lastPaidDate == null || b.paidAt > lastPaidDate)) {
      lastPaidDate = b.paidAt;
    }
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
