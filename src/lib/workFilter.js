// Pure work-order list filtering: a date-range preset + a text query (which also
// matches the bill number) + the status/stage chip. Kept out of the component so
// it's unit-testable.

import { resolveStage, isStuck } from './stages.js';

const DAY = 86400000;
const startOfDay = (ts) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
};

// Bounds (inclusive) in ms for a preset key. `any` is unbounded.
export function dateRangeBounds(key, now = Date.now()) {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth();
  const today = startOfDay(now);
  switch (key) {
    case 'today':
      return { from: today, to: today + DAY - 1 };
    case '7d':
      return { from: today - 6 * DAY, to: today + DAY - 1 };
    case '30d':
      return { from: today - 29 * DAY, to: today + DAY - 1 };
    case 'month':
      return { from: new Date(y, m, 1).getTime(), to: new Date(y, m + 1, 1).getTime() - 1 };
    case 'quarter': {
      const qStart = Math.floor(m / 3) * 3;
      return { from: new Date(y, qStart, 1).getTime(), to: new Date(y, qStart + 3, 1).getTime() - 1 };
    }
    case 'any':
    default:
      return { from: -Infinity, to: Infinity };
  }
}

export function filterWorkOrders(
  orders,
  { query, status, dateKey, billByWo, accounts, stages, stuckDays = 7, now } = {}
) {
  const q = (query || '').trim().toLowerCase();
  const { from, to } = dateRangeBounds(dateKey || 'any', now);

  return orders.filter((o) => {
    const bill = billByWo?.[o.id];

    // Status/stage chip. Reserved keys: all | unpaid | stuck | open | completed
    // (open/completed kept for legacy callers); any other value is a stage id.
    if (status === 'open' || status === 'completed') {
      if (o.status !== status) return false;
    } else if (status === 'unpaid') {
      if (!bill || bill.paymentStatus === 'paid') return false;
    } else if (status === 'stuck') {
      if (!isStuck(o, stages || [], stuckDays, now)) return false;
    } else if (status && status !== 'all') {
      // A specific stage id — resolve the WO's stage (lazily for legacy records).
      if (resolveStage(o, stages || [])?.id !== status) return false;
    }

    if (from !== -Infinity || to !== Infinity) {
      const sd = o.serviceDate;
      if (sd == null || sd < from || sd > to) return false;
    }

    if (!q) return true;
    const acct = accounts?.[o.accountId]?.name || '';
    return (
      acct.toLowerCase().includes(q) ||
      (o.issue || '').toLowerCase().includes(q) ||
      (o.location?.text || '').toLowerCase().includes(q) ||
      String(bill?.billNumber || '').toLowerCase().includes(q)
    );
  });
}
