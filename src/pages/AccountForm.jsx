import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db, createAccount, updateAccount } from '../db/db.js';
import { getPhones } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import PhoneListField from '../components/PhoneListField.jsx';

const EMPTY = { name: '', phones: [], email: '', address: '', notes: '', rating: 0, terms: '' };
const TERMS = ['COD', 'Net-30', 'Prepay', 'Do-not-service'];

// Normalize an entity's phones into the form shape (label defaults to Mobile).
const toFormPhones = (e) =>
  getPhones(e).map((p) => ({ label: p.label || 'Mobile', number: p.number || '', ext: p.ext || '' }));

export default function AccountForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const editing = Boolean(id);

  useEffect(() => {
    if (id) db.accounts.get(id).then((a) => a && setForm({ ...EMPTY, ...a, phones: toFormPhones(a) }));
  }, [id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return toast('Name is required');
    const phones = (form.phones || [])
      .filter((p) => (p.number || '').trim())
      .map((p) => ({ label: p.label || 'Mobile', number: p.number.trim(), ext: (p.ext || '').trim() }));
    const payload = { ...form, phones, phone: phones[0]?.number || '' };
    if (editing) {
      await updateAccount(id, payload);
      navigate(`/accounts/${id}`);
    } else {
      const newId = await createAccount(payload);
      navigate(`/accounts/${newId}`);
    }
    toast('Account saved');
  }

  return (
    <form onSubmit={save}>
      <h1 style={{ marginTop: 4 }}>{editing ? 'Edit Account' : 'New Account'}</h1>

      <label>Business / Account name *</label>
      <input value={form.name} onChange={set('name')} autoFocus />

      <label>Phone</label>
      <PhoneListField phones={form.phones} onChange={(phones) => setForm((f) => ({ ...f, phones }))} />

      <label>Email</label>
      <input type="email" value={form.email} onChange={set('email')} />

      <label>Address</label>
      <textarea value={form.address} onChange={set('address')} />

      <label>Rating</label>
      <div className="chips">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            className={`chip ${form.rating >= n ? 'chip--active' : ''}`}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setForm((f) => ({ ...f, rating: f.rating === n ? 0 : n }))}
          >
            ★
          </button>
        ))}
      </div>

      <label>Terms</label>
      <select value={form.terms} onChange={set('terms')}>
        <option value="">— None —</option>
        {TERMS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <label>Notes</label>
      <textarea value={form.notes} onChange={set('notes')} />

      <div className="btn-row">
        <button type="button" className="btn btn--ghost" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <button type="submit" className="btn">
          Save
        </button>
      </div>
    </form>
  );
}
