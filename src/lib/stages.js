// Pure, unit-testable helpers for the configurable work-order stage pipeline.
// No Dexie imports here — keeps the logic testable in the node environment and
// reusable by the DB layer, filters, and the dashboard.

const DAY = 86400000;

// The starter pipeline seeded on first boot. Order is implied by array index.
// `color` is one of 'open' | 'progress' | 'done' (mapped to a badge class).
export const DEFAULT_STAGES = [
  { name: 'Open', color: 'open', isTerminal: false },
  { name: 'Scheduled', color: 'open', isTerminal: false },
  { name: 'In progress', color: 'progress', isTerminal: false },
  { name: 'Completed', color: 'done', isTerminal: true },
  { name: 'Invoiced', color: 'done', isTerminal: true },
  { name: 'Paid', color: 'done', isTerminal: true },
];

// Map a stage's color to one of the existing badge style classes so themes /
// contrast keep working. 'done' reuses the existing .badge--completed style.
export function stageColorClass(stage) {
  const c = stage?.color;
  if (c === 'progress') return 'progress';
  if (c === 'done') return 'completed';
  return 'open';
}

// Resolve a work order to its current stage object.
// - Explicit stageId wins (null if that id no longer exists).
// - Legacy records (no stageId) map their binary status onto the pipeline:
//   completed → the 'Completed' stage (or first terminal), open → first non-terminal.
export function resolveStage(order, stages) {
  if (order?.stageId) return stages.find((s) => s.id === order.stageId) || null;
  if (order?.status === 'completed') {
    return stages.find((s) => s.name === 'Completed') || stages.find((s) => s.isTerminal) || null;
  }
  return stages.find((s) => !s.isTerminal) || stages[0] || null;
}

// Timestamp the current stage was entered. Falls back so the math never throws
// on legacy / un-touched records that have no stageHistory.
export function currentStageEnteredAt(order) {
  const hist = order?.stageHistory;
  if (Array.isArray(hist) && hist.length) return hist[hist.length - 1].at;
  return order?.completedAt ?? order?.createdAt ?? 0;
}

// Whole days the order has sat in its current stage.
export function daysInCurrentStage(order, stages, now = Date.now()) {
  return Math.floor((now - currentStageEnteredAt(order)) / DAY);
}

// A WO is "stuck" if it has sat in a non-terminal stage longer than the threshold.
// Terminal stages (and unresolved stages) are never stuck.
export function isStuck(order, stages, thresholdDays, now = Date.now()) {
  const stage = resolveStage(order, stages);
  if (!stage || stage.isTerminal) return false;
  return daysInCurrentStage(order, stages, now) > thresholdDays;
}

// Build the initial stageHistory for a legacy WO the first time its stage is
// touched: one entry of the resolved legacy stage at completedAt || createdAt.
export function seedStageHistory(order, stages) {
  const stage = resolveStage(order, stages);
  if (!stage) return [];
  return [{ stageId: stage.id, at: order?.completedAt ?? order?.createdAt ?? Date.now() }];
}
