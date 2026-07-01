import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  listWorkTypes,
  createWorkType,
  updateWorkType,
  deleteWorkType,
  cloneWorkType,
  listCatalog,
  createCatalogItem,
} from '../db/db.js';
import { money } from '../lib/format.js';
import { resolveTemplateItem } from '../lib/templateItems.js';
import SortableList from './SortableList.jsx';
import CatalogPicker from './CatalogPicker.jsx';
import Icon from './Icon.jsx';
import { useToast } from './Toast.jsx';

// _k is a stable client-only key for drag reordering; it's dropped on save.
const withKeys = (items) => (items || []).map((i) => ({ _k: crypto.randomUUID(), ...i }));

// Icons offered as work-type labels — roadside/repair-relevant only. Deliberately not the
// full icon set (which includes UI chrome like arrows, charts, and upload/download that make
// no sense as a job label).
const WORK_TYPE_ICONS = [
  'wrench', 'tow-truck', 'tire', 'tire-donut', 'tire-tread', 'tire-wheel',
  'battery', 'fuel-can', 'key', 'traffic-cone',
  'car', 'truck', 'semi-truck', 'bus', 'rv', 'trailer', 'alert-triangle',
];

export default function WorkTypeManager() {
  const toast = useToast();
  const types = useLiveQuery(listWorkTypes) || [];
  const catalog = useLiveQuery(listCatalog) || [];
  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  const [editing, setEditing] = useState(null); // id | 'new' | null
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('wrench');
  const [items, setItems] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [showNew, setShowNew] = useState(false);

  function startNew() {
    setEditing('new');
    setName('');
    setIcon('wrench');
    setItems([]);
    setShowNew(false);
  }
  function startEdit(t) {
    setEditing(t.id);
    setName(t.name);
    setIcon(t.icon || 'wrench');
    setItems(withKeys(t.items));
    setShowNew(false);
  }
  function cancel() {
    setEditing(null);
  }

  const setQty = (i, v) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, qty: v } : it)));
  const setLegacy = (i, k, v) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const removeRow = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  function addFromCatalog(it) {
    setItems((arr) =>
      arr.some((r) => r.catalogItemId === it.id)
        ? arr // already on this template — qty covers multiples
        : [...arr, { _k: crypto.randomUUID(), catalogItemId: it.id, qty: 1 }]
    );
  }

  async function confirmNewItem() {
    if (!newDesc.trim()) return toast('Enter a description');
    const cid = await createCatalogItem({ description: newDesc.trim(), unitPrice: Number(newPrice) || 0 });
    setItems((arr) => [...arr, { _k: crypto.randomUUID(), catalogItemId: cid, qty: 1 }]);
    setNewDesc('');
    setNewPrice('');
    setShowNew(false);
    toast('Added to catalog');
  }

  async function save() {
    const clean = items
      .map((it) => {
        if (it.catalogItemId) return { catalogItemId: it.catalogItemId, qty: Number(it.qty) || 1 };
        // legacy free-form row
        if (!it.description?.trim() && !(Number(it.unitPrice) > 0)) return null;
        return { description: it.description.trim(), qty: Number(it.qty) || 1, unitPrice: Number(it.unitPrice) || 0 };
      })
      .filter(Boolean);
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
              <button className="btn btn--ghost btn--sm" onClick={() => cloneWorkType(t.id)} aria-label={`Duplicate ${t.name}`}><Icon name="copy" /></button>
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
            {(WORK_TYPE_ICONS.includes(icon) ? WORK_TYPE_ICONS : [icon, ...WORK_TYPE_ICONS]).map((n) => (
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
          {items.length === 0 && <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>No items yet — add from the catalog or create a new one.</p>}
          <SortableList
            items={items}
            getKey={(it) => it._k}
            onReorder={setItems}
            renderItem={(it, i, handleProps) => {
              const r = resolveTemplateItem(it, catalogById);
              return (
                <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" {...handleProps}><Icon name="grip-vertical" size={18} /></button>
                  {it.catalogItemId ? (
                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.missing ? <span style={{ color: 'var(--danger, #d33)' }}>{r.description}</span> : r.description}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>{money(r.unitPrice)} · from catalog</div>
                    </div>
                  ) : (
                    <input style={{ flex: '1 1 160px' }} placeholder="Description" value={it.description || ''} onChange={(e) => setLegacy(i, 'description', e.target.value)} />
                  )}
                  <input style={{ width: 72, fontSize: 18, fontWeight: 600, textAlign: 'center' }} type="number" inputMode="decimal" min="0" value={it.qty} onChange={(e) => setQty(i, e.target.value)} aria-label="Qty" />
                  {!it.catalogItemId && (
                    <input style={{ width: 104, fontSize: 18 }} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={it.unitPrice ?? ''} onChange={(e) => setLegacy(i, 'unitPrice', e.target.value)} aria-label="Unit price" />
                  )}
                  <button className="btn btn--ghost btn--sm" onClick={() => removeRow(i)} aria-label="Remove item"><Icon name="x" /></button>
                </div>
              );
            }}
          />

          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <button className="btn btn--ghost btn--sm" onClick={() => setPickerOpen(true)}><Icon name="clipboard" /> Add from catalog</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowNew((v) => !v)}><Icon name="plus" /> New item</button>
          </div>

          {showNew && (
            <div className="row" style={{ gap: 8, alignItems: 'flex-end', marginTop: 10 }}>
              <div style={{ flex: 2 }}>
                <span className="muted" style={{ fontSize: 12 }}>Description</span>
                <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="e.g. Service call" />
              </div>
              <div style={{ flex: 1 }}>
                <span className="muted" style={{ fontSize: 12 }}>Price</span>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="0.00" />
              </div>
              <button className="btn btn--sm" onClick={confirmNewItem}>Add</button>
            </div>
          )}

          <div className="btn-row">
            <button className="btn btn--ghost" onClick={cancel}>Cancel</button>
            <button className="btn" onClick={save}>Save work type</button>
          </div>
        </div>
      )}

      {!editing && (
        <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={startNew}><Icon name="plus" /> Add work type</button>
      )}

      {pickerOpen && <CatalogPicker onPick={addFromCatalog} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
