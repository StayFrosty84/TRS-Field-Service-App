import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STAGES,
  stageColorClass,
  resolveStage,
  currentStageEnteredAt,
  daysInCurrentStage,
  isStuck,
  seedStageHistory,
} from './stages.js';

const DAY = 86400000;
// Fixed "now" so date math is deterministic.
const NOW = new Date(2026, 5, 21, 10, 0, 0).getTime();

// A pipeline matching the seeded default.
const STAGES = [
  { id: 's0', name: 'Open', order: 0, color: 'open', isTerminal: false },
  { id: 's1', name: 'Scheduled', order: 1, color: 'open', isTerminal: false },
  { id: 's2', name: 'In progress', order: 2, color: 'progress', isTerminal: false },
  { id: 's3', name: 'Completed', order: 3, color: 'done', isTerminal: true },
  { id: 's4', name: 'Invoiced', order: 4, color: 'done', isTerminal: true },
  { id: 's5', name: 'Paid', order: 5, color: 'done', isTerminal: true },
];

describe('DEFAULT_STAGES', () => {
  it('lists six ordered stages, last three terminal', () => {
    expect(DEFAULT_STAGES.map((s) => s.name)).toEqual([
      'Open',
      'Scheduled',
      'In progress',
      'Completed',
      'Invoiced',
      'Paid',
    ]);
    expect(DEFAULT_STAGES.map((s) => s.isTerminal)).toEqual([false, false, false, true, true, true]);
  });
});

describe('stageColorClass', () => {
  it('maps open and progress straight through', () => {
    expect(stageColorClass({ color: 'open' })).toBe('open');
    expect(stageColorClass({ color: 'progress' })).toBe('progress');
  });
  it('maps "done" to the existing completed badge class', () => {
    expect(stageColorClass({ color: 'done' })).toBe('completed');
  });
  it('falls back to open for a missing/unknown color', () => {
    expect(stageColorClass({})).toBe('open');
    expect(stageColorClass(null)).toBe('open');
  });
});

describe('resolveStage', () => {
  it('returns the stage matching an explicit stageId', () => {
    expect(resolveStage({ stageId: 's2' }, STAGES)).toBe(STAGES[2]);
  });
  it('maps a legacy completed WO to the Completed stage', () => {
    expect(resolveStage({ status: 'completed' }, STAGES)).toBe(STAGES[3]);
  });
  it('maps a legacy completed WO to the first terminal stage when none is named "Completed"', () => {
    const renamed = STAGES.map((s) => (s.name === 'Completed' ? { ...s, name: 'Done' } : s));
    expect(resolveStage({ status: 'completed' }, renamed)).toBe(renamed[3]);
  });
  it('maps a legacy open WO to the first non-terminal stage', () => {
    expect(resolveStage({ status: 'open' }, STAGES)).toBe(STAGES[0]);
  });
  it('returns null when an explicit stageId is not found', () => {
    expect(resolveStage({ stageId: 'gone' }, STAGES)).toBeNull();
  });
  it('falls back to the first stage for a WO with no status and no stageId', () => {
    expect(resolveStage({}, STAGES)).toBe(STAGES[0]);
  });
});

describe('currentStageEnteredAt', () => {
  it("uses the last stageHistory entry's timestamp", () => {
    const t = NOW - 3 * DAY;
    const order = { stageHistory: [{ stageId: 's0', at: NOW - 10 * DAY }, { stageId: 's2', at: t }] };
    expect(currentStageEnteredAt(order)).toBe(t);
  });
  it('falls back to completedAt for a legacy record with no history', () => {
    const t = NOW - 5 * DAY;
    expect(currentStageEnteredAt({ status: 'completed', completedAt: t })).toBe(t);
  });
  it('falls back to createdAt when there is no history or completedAt', () => {
    const t = NOW - 5 * DAY;
    expect(currentStageEnteredAt({ status: 'open', createdAt: t })).toBe(t);
  });
});

describe('daysInCurrentStage', () => {
  it('floors the elapsed days since the current stage was entered', () => {
    const order = { stageHistory: [{ stageId: 's2', at: NOW - 3 * DAY - 1000 }] };
    expect(daysInCurrentStage(order, STAGES, NOW)).toBe(3);
  });
  it('uses createdAt for a legacy record', () => {
    expect(daysInCurrentStage({ status: 'open', createdAt: NOW - 9 * DAY }, STAGES, NOW)).toBe(9);
  });
});

describe('isStuck', () => {
  it('is true when days in a non-terminal stage exceed the threshold', () => {
    const order = { stageId: 's0', stageHistory: [{ stageId: 's0', at: NOW - 10 * DAY }] };
    expect(isStuck(order, STAGES, 7, NOW)).toBe(true);
  });
  it('is false when days are at or under the threshold', () => {
    const order = { stageId: 's0', stageHistory: [{ stageId: 's0', at: NOW - 7 * DAY }] };
    expect(isStuck(order, STAGES, 7, NOW)).toBe(false);
  });
  it('is always false for a terminal stage, however old', () => {
    const order = { stageId: 's5', stageHistory: [{ stageId: 's5', at: NOW - 100 * DAY }] };
    expect(isStuck(order, STAGES, 7, NOW)).toBe(false);
  });
  it('is false when the WO resolves to no stage', () => {
    expect(isStuck({ stageId: 'gone' }, STAGES, 7, NOW)).toBe(false);
  });
  it('handles a legacy open record with only createdAt', () => {
    expect(isStuck({ status: 'open', createdAt: NOW - 30 * DAY }, STAGES, 7, NOW)).toBe(true);
  });
  it('handles a legacy completed record (terminal → never stuck)', () => {
    expect(isStuck({ status: 'completed', completedAt: NOW - 30 * DAY }, STAGES, 7, NOW)).toBe(false);
  });
});

describe('seedStageHistory', () => {
  it('seeds one entry of the resolved legacy stage at completedAt for a completed WO', () => {
    const t = NOW - 5 * DAY;
    expect(seedStageHistory({ status: 'completed', completedAt: t, createdAt: NOW - 20 * DAY }, STAGES)).toEqual([
      { stageId: 's3', at: t },
    ]);
  });
  it('seeds one entry of the first non-terminal stage at createdAt for an open WO', () => {
    const t = NOW - 20 * DAY;
    expect(seedStageHistory({ status: 'open', createdAt: t }, STAGES)).toEqual([{ stageId: 's0', at: t }]);
  });
});
