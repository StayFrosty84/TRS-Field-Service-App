import { describe, it, expect, beforeEach } from 'vitest';
import { loadDraft, saveDraft, clearDraft, draftHasContent } from './draft.js';

beforeEach(() => localStorage.clear());

describe('draft storage', () => {
  it('returns null when no draft is stored', () => {
    expect(loadDraft('k')).toBeNull();
  });

  it('round-trips a saved draft', () => {
    saveDraft({ issue: 'Broken', unitNumber: '42' }, 'k');
    expect(loadDraft('k')).toEqual({ issue: 'Broken', unitNumber: '42' });
  });

  it('clear removes the draft', () => {
    saveDraft({ issue: 'Broken' }, 'k');
    clearDraft('k');
    expect(loadDraft('k')).toBeNull();
  });

  it('returns null on corrupt JSON instead of throwing', () => {
    localStorage.setItem('k', '{not json');
    expect(loadDraft('k')).toBeNull();
  });
});

describe('draftHasContent', () => {
  it('is false for empty / missing input', () => {
    expect(draftHasContent()).toBe(false);
    expect(draftHasContent({})).toBe(false);
    expect(draftHasContent({ accountId: '', issue: '  ', serviceDate: '2026-06-29' })).toBe(false);
  });

  it('is true when a meaningful field is filled', () => {
    expect(draftHasContent({ issue: 'Fix it' })).toBe(true);
    expect(draftHasContent({ accountId: 'acc1' })).toBe(true);
    expect(draftHasContent({ unitNumber: '7' })).toBe(true);
    expect(draftHasContent({ isEstimate: true })).toBe(true);
  });
});
