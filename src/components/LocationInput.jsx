import { useState } from 'react';
import AddressAutocomplete from './AddressAutocomplete.jsx';
import MileMarkerPicker from './MileMarkerPicker.jsx';

// Location field with a mode toggle. Address mode is the existing autocomplete, untouched.
// Mile marker mode lets the user pick an NY interstate + marker offline. Both modes call the
// same onPick({ label, lat, lng }), so the parent WO screens treat every result identically.
export default function LocationInput({ value, onChangeText, onPick, placeholder }) {
  const [mode, setMode] = useState('address'); // 'address' | 'mile'

  return (
    <div>
      <div className="chips" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className={`chip ${mode === 'address' ? 'chip--active' : ''}`}
          onClick={() => setMode('address')}
        >
          Address
        </button>
        <button
          type="button"
          className={`chip ${mode === 'mile' ? 'chip--active' : ''}`}
          onClick={() => setMode('mile')}
        >
          Mile marker
        </button>
      </div>
      {mode === 'address' ? (
        <AddressAutocomplete
          value={value}
          onChangeText={onChangeText}
          onPick={onPick}
          placeholder={placeholder}
        />
      ) : (
        <MileMarkerPicker onPick={onPick} />
      )}
    </div>
  );
}
