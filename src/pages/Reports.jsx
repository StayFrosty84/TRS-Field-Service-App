import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { money, fmtDate } from '../lib/format.js';
import { salesTaxSummary } from '../lib/salesTax.js';
import { shareFile } from '../lib/share.js';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';

const billTs = (b) => b.billDate || b.pdfGeneratedAt || b.createdAt || 0;

export default function Reports() {
  const toast = useToast();
  const data = useLiveQuery(async () => {
    const bills = await db.billsOfSale.toArray();
    const accounts = Object.fromEntries((await db.accounts.toArray()).map((a) => [a.id, a]));
    const orders = Object.fromEntries((await db.workOrders.toArray()).map((o) => [o.id, o]));
    return { bills, accounts, orders };
  });

  const report = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();

    let mtdBilled = 0, mtdPaid = 0, ytdBilled = 0, ytdPaid = 0;
    const byAccount = {};
    // last 12 months buckets
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), total: 0 });
    }
    const monthIndex = Object.fromEntries(months.map((m, i) => [m.key, i]));

    for (const b of data.bills) {
      const t = billTs(b);
      const total = b.total || 0;
      const paid = b.paymentStatus === 'paid';
      if (t >= monthStart) { mtdBilled += total; if (paid) mtdPaid += total; }
      if (t >= yearStart) { ytdBilled += total; if (paid) ytdPaid += total; }
      const acctId = data.orders[b.workOrderId]?.accountId;
      const name = data.accounts[acctId]?.name || 'Unknown';
      byAccount[name] = (byAccount[name] || 0) + total;
      const d = new Date(t);
      const mk = `${d.getFullYear()}-${d.getMonth()}`;
      if (mk in monthIndex) months[monthIndex[mk]].total += total;
    }
    const accountRows = Object.entries(byAccount).sort((a, b) => b[1] - a[1]);
    const maxMonth = Math.max(1, ...months.map((m) => m.total));
    const tax = salesTaxSummary(data.bills);
    return { mtdBilled, mtdPaid, ytdBilled, ytdPaid, accountRows, months, maxMonth, tax };
  }, [data]);

  if (!data) return null;
  if (data.bills.length === 0) {
    return (
      <>
        <h1 style={{ marginTop: 4 }}>Reports</h1>
        <div className="empty">
          <span className="ico"><Icon name="bar-chart" size={40} /></span>
          No bills yet — reports appear once you generate some.
        </div>
      </>
    );
  }

  async function exportCsv() {
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Date', 'Bill #', 'Account', 'Subtotal', 'Tax', 'Card fee', 'Total', 'Status', 'Method'];
    const rows = [...data.bills]
      .sort((a, b) => billTs(a) - billTs(b))
      .map((b) => {
        const acctId = data.orders[b.workOrderId]?.accountId;
        const name = data.accounts[acctId]?.name || 'Unknown';
        return [
          fmtDate(billTs(b)),
          b.billNumber || '',
          name,
          (b.subtotal || 0).toFixed(2),
          (b.taxAmount || 0).toFixed(2),
          (b.ccFeeAmount || 0).toFixed(2),
          (b.total || 0).toFixed(2),
          b.paymentStatus || 'unpaid',
          b.paymentMethod || '',
        ].map(esc).join(',');
      });
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const res = await shareFile(blob, `field-service-report-${new Date().toISOString().slice(0, 10)}.csv`, {
      title: 'Revenue report',
    });
    toast(res === 'downloaded' ? 'CSV downloaded' : 'CSV ready to save');
  }

  const r = report;
  return (
    <>
      <h1 style={{ marginTop: 4 }}>Reports</h1>

      <div className="section-title">This month</div>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat__label">Billed</div>
          <div className="stat__value">{money(r.mtdBilled)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Paid</div>
          <div className="stat__value">{money(r.mtdPaid)}</div>
        </div>
      </div>

      <div className="section-title">Year to date</div>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat__label">Billed</div>
          <div className="stat__value">{money(r.ytdBilled)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Paid</div>
          <div className="stat__value">{money(r.ytdPaid)}</div>
        </div>
      </div>

      <div className="section-title">Sales tax</div>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat__label">{r.tax.quarter.label} charged</div>
          <div className="stat__value">{money(r.tax.quarter.charged)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">{r.tax.quarter.label} collected</div>
          <div className="stat__value">{money(r.tax.quarter.collected)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">{r.tax.year.label} charged</div>
          <div className="stat__value">{money(r.tax.year.charged)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">{r.tax.year.label} collected</div>
          <div className="stat__value">{money(r.tax.year.collected)}</div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        Charged = tax on bills dated in the period. Collected = tax on bills paid in the period.
      </p>

      <div className="section-title">Revenue by month</div>
      <div className="card">
        {r.months.map((m) => (
          <div key={m.key} className="row" style={{ gap: 10, marginBottom: 8 }}>
            <span className="muted" style={{ width: 52, fontSize: 13 }}>{m.label}</span>
            <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 6, height: 18 }}>
              <div style={{ width: `${(m.total / r.maxMonth) * 100}%`, background: 'var(--primary)', height: '100%', borderRadius: 6, minWidth: m.total > 0 ? 4 : 0 }} />
            </div>
            <span style={{ width: 72, textAlign: 'right', fontSize: 13 }}>{money(m.total)}</span>
          </div>
        ))}
      </div>

      <div className="section-title">Revenue by account</div>
      <div className="card">
        {r.accountRows.map(([name, total]) => (
          <div key={name} className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span>{name}</span>
            <strong>{money(total)}</strong>
          </div>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn" onClick={exportCsv}><Icon name="download" /> Export CSV</button>
      </div>
    </>
  );
}
