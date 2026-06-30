import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteContact } from '../db/db.js';
import { fmtDate, getPhones } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import PhoneRow from '../components/PhoneRow.jsx';

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const data = useLiveQuery(async () => {
    const contact = await db.contacts.get(id);
    if (!contact) return { missing: true };
    const account = await db.accounts.get(contact.accountId);
    const orders = await db.workOrders.where('contactId').equals(id).reverse().sortBy('createdAt');
    return { contact, account, orders };
  }, [id]);

  if (!data) return null;
  if (data.missing) return <p className="muted">Contact not found.</p>;
  const { contact, account, orders } = data;
  const phones = getPhones(contact);

  async function onDelete() {
    if (!confirm(`Delete contact "${contact.name}"?`)) return;
    await deleteContact(id);
    toast('Contact deleted');
    navigate('/contacts');
  }

  return (
    <>
      <h1 style={{ marginTop: 4 }}>{contact.name}</h1>
      <div className="card">
        {contact.role && <div className="muted">{contact.role}</div>}
        {account && (
          <div style={{ marginTop: 4 }}>
            <Icon name="building" size={15} /> <Link to={`/accounts/${account.id}`}>{account.name}</Link>
          </div>
        )}
        {phones.map((p, i) => (
          <PhoneRow key={i} phone={p} style={{ marginTop: 8 }} />
        ))}
        {contact.email && (
          <a
            className="btn btn--ghost"
            href={`mailto:${contact.email}`}
            style={{ width: '100%', justifyContent: 'flex-start', marginTop: 8 }}
          >
            <Icon name="mail" size={16} /> {contact.email}
          </a>
        )}
        {contact.notes && <div className="muted" style={{ marginTop: 8 }}>{contact.notes}</div>}
      </div>

      <div className="btn-row">
        <button className="btn btn--ghost" onClick={() => navigate(`/contacts/${id}/edit`)}>
          Edit
        </button>
      </div>

      <div className="section-title">Service history ({orders.length})</div>
      <div className="list">
        {orders.length === 0 && <p className="muted">No work orders involving this contact.</p>}
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
          Delete contact
        </button>
      </div>
    </>
  );
}
