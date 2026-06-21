import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, createContact, updateContact } from '../db/db.js';
import { getPhones } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import PhoneListField from '../components/PhoneListField.jsx';

const EMPTY = { name: '', accountId: '', role: '', phones: [], email: '', notes: '' };

const toFormPhones = (e) =>
  getPhones(e).map((p) => ({ label: p.label || 'Mobile', number: p.number || '', ext: p.ext || '' }));

export default function ContactForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const editing = Boolean(id);

  const accounts = useLiveQuery(() => db.accounts.orderBy('name').toArray());
  const [form, setForm] = useState({ ...EMPTY, accountId: location.state?.accountId || '' });

  useEffect(() => {
    if (id) db.contacts.get(id).then((c) => c && setForm({ ...EMPTY, ...c, phones: toFormPhones(c) }));
  }, [id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return toast('Name is required');
    if (!form.accountId) return toast('Pick an account');
    const phones = (form.phones || [])
      .filter((p) => (p.number || '').trim())
      .map((p) => ({ label: p.label || 'Mobile', number: p.number.trim(), ext: (p.ext || '').trim() }));
    const payload = { ...form, phones, phone: phones[0]?.number || '' };
    if (editing) {
      await updateContact(id, payload);
      navigate(`/contacts/${id}`);
    } else {
      const newId = await createContact(payload);
      navigate(`/contacts/${newId}`);
    }
    toast('Contact saved');
  }

  if (!accounts) return null;

  return (
    <form onSubmit={save}>
      <h1 style={{ marginTop: 4 }}>{editing ? 'Edit Contact' : 'New Contact'}</h1>

      <label>Name *</label>
      <input value={form.name} onChange={set('name')} autoFocus />

      <label>Account *</label>
      <select value={form.accountId} onChange={set('accountId')}>
        <option value="">— Select account —</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {accounts.length === 0 && (
        <p className="muted" style={{ marginTop: 8 }}>
          No accounts yet — <a onClick={() => navigate('/accounts/new')}>create one first</a>.
        </p>
      )}

      <label>Title</label>
      <input value={form.role} onChange={set('role')} placeholder="e.g. Owner, Site manager" />

      <label>Phone</label>
      <PhoneListField phones={form.phones} onChange={(phones) => setForm((f) => ({ ...f, phones }))} />

      <label>Email</label>
      <input type="email" value={form.email} onChange={set('email')} />

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
