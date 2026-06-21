import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteAccount } from '../db/db.js';
import { fmtDate, getPhones, telHref, fmtPhone } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';

export default function AccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const data = useLiveQuery(async () => {
    const account = await db.accounts.get(id);
    if (!account) return { missing: true };
    const contacts = await db.contacts.where('accountId').equals(id).toArray();
    const orders = await db.workOrders.where('accountId').equals(id).reverse().sortBy('createdAt');
    return { account, contacts, orders };
  }, [id]);

  if (!data) return null;
  if (data.missing) return <p className="muted">Account not found.</p>;
  const { account, contacts, orders } = data;
  const phones = getPhones(account);

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
          <a
            key={i}
            className="btn btn--ghost"
            href={telHref(p)}
            style={{ width: '100%', justifyContent: 'flex-start', marginTop: i ? 8 : 0 }}
          >
            <Icon name="phone" size={16} /> {p.label ? `${p.label}: ` : ''}{fmtPhone(p)}
          </a>
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
        {account.address && <div className="muted" style={{ marginTop: 8 }}>{account.address}</div>}
        {account.notes && <div className="muted" style={{ marginTop: 6 }}>{account.notes}</div>}
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
