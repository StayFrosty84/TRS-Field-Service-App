import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';

export default function Accounts() {
  const navigate = useNavigate();
  const accounts = useLiveQuery(() => db.accounts.orderBy('name').toArray());

  if (!accounts) return null;

  return (
    <>
      <h1 style={{ marginTop: 4 }}>Accounts</h1>

      {accounts.length === 0 && (
        <div className="empty">
          <span className="ico">🏢</span>
          No accounts yet.
        </div>
      )}

      <div className="list">
        {accounts.map((a) => (
          <Link key={a.id} className="list-item" to={`/accounts/${a.id}`}>
            <p className="list-item__title">{a.name}</p>
            <p className="list-item__sub">{[a.phone, a.address].filter(Boolean).join(' · ') || '—'}</p>
          </Link>
        ))}
      </div>

      <button className="fab" onClick={() => navigate('/accounts/new')} aria-label="New account">
        ＋
      </button>
    </>
  );
}
