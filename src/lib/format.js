export const money = (n) =>
  (Number(n) || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export const fmtDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

export const fmtDateTime = (ts) =>
  ts
    ? new Date(ts).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

// Bill-of-sale totals from line items + optional tax rate (percent).
export function computeTotals(lineItems = [], taxRate = 0) {
  const subtotal = lineItems.reduce(
    (sum, li) => sum + (Number(li.qty) || 0) * (Number(li.unitPrice) || 0),
    0
  );
  const taxAmount = subtotal * ((Number(taxRate) || 0) / 100);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}
