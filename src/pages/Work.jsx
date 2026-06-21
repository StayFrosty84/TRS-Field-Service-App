import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, markBillPaid } from '../db/db.js';
import { fmtDate, money } from '../lib/format.js';
import { useFeatures } from '../lib/useFeatures.js';
import SearchBar from '../components/SearchBar.jsx';
import Icon from '../components/Icon.jsx';

export default function Work() {
  const navigate = useNavigate();
  const location = useLocation();
  const features = useFeatures();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(location.state?.filter || 'all'); // all | open | completed | unpaid

  const data = useLiveQuery(async () => {
    const orders = await db.workOrders.orderBy('createdAt').reverse().toArray();
    const accounts = Object.fromEntries((await db.accounts.toArray()).map((a) => [a.id, a]));
    const bills = await db.billsOfSale.toArray();
    const billByWo = Object.fromEntries(bills.map((b) => [b.workOrderId, b]));
    return { orders, accounts, billByWo };
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.orders.filter((o) => {
      const bill = data.billByWo[o.id];
      if (filter === 'open' || filter === 'completed') {
        if (o.status !== filter) return false;
      } else if (filter === 'unpaid') {
        if (!bill || bill.paymentStatus === 'paid') return false;
      }
      if (!q) return true;
      const acct = data.accounts[o.accountId]?.name || '';
      return (
        acct.toLowerCase().includes(q) ||
        (o.issue || '').toLowerCase().includes(q) ||
        (o.location?.text || '').toLowerCase().includes(q)
      );
    });
  }, [data, query, filter]);

  if (!data) return null;
  const { orders, accounts, billByWo } = data;
  const showPay = features.billing;
  const chips = [['all', 'All'], ['open', 'Open'], ['completed', 'Completed']];
  if (showPay) chips.push(['unpaid', 'Unpaid']);

  return (
    <>
      <h1 style={{ marginTop: 4 }}>Work Orders</h1>

      {orders.length === 0 && (
        <div className="empty">
          <span className="ico"><Icon name="wrench" size={40} /></span>
          No work orders yet.
          <br />
          Tap ＋ to log your first job.
        </div>
      )}

      {orders.length > 0 && (
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Search jobs, customers, locations…" />
          <div className="chips">
            {chips.map(([val, label]) => (
              <button key={val} className={`chip ${filter === val ? 'chip--active' : ''}`} onClick={() => setFilter(val)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {orders.length > 0 && filtered.length === 0 && (
        <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>No matches.</p>
      )}

      <div className="list">
        {filtered.map((o) => (
          <OrderRow key={o.id} order={o} account={accounts[o.accountId]} bill={billByWo[o.id]} showPay={showPay} />
        ))}
      </div>

      <button className="fab" onClick={() => navigate('/work-orders/new')} aria-label="New work order">
        <Icon name="plus" size={28} />
      </button>
    </>
  );
}

function OrderRow({ order, account, bill, showPay }) {
  const paid = bill?.paymentStatus === 'paid';
  async function quickPay(e) {
    e.preventDefault();
    e.stopPropagation();
    if (bill) await markBillPaid(bill.id, '');
  }
  return (
    <Link className="list-item" to={`/work-orders/${order.id}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="list-item__title">{account?.name || 'Unknown account'}</p>
        <span className={`badge badge--${order.status}`}>{order.status}</span>
      </div>
      <p className="list-item__sub">
        {order.issue ? order.issue.slice(0, 80) : 'No issue noted'} · {fmtDate(order.serviceDate)}
      </p>
      {showPay && bill && (
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }}>
          <span className={`badge badge--${paid ? 'paid' : 'unpaid'}`}>
            {paid ? 'paid' : 'unpaid'} · {money(bill.total || 0)}
          </span>
          {!paid && (
            <button className="btn btn--ghost btn--sm" onClick={quickPay}>
              <Icon name="check" /> Mark paid
            </button>
          )}
        </div>
      )}
    </Link>
  );
}
