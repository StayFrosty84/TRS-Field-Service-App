import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { money, fmtDate } from '../lib/format.js';
import { useFeatures } from '../lib/useFeatures.js';
import SearchBar from '../components/SearchBar.jsx';
import BackupReminder from '../components/BackupReminder.jsx';

export default function Home() {
  const navigate = useNavigate();
  const features = useFeatures();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all | open | completed

  const data = useLiveQuery(async () => {
    const orders = await db.workOrders.orderBy('createdAt').reverse().toArray();
    const accounts = Object.fromEntries((await db.accounts.toArray()).map((a) => [a.id, a]));
    const bills = await db.billsOfSale.orderBy('createdAt').reverse().toArray();
    const ordersById = Object.fromEntries(orders.map((o) => [o.id, o]));
    return { orders, accounts, bills, ordersById };
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.orders.filter((o) => {
      if (filter !== 'all' && o.status !== filter) return false;
      if (!q) return true;
      const acct = data.accounts[o.accountId]?.name || '';
      return (
        acct.toLowerCase().includes(q) ||
        (o.issue || '').toLowerCase().includes(q) ||
        (o.location?.text || '').toLowerCase().includes(q)
      );
    });
  }, [data, query, filter]);

  const stats = useMemo(() => {
    if (!data) return null;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    let outstanding = 0;
    let mtd = 0;
    for (const b of data.bills) {
      if (b.paymentStatus !== 'paid') outstanding += b.total || 0;
      if ((b.billDate || b.pdfGeneratedAt || b.createdAt || 0) >= monthStart) mtd += b.total || 0;
    }
    return {
      open: data.orders.filter((o) => o.status === 'open').length,
      completed: data.orders.filter((o) => o.status === 'completed').length,
      outstanding,
      mtd,
    };
  }, [data]);

  if (!data) return null;
  const { orders, accounts, bills, ordersById } = data;
  const showDashboard = features.dashboard;

  return (
    <>
      <h1 style={{ marginTop: 4 }}>{showDashboard ? 'Dashboard' : 'Work Orders'}</h1>
      <BackupReminder hasData={orders.length > 0} />

      {showDashboard && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat__label">Open jobs</div>
              <div className="stat__value">{stats.open}</div>
            </div>
            {features.billing ? (
              <div className="stat">
                <div className="stat__label">Outstanding</div>
                <div className="stat__value" style={{ color: stats.outstanding > 0 ? 'var(--badge-open-fg)' : 'inherit' }}>
                  {money(stats.outstanding)}
                </div>
              </div>
            ) : (
              <div className="stat">
                <div className="stat__label">Completed</div>
                <div className="stat__value">{stats.completed}</div>
              </div>
            )}
            {features.billing && (
              <div className="stat stat--wide">
                <div className="stat__label">Billed this month</div>
                <div className="stat__value">{money(stats.mtd)}</div>
              </div>
            )}
          </div>

          <div className="btn-row" style={{ marginTop: 4 }}>
            <button className="btn" onClick={() => navigate('/work-orders/new')}>
              ＋ New work order
            </button>
            {features.billing && stats.outstanding > 0 && (
              <button className="btn btn--ghost" onClick={() => navigate('/billing')}>
                💵 Unpaid
              </button>
            )}
          </div>

          {features.billing && bills.length > 0 && (
            <>
              <div className="section-title">Recent bills</div>
              <div className="list">
                {bills.slice(0, 3).map((b) => {
                  const acct = accounts[ordersById[b.workOrderId]?.accountId];
                  const paid = b.paymentStatus === 'paid';
                  return (
                    <Link key={b.id} className="list-item" to={`/work-orders/${b.workOrderId}`}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <p className="list-item__title">{acct?.name || 'Unknown'}</p>
                        <span className={`badge badge--${paid ? 'paid' : 'unpaid'}`}>{paid ? 'paid' : 'unpaid'}</span>
                      </div>
                      <p className="list-item__sub">{money(b.total || 0)} · {fmtDate(b.billDate || b.createdAt)}</p>
                    </Link>
                  );
                })}
              </div>
            </>
          )}

          <div className="section-title">Work orders</div>
        </>
      )}

      {orders.length === 0 && (
        <div className="empty">
          <span className="ico">🧰</span>
          No work orders yet.
          <br />
          Tap ＋ to log your first job.
        </div>
      )}

      {orders.length > 0 && (
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Search jobs, customers, locations…" />
          <div className="chips">
            {[
              ['all', 'All'],
              ['open', 'Open'],
              ['completed', 'Completed'],
            ].map(([val, label]) => (
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
          <OrderRow key={o.id} order={o} account={accounts[o.accountId]} />
        ))}
      </div>

      <button className="fab" onClick={() => navigate('/work-orders/new')} aria-label="New work order">
        ＋
      </button>
    </>
  );
}

function OrderRow({ order, account }) {
  return (
    <Link className="list-item" to={`/work-orders/${order.id}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="list-item__title">{account?.name || 'Unknown account'}</p>
        <span className={`badge badge--${order.status}`}>{order.status}</span>
      </div>
      <p className="list-item__sub">
        {order.issue ? order.issue.slice(0, 80) : 'No issue noted'} · {fmtDate(order.serviceDate)}
      </p>
    </Link>
  );
}
