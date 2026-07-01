import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  setCatalogItemWorkTypes,
  listWorkTypes,
} from '../db/db.js';
import { money } from '../lib/format.js';
import { workTypesUsing } from '../lib/templateItems.js';
import { useToast } from './Toast.jsx';
import Icon from './Icon.jsx';

// Manage saved parts/labor presets used by the bill editor and work-type templates.
export default function CatalogManager() {
  const toast = useToast();
  const items = useLiveQuery(() => db.catalogItems.orderBy('description').toArray());
  const workTypes = useLiveQuery(listWorkTypes) || [];
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [editItem, setEditItem] = useState(null); // catalog item being edited, or null

  async function add() {
    if (!desc.trim()) return toast('Enter a description');
    await createCatalogItem({ description: desc.trim(), unitPrice: Number(price) || 0 });
    setDesc('');
    setPrice('');
    toast('Added to catalog');
  }

  async function remove(item) {
    if (!confirm(`Remove "${item.description}" from the catalog?`)) return;
    try {
      await deleteCatalogItem(item.id);
    } catch (err) {
      if (err.usedIn) {
        alert(`Can't delete "${item.description}".\n\nIt's used in ${err.usedIn.length} work type(s): ${err.usedIn.join(', ')}.\nRemove it from those first (bills already created keep their prices).`);
      } else {
        throw err;
      }
    }
  }

  if (!items) return null;

  return (
    <div className="card">
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Saved parts &amp; labor you can tap to add on a bill or a work-type template (e.g. “Service call”, “Labor / hr”).
      </p>

      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 2 }}>
          <span className="muted" style={{ fontSize: 12 }}>Description</span>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Service call" />
        </div>
        <div style={{ flex: 1 }}>
          <span className="muted" style={{ fontSize: 12 }}>Price</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>
      <button className="btn btn--ghost btn--sm" style={{ marginTop: 10 }} onClick={add}>
        <Icon name="plus" size={16} /> Add item
      </button>

      {items.length > 0 && (
        <div className="list" style={{ marginTop: 14 }}>
          {items.map((it) => {
            const usedCount = workTypesUsing(workTypes, it.id).length;
            return (
              <div key={it.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  {it.description} <span className="muted">· {money(it.unitPrice)}{usedCount > 0 ? ` · ${usedCount} work type(s)` : ''}</span>
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => setEditItem(it)} aria-label={`Edit ${it.description}`}><Icon name="pencil" size={16} /></button>
                  <button className="btn btn--ghost btn--sm" onClick={() => remove(it)} aria-label={`Remove ${it.description}`}><Icon name="x" size={16} /></button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {editItem && (
        <ProductEditSheet
          item={editItem}
          workTypes={workTypes}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); toast('Product saved'); }}
        />
      )}
    </div>
  );
}

function ProductEditSheet({ item, workTypes, onClose, onSaved }) {
  const [desc, setDesc] = useState(item.description);
  const [price, setPrice] = useState(item.unitPrice != null ? String(item.unitPrice) : '');
  const [checked, setChecked] = useState(() => new Set(workTypesUsing(workTypes, item.id).map((t) => t.id)));

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const toggle = (id) =>
    setChecked((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function save() {
    await updateCatalogItem(item.id, { description: desc.trim() || item.description, unitPrice: Number(price) || 0 });
    await setCatalogItemWorkTypes(item.id, [...checked]);
    onSaved();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Edit product</h2>

        <label>Description</label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} autoFocus />

        <label>Price</label>
        <input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" style={{ maxWidth: 140 }} />

        <div className="section-title" style={{ marginTop: 14 }}>Use in work types</div>
        {workTypes.length === 0 && <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>No work types yet.</p>}
        <div className="list">
          {workTypes.map((t) => (
            <label key={t.id} className="row" style={{ gap: 10, alignItems: 'center', padding: '6px 0' }}>
              <input
                type="checkbox"
                checked={checked.has(t.id)}
                onChange={() => toggle(t.id)}
                style={{ width: 22, height: 22, minHeight: 0, flex: '0 0 auto' }}
              />
              <span style={{ flex: 1 }}><Icon name={t.icon || 'wrench'} /> {t.name}</span>
            </label>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Checking a work type adds this product to its template (qty 1); unchecking removes it.</p>

        <div className="btn-row">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
