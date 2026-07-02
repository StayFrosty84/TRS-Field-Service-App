// Pure last-writer-wins merge across device "state" docs. No Dexie, no I/O — just data.
//
// A state is one device's view:
//   { data: { [table]: row[] }, tombstones: [{ table, key, deletedAt }] }
// Every row carries `id` and `updatedAt`. The merge is commutative + idempotent, so it's
// safe to apply states in any order and more than once (the basis of file-based sync).

// True if `candidate` should beat `current` for the same id. Newer updatedAt wins; ties
// break on a stable serialization so the result is order-independent across devices.
function rowWins(candidate, current) {
  if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;
  return JSON.stringify(candidate) > JSON.stringify(current);
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byTableKey = (a, b) => {
  const ka = `${a.table}:${a.key}`;
  const kb = `${b.table}:${b.key}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

export function mergeStates(states) {
  // Latest tombstone per table:key.
  const tombstones = new Map();
  for (const state of states) {
    for (const t of state.tombstones || []) {
      const k = `${t.table}:${t.key}`;
      const prev = tombstones.get(k);
      if (!prev || t.deletedAt > prev.deletedAt) {
        tombstones.set(k, { table: t.table, key: t.key, deletedAt: t.deletedAt });
      }
    }
  }

  // Latest live row per table:id.
  const live = new Map(); // table -> Map(id -> row)
  for (const state of states) {
    for (const [table, rows] of Object.entries(state.data || {})) {
      if (!live.has(table)) live.set(table, new Map());
      const rowsById = live.get(table);
      for (const row of rows) {
        const prev = rowsById.get(row.id);
        if (!prev || rowWins(row, prev)) rowsById.set(row.id, row);
      }
    }
  }

  // Resolve each tombstone against its live counterpart: a live update only survives if it
  // is strictly newer than the delete; otherwise the delete wins and the row is dropped.
  const outTombstones = [];
  for (const tomb of tombstones.values()) {
    const rowsById = live.get(tomb.table);
    const liveRow = rowsById && rowsById.get(tomb.key);
    if (liveRow && liveRow.updatedAt > tomb.deletedAt) continue; // update beats stale tombstone
    if (rowsById) rowsById.delete(tomb.key);
    outTombstones.push(tomb);
  }

  const data = {};
  for (const [table, rowsById] of live) {
    data[table] = [...rowsById.values()].sort(byId);
  }
  outTombstones.sort(byTableKey);

  return { data, tombstones: outTombstones };
}
