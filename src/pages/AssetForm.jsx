import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, createAsset, updateAsset } from '../db/db.js';
import { normalizeVin } from '../lib/assets.js';
import { useToast } from '../components/Toast.jsx';

const EMPTY = {
  accountId: '',
  make: '',
  model: '',
  year: '',
  unitNumber: '',
  plate: '',
  vin: '',
  mileage: '',
  notes: '',
};

export default function AssetForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const editing = Boolean(id);

  const accounts = useLiveQuery(() => db.accounts.orderBy('name').toArray());
  const [form, setForm] = useState({ ...EMPTY, accountId: location.state?.accountId || '' });

  useEffect(() => {
    if (id) db.assets.get(id).then((a) => a && setForm({ ...EMPTY, ...a }));
  }, [id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (!form.accountId) return toast('Pick an account');
    if (!form.make.trim() && !form.model.trim() && !form.unitNumber.trim()) {
      return toast('Enter a make/model or unit #');
    }
    const payload = {
      ...form,
      make: form.make.trim(),
      model: form.model.trim(),
      year: form.year ? Number(form.year) : '',
      unitNumber: form.unitNumber.trim(),
      plate: form.plate.trim(),
      vin: normalizeVin(form.vin),
      mileage: form.mileage ? Number(form.mileage) : '',
      notes: form.notes.trim(),
    };
    if (editing) {
      await updateAsset(id, payload);
      toast('Asset saved');
      navigate(`/assets/${id}`);
    } else {
      const newId = await createAsset(form.accountId, payload);
      toast('Asset saved');
      navigate(`/assets/${newId}`, { replace: true });
    }
  }

  if (!accounts) return null;

  return (
    <form onSubmit={save}>
      <h1 style={{ marginTop: 4 }}>{editing ? 'Edit Truck / Equipment' : 'New Truck / Equipment'}</h1>

      <label>Account *</label>
      <select value={form.accountId} onChange={set('accountId')}>
        <option value="">— Select account —</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <div className="row" style={{ gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label>Make</label>
          <input value={form.make} onChange={set('make')} placeholder="e.g. Ford" />
        </div>
        <div style={{ flex: 1 }}>
          <label>Model</label>
          <input value={form.model} onChange={set('model')} placeholder="e.g. F-350" />
        </div>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label>Year</label>
          <input type="number" inputMode="numeric" min="1900" value={form.year} onChange={set('year')} />
        </div>
        <div style={{ flex: 1 }}>
          <label>Unit #</label>
          <input value={form.unitNumber} onChange={set('unitNumber')} />
        </div>
      </div>

      <label>Plate #</label>
      <input value={form.plate} onChange={set('plate')} />

      <label>VIN / Serial</label>
      <input value={form.vin} onChange={set('vin')} autoCapitalize="characters" />

      <label>Mileage (informational)</label>
      <input type="number" inputMode="numeric" min="0" value={form.mileage} onChange={set('mileage')} />

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
