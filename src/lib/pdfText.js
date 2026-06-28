// The "PAID" marker line for the PDF, with optional method and reference. null when unpaid.
export function paidLine(bill) {
  if (bill?.paymentStatus !== 'paid') return null;
  const method = (bill.paymentMethod || '').trim();
  const ref = (bill.paymentReference || '').trim();
  return `PAID${method ? ` (${method})` : ''}${ref ? ` · Ref: ${ref}` : ''}`;
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
