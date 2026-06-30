import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listWorkTypes, createWorkType, updateWorkType, deleteWorkType } from '../db/db.js';
import SortableList from './SortableList.jsx';
import Icon, { iconNames } from './Icon.jsx';

// _k is a stable client-only key for drag reordering; it's dropped on save.
const blankItem = () => ({ _k: crypto.randomUUID(), description: '', qty: 1, unitPrice: '' });

export default function WorkTypeManager() {
  const types = useLiveQuery(listWorkTypes) || [];
  const [editing, setEditing] = useState(null); // id | 'new' | null
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('wrench');
  const [items, setItems] = useState([blankItem()]);

  function startNew() {
    setEditing('new');
    setName('');
    setIcon('wrench');
    setItems([blankItem()]);
  }
  function startEdit(t) {
    setEditing(t.id);
    setName(t.name);
    setIcon(t.icon || 'wrench');
    setItems(t.items?.length ? t.items.map((i) => ({ _k: crypto.randomUUID(), ...i })) : [blankItem()]);
  }
  function cancel() {
    setEditing(null);
  }
  const setItem = (i, k, v) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const addRow = () => setItems((arr) => [...arr, blankItem()]);
  const removeRow = (i) => setItems((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));

  async function save() {
    const clean = items
      .filter((it) => it.description.trim() || Number(it.unitPrice) > 0)
      .map((it) => ({ description: it.description.trim(), qty: Number(it.qty) || 1, unitPrice: Number(it.unitPrice) || 0 }));
    const data = { name: name.trim() || 'Untitled', icon, items: clean };
    if (editing === 'new') await createWorkType(data);
    else await updateWorkType(editing, data);
    setEditing(null);
  }

  return (
    <div className="card">
      {types.length === 0 && <p className="muted" style={{ marginTop: 0 }}>No work types yet.</p>}
      <div className="list">
        {types.map((t) => (
          <div key={t.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span><Icon name={t.icon || 'wrench'} /> {t.name} <span className="muted">· {t.items?.length || 0} item(s)</span></span>
            <span className="row" style={{ gap: 6 }}>
              <button className="btn btn--ghost btn--sm" onClick={() => startEdit(t)} aria-label={`Edit ${t.name}`}><Icon name="pencil" /></button>
              <button className="btn btn--ghost btn--sm" onClick={() => confirm(`Delete ${t.name}?`) && deleteWorkType(t.id)} aria-label={`Delete ${t.name}`}><Icon name="trash-2" /></button>
            </span>
          </div>
        ))}
      </div>

      {editing && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <label>Work type name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tire Job" />
          <div className="section-title" style={{ marginTop: 12 }}>Icon</div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {iconNames.map((n) => (
              <button
                key={n}
                type="button"
                className={`chip${icon === n ? ' chip--active' : ''}`}
                aria-label={n}
                aria-pressed={icon === n}
                onClick={() => setIcon(n)}
              >
                <Icon name={n} />
              </button>
            ))}
          </div>
          <div className="section-title" style={{ marginTop: 12 }}>Template line items</div>
          <SortableList
            items={items}
            getKey={(it) => it._k}
            onReorder={setItems}
            renderItem={(it, i, handleProps) => (
              <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" {...handleProps}><Icon name="grip-vertical" size={18} /></button>
                <input style={{ flex: '1 1 160px' }} placeholder="Description" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
                <input style={{ width: 72, fontSize: 18, fontWeight: 600, textAlign: 'center' }} type="number" inputMode="decimal" min="0" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} aria-label="Qty" />
                <input style={{ width: 104, fontSize: 18 }} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} aria-label="Unit price" />
                <button className="btn btn--ghost btn--sm" onClick={() => removeRow(i)} aria-label="Remove item"><Icon name="x" /></button>
              </div>
            )}
          />
          <button className="btn btn--ghost btn--sm" onClick={addRow}><Icon name="plus" /> Add item</button>
          <div className="btn-row">
            <button className="btn btn--ghost" onClick={cancel}>Cancel</button>
            <button className="btn" onClick={save}>Save work type</button>
          </div>
        </div>
      )}

      {!editing && (
        <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={startNew}><Icon name="plus" /> Add work type</button>
      )}
    </div>
  );
}
