import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './autosave.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
  it('calls fn once with the latest args after the wait', () => {
    const fn = vi.fn();
    const d = debounce(fn, 700);
    d('a');
    d('b');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('flush runs the pending call immediately', () => {
    const fn = vi.fn();
    const d = debounce(fn, 700);
    d('x');
    d.flush();
    expect(fn).toHaveBeenCalledWith('x');
    vi.advanceTimersByTime(700);
    expect(fn).toHaveBeenCalledTimes(1); // not called again
  });

  it('flush with nothing pending does nothing', () => {
    const fn = vi.fn();
    const d = debounce(fn, 700);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel drops the pending call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 700);
    d('x');
    d.cancel();
    vi.advanceTimersByTime(700);
    expect(fn).not.toHaveBeenCalled();
  });
});
