import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { fmtDate } from '../lib/format.js';

export default function Home() {
  const navigate = useNavigate();

  const data = useLiveQuery(async () => {
    const orders = await db.workOrders.orderBy('createdAt').reverse().toArray();
    const accounts = Object.fromEntries((await db.accounts.toArray()).map((a) => [a.id, a]));
    return { orders, accounts };
  });

  if (!data) return null;
  const { orders, accounts } = data;
  const open = orders.filter((o) => o.status === 'open');
  const done = orders.filter((o) => o.status === 'completed');

  return (
    <>
      <h1 style={{ marginTop: 4 }}>Work Orders</h1>

      {orders.length === 0 && (
        <div className="empty">
          <span className="ico">🧰</span>
          No work orders yet.
          <br />
          Tap ＋ to log your first job.
        </div>
      )}

      {open.length > 0 && <div className="section-title">Open ({open.length})</div>}
      <div className="list">
        {open.map((o) => (
          <OrderRow key={o.id} order={o} account={accounts[o.accountId]} />
        ))}
      </div>

      {done.length > 0 && <div className="section-title">Completed ({done.length})</div>}
      <div className="list">
        {done.map((o) => (
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
