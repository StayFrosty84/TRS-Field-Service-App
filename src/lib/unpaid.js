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
