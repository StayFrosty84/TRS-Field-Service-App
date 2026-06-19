import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db, createAccount, updateAccount } from '../db/db.js';
import { useToast } from '../components/Toast.jsx';

const EMPTY = { name: '', phone: '', email: '', address: '', notes: '' };

export default function AccountForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const editing = Boolean(id);

  useEffect(() => {
    if (id) db.accounts.get(id).then((a) => a && setForm(a));
  }, [id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return toast('Name is required');
    if (editing) {
      await updateAccount(id, form);
      navigate(`/accounts/${id}`);
    } else {
      const newId = await createAccount(form);
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
      <input type="tel" value={form.phone} onChange={set('phone')} />

      <label>Email</label>
      <input type="email" value={form.email} onChange={set('email')} />

      <label>Address</label>
      <textarea value={form.address} onChange={set('address')} />

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
