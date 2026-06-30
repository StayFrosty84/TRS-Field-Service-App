import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listStages, createStage, updateStage, deleteStage } from '../db/db.js';
import { stageColorClass } from '../lib/stages.js';
import SortableList from './SortableList.jsx';
import Icon from './Icon.jsx';

const COLORS = [
  ['open', 'Open'],
  ['progress', 'In progress'],
  ['done', 'Done'],
];

export default function StageManager() {
  const stages = useLiveQuery(listStages) || [];
  const [editing, setEditing] = useState(null); // id | 'new' | null
  const [name, setName] = useState('');
  const [color, setColor] = useState('open');
  const [isTerminal, setIsTerminal] = useState(false);

  function startNew() {
    setEditing('new');
    setName('');
    setColor('open');
    setIsTerminal(false);
  }
  function startEdit(s) {
    setEditing(s.id);
    setName(s.name);
    setColor(s.color || 'open');
    setIsTerminal(!!s.isTerminal);
  }
  function cancel() {
    setEditing(null);
  }

  async function save() {
    const data = { name: name.trim() || 'Untitled', color, isTerminal };
    if (editing === 'new') await createStage(data);
    else await updateStage(editing, data);
    setEditing(null);
  }

  async function remove(s) {
    if (!confirm(`Delete ${s.name}?`)) return;
    const inUse = await deleteStage(s.id);
    if (inUse > 0) {
      alert(`${inUse} work order(s) are in this stage — move them to another stage first.`);
    }
  }

  // Reordering rewrites each row's `order` to its new index.
  function onReorder(next) {
    next.forEach((s, i) => {
      if (s.order !== i) updateStage(s.id, { order: i });
    });
  }

  return (
    <div className="card">
      {stages.length === 0 && <p className="muted" style={{ marginTop: 0 }}>No stages yet.</p>}
      <SortableList
        items={stages}
        getKey={(s) => s.id}
        onReorder={onReorder}
        renderItem={(s, i, handleProps) => (
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="row" style={{ gap: 8, alignItems: 'center' }}>
              <button type="button" {...handleProps}><Icon name="grip-vertical" size={18} /></button>
              <span className={`badge badge--${stageColorClass(s)}`}>{s.name}</span>
              {s.isTerminal && <span className="muted" style={{ fontSize: 12 }}>· finished</span>}
            </span>
            <span className="row" style={{ gap: 6 }}>
              <button className="btn btn--ghost btn--sm" onClick={() => startEdit(s)} aria-label={`Edit ${s.name}`}><Icon name="pencil" /></button>
              <button className="btn btn--ghost btn--sm" onClick={() => remove(s)} aria-label={`Delete ${s.name}`}><Icon name="trash-2" /></button>
            </span>
          </div>
        )}
      />

      {editing && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <label>Stage name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Scheduled" />
          <div className="section-title" style={{ marginTop: 12 }}>Color</div>
          <div className="chips">
            {COLORS.map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={`chip ${color === val ? 'chip--active' : ''}`}
                aria-pressed={color === val}
                onClick={() => setColor(val)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="row" style={{ gap: 10, alignItems: 'center', marginTop: 12 }}>
            <input
              type="checkbox"
              checked={isTerminal}
              onChange={(e) => setIsTerminal(e.target.checked)}
              style={{ width: 22, height: 22, minHeight: 0, flex: '0 0 auto' }}
            />
            <span style={{ flex: 1 }}>Counts as finished — jobs here are done and never flagged “stuck”.</span>
          </label>
          <div className="btn-row">
            <button className="btn btn--ghost" onClick={cancel}>Cancel</button>
            <button className="btn" onClick={save}>Save stage</button>
          </div>
        </div>
      )}

      {!editing && (
        <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={startNew}><Icon name="plus" /> Add stage</button>
      )}
    </div>
  );
}
