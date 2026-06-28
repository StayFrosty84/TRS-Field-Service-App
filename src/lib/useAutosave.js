import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from './autosave.js';

// Auto-save `data` by calling save(data) shortly after the user stops changing it.
// Returns { status, flush } — status drives a subtle indicator; flush forces a save
// (wire it to a container onBlur so leaving a field saves immediately).
export function useAutosave(data, save, { wait = 700, enabled = true } = {}) {
  const [status, setStatus] = useState('idle');
  const saveRef = useRef(save);
  saveRef.current = save;
  const lastSaved = useRef(null);
  const initialized = useRef(false);

  const debounced = useMemo(
    () =>
      debounce(async (payload) => {
        setStatus('saving');
        await saveRef.current(payload);
        setStatus('saved');
      }, wait),
    [wait]
  );

  useEffect(() => {
    if (!enabled) return;
    const json = JSON.stringify(data);
    if (!initialized.current) {
      initialized.current = true;
      lastSaved.current = json; // don't save the values we just loaded
      return;
    }
    if (json === lastSaved.current) return;
    lastSaved.current = json;
    debounced(data);
  }, [data, enabled, debounced]);

  useEffect(() => () => debounced.flush(), [debounced]);

  return { status, flush: debounced.flush };
}
