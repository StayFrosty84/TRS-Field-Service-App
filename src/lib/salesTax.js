// Sales-tax collected/charged summary for the Reports page. "Charged" totals tax on
// bills by their bill date (accrual); "collected" totals tax on paid bills by the date
// they were paid (cash). Calendar quarters. Pure so it's unit-testable.
const billTs = (b) => b.billDate || b.pdfGeneratedAt || b.createdAt || 0;

export function calendarQuarter(date = Date.now()) {
  const d = new Date(date);
  const y = d.getFullYear();
  const qStart = Math.floor(d.getMonth() / 3) * 3;
  return {
    start: new Date(y, qStart, 1).getTime(),
    end: new Date(y, qStart + 3, 1).getTime() - 1,
    label: `Q${qStart / 3 + 1} ${y}`,
  };
}

const within = (ts, start, end) => ts != null && ts >= start && ts <= end;

function tally(bills, start, end) {
  let charged = 0;
  let collected = 0;
  for (const b of bills) {
    const tax = b.taxAmount || 0;
    if (within(billTs(b), start, end)) charged += tax;
    if (b.paymentStatus === 'paid' && within(b.paidAt, start, end)) collected += tax;
  }
  return { charged, collected };
}

export function salesTaxSummary(bills, now = Date.now()) {
  const q = calendarQuarter(now);
  const year = new Date(now).getFullYear();
  const yStart = new Date(year, 0, 1).getTime();
  const yEnd = new Date(year + 1, 0, 1).getTime() - 1;
  return {
    quarter: { label: q.label, ...tally(bills, q.start, q.end) },
    year: { label: String(year), ...tally(bills, yStart, yEnd) },
  };
}
