import assert from 'node:assert/strict';
import test from 'node:test';

import { getNextDueDate } from './recurrence';
import { calculateStreak } from './streak';

test('getNextDueDate supports FREQ=DAILY', () => {
  const fromDate = new Date('2026-03-30T10:00:00.000Z');
  const next = getNextDueDate('FREQ=DAILY', fromDate);
  assert.ok(next);
  assert.equal(next?.toISOString(), '2026-03-31T10:00:00.000Z');
});

test('getNextDueDate supports FREQ=WEEKLY;BYDAY=MO', () => {
  const fromDate = new Date('2026-03-31T10:00:00.000Z');
  const next = getNextDueDate('FREQ=WEEKLY;BYDAY=MO', fromDate);
  assert.ok(next);
  assert.equal(next?.toISOString(), '2026-04-06T10:00:00.000Z');
});

test('getNextDueDate supports FREQ=MONTHLY', () => {
  const fromDate = new Date('2026-03-30T10:00:00.000Z');
  const next = getNextDueDate('FREQ=MONTHLY', fromDate);
  assert.ok(next);
  assert.equal(next?.toISOString(), '2026-04-30T10:00:00.000Z');
});

test('getNextDueDate supports weekday BYDAY and skips weekend', () => {
  const fromDate = new Date('2026-04-03T10:00:00.000Z');
  const next = getNextDueDate('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR', fromDate);
  assert.ok(next);
  assert.equal(next?.toISOString(), '2026-04-06T10:00:00.000Z');
});

test('getNextDueDate returns null when UNTIL has passed', () => {
  const fromDate = new Date('2026-03-30T10:00:00.000Z');
  const next = getNextDueDate('FREQ=WEEKLY;UNTIL=20250301T000000Z', fromDate);
  assert.equal(next, null);
});

test('calculateStreak increments for consecutive recurring completions', () => {
  const runs = [
    { completed_at: '2026-03-30T10:00:00.000Z' },
    { completed_at: '2026-03-29T10:00:00.000Z' },
    { completed_at: '2026-03-28T10:00:00.000Z' },
  ];
  const streak = calculateStreak(runs, 'FREQ=DAILY');
  assert.equal(streak, 3);
});

test('calculateStreak resets to 0 when recurrence gap is missed', () => {
  const runs = [
    { completed_at: '2026-03-30T10:00:00.000Z' },
    { completed_at: '2026-03-27T10:00:00.000Z' },
  ];
  const streak = calculateStreak(runs, 'FREQ=DAILY');
  assert.equal(streak, 0);
});

test('calculateStreak returns 1 for single completion', () => {
  const runs = [{ completed_at: '2026-03-30T10:00:00.000Z' }];
  const streak = calculateStreak(runs, 'FREQ=DAILY');
  assert.equal(streak, 1);
});

test('calculateStreak returns 0 for no completions', () => {
  const streak = calculateStreak([], 'FREQ=DAILY');
  assert.equal(streak, 0);
});

test('calculateStreak for non-recurring chores equals completion count', () => {
  const runs = [
    { completed_at: '2026-03-30T10:00:00.000Z' },
    { completed_at: '2026-03-20T10:00:00.000Z' },
    { completed_at: '2026-03-10T10:00:00.000Z' },
  ];
  const streak = calculateStreak(runs, null);
  assert.equal(streak, 3);
});
