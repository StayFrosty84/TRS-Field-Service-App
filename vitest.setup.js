// Node test environment shims so Dexie-backed sync code runs under Vitest:
// an in-memory IndexedDB and a minimal localStorage (used for the device id).
import 'fake-indexeddb/auto';

// Define our own localStorage unconditionally (don't read globalThis.localStorage first —
// touching Node's experimental native one emits a warning).
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  },
});
