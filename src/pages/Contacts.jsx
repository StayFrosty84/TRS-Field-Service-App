import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';

export default function Contacts() {
  const navigate = useNavigate();

  const data = useLiveQuery(async () => {
    const contacts = await db.contacts.orderBy('name').toArray();
    const accounts = Object.fromEntries((await db.accounts.toArray()).map((a) => [a.id, a]));
    return { contacts, accounts };
  });

  if (!data) return null;
  const { contacts, accounts } = data;

  return (
    <>
      <h1 style={{ marginTop: 4 }}>Contacts</h1>

      {contacts.length === 0 && (
        <div className="empty">
          <span className="ico">👤</span>
          No contacts yet.
        </div>
      )}

      <div className="list">
        {contacts.map((c) => (
          <Link key={c.id} className="list-item" to={`/contacts/${c.id}`}>
            <p className="list-item__title">{c.name}</p>
            <p className="list-item__sub">
              {[accounts[c.accountId]?.name, c.phone].filter(Boolean).join(' · ') || '—'}
            </p>
          </Link>
        ))}
      </div>

      <button className="fab" onClick={() => navigate('/contacts/new')} aria-label="New contact">
        ＋
      </button>
    </>
  );
}
