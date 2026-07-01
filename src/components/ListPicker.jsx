import { useLiveQuery } from 'dexie-react-hooks';
import { listItems } from '../db/db.js';

// A <select> populated from an admin-managed picklist (kind). Always renders the current
// `value` as an option even when it's no longer in the list (legacy / deleted value), so a
// stored value never silently disappears.
export default function ListPicker({ kind, value, onChange, includeBlank = false, blankLabel = '— None —', ...rest }) {
  const items = useLiveQuery(() => listItems(kind), [kind]) || [];
  const names = items.map((it) => it.name);
  const offList = value != null && value !== '' && !names.includes(value);
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {includeBlank && <option value="">{blankLabel}</option>}
      {offList && <option value={value}>{value}</option>}
      {names.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}
