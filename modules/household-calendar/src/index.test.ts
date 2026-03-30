import assert from 'node:assert/strict';
import test from 'node:test';
import ical from 'node-ical';

import { generateIcs, type CalendarEventRow } from './ics';

function makeEvent(overrides: Partial<CalendarEventRow> = {}): CalendarEventRow {
  return {
    id: 'event-1',
    calendar_id: 'calendar-1',
    title: 'Family dinner',
    start_at: '2026-04-01T18:00:00.000Z',
    end_at: '2026-04-01T19:00:00.000Z',
    status: 'confirmed',
    recurrence_rule: null,
    reminder_at: null,
    attendee_user_ids_json: '[]',
    ...overrides,
  };
}

test('generateIcs emits VCALENDAR with one VEVENT', () => {
  const output = generateIcs([makeEvent()]);
  assert.match(output, /BEGIN:VCALENDAR/);
  assert.match(output, /END:VCALENDAR/);
  assert.match(output, /BEGIN:VEVENT/);
  assert.match(output, /UID:event-1@lifeos/);
  assert.match(output, /DTSTAMP:\d{8}T\d{6}Z/);
  assert.match(output, /\r\n/);

  const parsed = ical.parseICS(output);
  const event = Object.values(parsed).find((entry) => entry?.type === 'VEVENT');

  assert.ok(event);
  assert.equal(event.uid, 'event-1@lifeos');
  assert.ok(event.dtstamp instanceof Date);
});

test('generateIcs includes RRULE for recurring events', () => {
  const output = generateIcs([makeEvent({ recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO' })]);
  assert.match(output, /RRULE:FREQ=WEEKLY;BYDAY=MO/);

  const parsed = ical.parseICS(output);
  const event = Object.values(parsed).find((entry) => entry?.type === 'VEVENT');

  assert.ok(event);
  assert.ok(event.rrule);
  assert.match(event.rrule?.toString() ?? '', /BYDAY=MO/);
});

test('generateIcs includes VALARM when reminder_at exists', () => {
  const output = generateIcs([makeEvent({ reminder_at: '2026-04-01T17:30:00.000Z' })]);
  assert.match(output, /BEGIN:VALARM/);
  assert.match(output, /TRIGGER;VALUE=DATE-TIME:20260401T173000Z/);
  assert.match(output, /END:VALARM/);

  const parsed = ical.parseICS(output);
  const event = Object.values(parsed).find((entry) => entry?.type === 'VEVENT');

  assert.ok(event);
  assert.ok(Array.isArray(event.alarms));
  assert.equal(event.alarms?.length, 1);
});

test('generateIcs excludes cancelled events', () => {
  const output = generateIcs([
    makeEvent({ id: 'confirmed-1', status: 'confirmed' }),
    makeEvent({ id: 'cancelled-1', status: 'cancelled' }),
  ]);
  assert.match(output, /UID:confirmed-1@lifeos/);
  assert.doesNotMatch(output, /UID:cancelled-1@lifeos/);
});

test('generateIcs emits one VEVENT block per active event', () => {
  const output = generateIcs([
    makeEvent({ id: 'event-1' }),
    makeEvent({ id: 'event-2' }),
    makeEvent({ id: 'event-3' }),
  ]);
  const count = (output.match(/BEGIN:VEVENT/g) ?? []).length;
  assert.equal(count, 3);
});
