import Icon from './Icon.jsx';
import ListPicker from './ListPicker.jsx';

// Editable list of labeled phone numbers, each with an optional extension.
// `phones` is [{ label, number, ext }]; `onChange` gets the next array.
export default function PhoneListField({ phones = [], onChange }) {
  const update = (i, key, val) =>
    onChange(phones.map((p, idx) => (idx === i ? { ...p, [key]: val } : p)));
  const add = () => onChange([...phones, { label: 'Mobile', number: '', ext: '' }]);
  const remove = (i) => onChange(phones.filter((_, idx) => idx !== i));

  return (
    <>
      {phones.map((p, i) => (
        <div key={i} className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center' }}>
          <ListPicker
            kind="phoneLabel"
            value={p.label || 'Mobile'}
            onChange={(v) => update(i, 'label', v)}
            aria-label="Phone label"
            style={{ flex: '0 0 96px' }}
          />
          <input
            type="tel"
            placeholder="Phone number"
            value={p.number || ''}
            onChange={(e) => update(i, 'number', e.target.value)}
            style={{ flex: 1 }}
          />
          <input
            type="tel"
            placeholder="ext"
            value={p.ext || ''}
            onChange={(e) => update(i, 'ext', e.target.value)}
            aria-label="Extension"
            style={{ flex: '0 0 64px' }}
          />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-label="Remove phone"
            onClick={() => remove(i)}
            style={{ flex: '0 0 auto' }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={add}>
        <Icon name="plus" size={14} /> Add phone
      </button>
    </>
  );
}
