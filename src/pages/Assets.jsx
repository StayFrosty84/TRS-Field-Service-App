import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { assetLabel } from '../lib/assets.js';
import SearchBar from '../components/SearchBar.jsx';
import Icon from '../components/Icon.jsx';

export default function Assets() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const data = useLiveQuery(async () => {
    const assets = await db.assets.orderBy('createdAt').toArray();
    const accounts = Object.fromEntries((await db.accounts.toArray()).map((a) => [a.id, a]));
    return { assets, accounts };
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.assets;
    return data.assets.filter((a) => {
      const acct = data.accounts[a.accountId]?.name || '';
      return [assetLabel(a), a.make, a.model, a.unitNumber, a.plate, a.vin, acct].some((v) =>
        (v || '').toString().toLowerCase().includes(q)
      );
    });
  }, [data, query]);

  if (!data) return null;
  const { assets, accounts } = data;

  return (
    <>
      <h1 style={{ marginTop: 4 }}>Trucks / Equipment</h1>

      {assets.length === 0 && (
        <div className="empty">
          <span className="ico"><Icon name="truck" size={40} /></span>
          No trucks or equipment yet.
        </div>
      )}

      {assets.length > 0 && (
        <SearchBar value={query} onChange={setQuery} placeholder="Search trucks / equipment…" />
      )}

      {assets.length > 0 && filtered.length === 0 && (
        <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>
          No matches.
        </p>
      )}

      <div className="list">
        {filtered.map((a) => (
          <Link key={a.id} className="list-item" to={`/assets/${a.id}`}>
            <p className="list-item__title">{assetLabel(a)}</p>
            <p className="list-item__sub">
              {[accounts[a.accountId]?.name, a.plate && `Plate ${a.plate}`].filter(Boolean).join(' · ') || '—'}
            </p>
          </Link>
        ))}
      </div>

      <button className="fab" onClick={() => navigate('/assets/new')} aria-label="New truck / equipment">
        <Icon name="plus" size={28} />
      </button>
    </>
  );
}
