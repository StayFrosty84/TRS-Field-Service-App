import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listItems, createListItem, updateListItem, deleteListItem } from '../db/db.js';
import SortableList from './SortableList.jsx';
import Icon from './Icon.jsx';

// Admin editor for a simple {name} picklist (payment methods, phone labels, account terms).
// Inline rename on blur, drag to reorder, add/delete. Mirrors StageManager's DB-backed
// reorder (rewrite each row's `order`; useLiveQuery re-renders).
export default function ListManager({ kind, label = 'item' }) {
  const items = useLiveQuery(() => listItems(kind), [kind]) || [];
  const [newName, setNewName] = useState('');

  async function add() {
    const name = newName.trim();
    if (!name) return;
    await createListItem(kind, name);
    setNewName('');
  }

  function onReorder(next) {
    next.forEach((it, i) => {
      if (it.order !== i) updateListItem(it.id, { order: i });
    });
  }

  return (
    <div className="card">
      {items.length === 0 && <p className="muted" style={{ marginTop: 0 }}>No {label}s yet.</p>}
      <SortableList
        items={items}
        getKey={(it) => it.id}
        onReorder={onReorder}
        renderItem={(it, i, handleProps) => (
          <div className="row" style={{ gap: 6, marginBottom: 8, alignItems: 'center' }}>
            <button type="button" {...handleProps} aria-label="Drag to reorder">
              <Icon name="grip-vertical" size={18} />
            </button>
            <input
              style={{ flex: 1 }}
              defaultValue={it.name}
              aria-label={`${label} name`}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== it.name) updateListItem(it.id, { name: v });
                else e.target.value = it.name;
              }}
            />
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => confirm(`Delete "${it.name}"?`) && deleteListItem(it.id)}
              aria-label={`Delete ${it.name}`}
            >
              <Icon name="trash-2" />
            </button>
          </div>
        )}
      />
      <div className="row" style={{ gap: 6, marginTop: 4 }}>
        <input
          style={{ flex: 1 }}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`Add ${label}…`}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn btn--ghost btn--sm" onClick={add}>
          <Icon name="plus" /> Add
        </button>
      </div>
    </div>
  );
}
