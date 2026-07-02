import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteAccount } from '../db/db.js';
import { assetLabel } from '../lib/assets.js';
import { fmtDate, getPhones, money } from '../lib/format.js';
import { accountOutstanding } from '../lib/unpaid.js';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import PhoneRow from '../components/PhoneRow.jsx';
import NavigateLink from '../components/NavigateLink.jsx';

export default function AccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const data = useLiveQuery(async () => {
    const account = await db.accounts.get(id);
    if (!account) return { missing: true };
    const contacts = await db.contacts.where('accountId').equals(id).toArray();
    const assets = await db.assets.where('accountId').equals(id).sortBy('createdAt');
    const orders = await db.workOrders.where('accountId').equals(id).reverse().sortBy('createdAt');
    const orderIds = orders.map((o) => o.id);
    const bills = orderIds.length
      ? await db.billsOfSale.where('workOrderId').anyOf(orderIds).toArray()
      : [];
    return { account, contacts, assets, orders, bills };
  }, [id]);

  if (!data) return null;
  if (data.missing) return <p className="muted">Account not found.</p>;
  const { account, contacts, assets, orders, bills } = data;
  const phones = getPhones(account);
  const { totalUnpaid, lastPaidDate } = accountOutstanding(bills);

  async function onDelete() {
    if (!confirm(`Delete "${account.name}" and all its contacts and work orders?`)) return;
    await deleteAccount(id);
    toast('Account deleted');
    navigate('/accounts');
  }

  return (
    <>
      <h1 style={{ marginTop: 4 }}>{account.name}</h1>
      <div className="card">
        {phones.map((p, i) => (
          <PhoneRow key={i} phone={p} style={{ marginTop: i ? 8 : 0 }} />
        ))}
        {account.email && (
          <a
            className="btn btn--ghost"
            href={`mailto:${account.email}`}
            style={{ width: '100%', justifyContent: 'flex-start', marginTop: phones.length ? 8 : 0 }}
          >
            <Icon name="mail" size={16} /> {account.email}
          </a>
        )}
        {account.address && (
          <NavigateLink text={account.address} style={{ marginTop: 8 }} />
        )}
        {account.notes && <div className="muted" style={{ marginTop: 6 }}>{account.notes}</div>}
        {(account.rating || account.terms) && (
          <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
            {account.rating > 0 && (
              <span title={`Rating: ${account.rating} of 5`} style={{ color: '#f59e0b', letterSpacing: 1 }}>
                {'★'.repeat(account.rating)}
                <span className="muted">{'☆'.repeat(5 - account.rating)}</span>
              </span>
            )}
            {account.terms && (
              <span className={`badge ${account.terms === 'Do-not-service' ? 'badge--unpaid' : ''}`}>
                {account.terms}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Outstanding</span>
          <strong style={{ color: totalUnpaid > 0 ? 'var(--badge-open-fg)' : 'inherit' }}>
            {money(totalUnpaid)}
          </strong>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
          <span className="muted">Last paid</span>
          <span>{lastPaidDate ? fmtDate(lastPaidDate) : '—'}</span>
        </div>
      </div>

      <div className="btn-row">
        <button className="btn btn--ghost" onClick={() => navigate(`/accounts/${id}/edit`)}>
          Edit
        </button>
        <button
          className="btn"
          onClick={() => navigate('/work-orders/new', { state: { accountId: id } })}
        >
          <Icon name="plus" /> Work Order
        </button>
      </div>

      <div className="section-title">Contacts ({contacts.length})</div>
      <div className="list">
        {contacts.map((c) => (
          <Link key={c.id} className="list-item" to={`/contacts/${c.id}`}>
            <p className="list-item__title">{c.name}</p>
            <p className="list-item__sub">{[c.role, c.phone].filter(Boolean).join(' · ') || '—'}</p>
          </Link>
        ))}
        <button
          className="btn btn--ghost"
          onClick={() => navigate('/contacts/new', { state: { accountId: id } })}
        >
          <Icon name="plus" /> Add contact
        </button>
      </div>

      <div className="section-title">Trucks / Equipment ({assets.length})</div>
      <div className="list">
        {assets.map((a) => (
          <Link key={a.id} className="list-item" to={`/assets/${a.id}`}>
            <p className="list-item__title">{assetLabel(a)}</p>
            <p className="list-item__sub">
              {[a.plate && `Plate ${a.plate}`, a.vin && `VIN …${a.vin.slice(-6)}`].filter(Boolean).join(' · ') || '—'}
            </p>
          </Link>
        ))}
        <button
          className="btn btn--ghost"
          onClick={() => navigate('/assets/new', { state: { accountId: id } })}
        >
          <Icon name="plus" /> Add truck / equipment
        </button>
      </div>

      <div className="section-title">Service history ({orders.length})</div>
      <div className="list">
        {orders.length === 0 && <p className="muted">No work orders for this account yet.</p>}
        {orders.map((o) => (
          <Link key={o.id} className="list-item" to={`/work-orders/${o.id}`}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <p className="list-item__title">{o.issue ? o.issue.slice(0, 60) : 'Work order'}</p>
              <span className={`badge badge--${o.status}`}>{o.status}</span>
            </div>
            <p className="list-item__sub">{fmtDate(o.serviceDate)}</p>
          </Link>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn btn--danger" onClick={onDelete}>
          Delete account
        </button>
      </div>
    </>
  );
}
