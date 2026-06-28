// Debounce: call `fn` once, `wait` ms after the last invocation, with the latest args.
// `.flush()` runs a pending call now (used on blur/unmount); `.cancel()` drops it.
export function debounce(fn, wait) {
  let timer = null;
  let pendingArgs = null;
  const debounced = (...args) => {
    pendingArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const args2 = pendingArgs;
      pendingArgs = null;
      fn(...args2);
    }, wait);
  };
  debounced.flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    const args = pendingArgs;
    pendingArgs = null;
    if (args) fn(...args);
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };
  return debounced;
}
