import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importCalendar } from '../scripts/events';
import { syncEvents } from '../scripts/import-events';
import {
  safeHttps,
  validateRoster,
  validateEvents,
} from '../scripts/validate-content';
import { eventDate, isCurrentEvent } from '../src/event-date';

const calendar = 'https://lu.ma/gcom-test';
const now = new Date('2026-10-01T00:00:00Z');
const event = (id: string, extra = '') =>
  `BEGIN:VEVENT\nUID:${id}\nDTSTAMP:20260101T000000Z\nSUMMARY:Test event\nDTSTART:20261015T080000Z\nDTEND:20261015T100000Z\n${extra}\nEND:VEVENT`;
const feed = (...events: string[]) =>
  `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//GCOM Tests//EN\n${events.join('\n')}\nEND:VCALENDAR`;

test('empty calendar is valid; malformed or incomplete feeds fail', () => {
  assert.deepEqual(importCalendar(feed(), calendar, now).events, []);
  for (const text of [
    '<html>error</html>',
    'BEGIN:VCALENDAR\nEND:VCALENDAR',
    feed(event('bad')).replace('DTSTART:20261015T080000Z', ''),
    feed(event('bad')).replace('END:VEVENT', ''),
  ])
    assert.throws(() => importCalendar(text, calendar, now));
  assert.throws(() =>
    importCalendar(
      feed(
        event('bad').replace(
          'DTEND:20261015T100000Z',
          'DTEND:20261014T100000Z',
        ),
      ),
      calendar,
      now,
    ),
  );
});
test('safe destinations, cancelled/ended exclusion, ongoing events, public fields and ordering', () => {
  assert.deepEqual(
    importCalendar(
      feed('BEGIN:VEVENT\nUID:cancelled\nSTATUS:CANCELLED\nEND:VEVENT'),
      calendar,
      now,
    ).events,
    [],
  );
  const ongoing = event('ongoing', 'LOCATION:Campus')
    .replace('20261015T080000Z', '20260930T080000Z')
    .replace('20261015T100000Z', '20261002T100000Z');
  const ended = event('ended').replaceAll('20261015', '20260915');
  const result = importCalendar(
    feed(
      event('cancelled', 'STATUS:CANCELLED'),
      ended,
      ongoing,
      event(
        'later',
        'URL:javascript:alert(1)\nDESCRIPTION:private notes\nORGANIZER:mailto:private@example.test',
      ),
    ),
    calendar,
    now,
  );
  assert.deepEqual(
    result.events.map((e) => e.id.split(':')[0]),
    ['ongoing', 'later'],
  );
  assert.equal(result.events[1].url, calendar);
  assert.equal(result.events[0].location, 'Campus');
  assert(!JSON.stringify(result).includes('private'));
  assert(safeHttps('https://lu.ma/example'));
  for (const url of [
    'javascript:alert(1)',
    'http://example.test',
    'https://secret@example.test',
    '/event',
  ])
    assert.equal(safeHttps(url), false);
});
test('all-day ranges preserve exclusive ends and recurrence dates', () => {
  const allDay = `BEGIN:VEVENT\nUID:day\nSUMMARY:Jam\nDTSTART;VALUE=DATE:20261003\nDTEND;VALUE=DATE:20261005\nRRULE:FREQ=WEEKLY;COUNT=2\nEND:VEVENT`;
  const events = importCalendar(feed(allDay), calendar, now).events;
  assert.deepEqual(
    events.map((e) => [e.start, e.end, e.allDay]),
    [
      ['2026-10-03', '2026-10-05', true],
      ['2026-10-10', '2026-10-12', true],
    ],
  );
  assert.equal(eventDate(events[0]), '3 Oct 2026 to 4 Oct 2026');
  assert(isCurrentEvent(events[0], Date.parse('2026-10-04T12:59:00Z')));
  assert(!isCurrentEvent(events[0], Date.parse('2026-10-04T13:00:00Z')));
});
test('recurrences cross Melbourne DST, exclude EXDATE, apply moved and cancelled overrides', () => {
  const recurring = `BEGIN:VEVENT\nUID:weekly\nSUMMARY:Workshop\nDTSTART;TZID=Australia/Melbourne:20260927T180000\nDTEND;TZID=Australia/Melbourne:20260927T190000\nRRULE:FREQ=WEEKLY;COUNT=5\nEXDATE;TZID=Australia/Melbourne:20261011T180000\nEND:VEVENT`;
  const moved = `BEGIN:VEVENT\nUID:weekly\nRECURRENCE-ID;TZID=Australia/Melbourne:20261018T180000\nSUMMARY:Moved workshop\nDTSTART;TZID=Australia/Melbourne:20261019T180000\nDTEND;TZID=Australia/Melbourne:20261019T190000\nEND:VEVENT`;
  const cancelled = moved
    .replaceAll('20261018', '20261025')
    .replaceAll('20261019', '20261025')
    .replace('SUMMARY:Moved workshop', 'SUMMARY:Cancelled\nSTATUS:CANCELLED');
  const events = importCalendar(
    feed(recurring, moved, cancelled),
    calendar,
    new Date('2026-09-25T00:00:00Z'),
  ).events;
  assert.deepEqual(
    events.map((e) => e.start),
    [
      '2026-09-27T08:00:00.000Z',
      '2026-10-04T07:00:00.000Z',
      '2026-10-19T07:00:00.000Z',
    ],
  );
  assert.equal(events[2].title, 'Moved workshop');
});
test('duplicate identities are deduplicated and occurrences outside 90 days omitted', () => {
  const recurring = event('repeat', 'RRULE:FREQ=DAILY;COUNT=180');
  const events = importCalendar(
    feed(recurring, recurring),
    calendar,
    now,
  ).events;
  assert.equal(events.length, new Set(events.map((e) => e.id)).size);
  assert(events.length > 60 && events.length < 90);
  assert(
    events.every((e) => Date.parse(e.start) <= now.getTime() + 90 * 86400000),
  );
});
test('failed fetch or parse preserves the last valid snapshot byte for byte', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcom-events-'));
  const path = join(dir, 'events.json');
  const previous = '{"updatedAt":null,"events":[]}\n';
  await writeFile(path, previous);
  try {
    for (const response of [
      new Response('unavailable', { status: 503 }),
      new Response('not an iCal'),
    ]) {
      await assert.rejects(
        syncEvents(
          'https://api.lu.ma/calendar.ics',
          calendar,
          path,
          async () => response,
        ),
      );
      assert.equal(await readFile(path, 'utf8'), previous);
    }
    await syncEvents(
      'https://api.lu.ma/calendar.ics',
      calendar,
      path,
      async () => new Response(feed()),
    );
    validateEvents(JSON.parse(await readFile(path, 'utf8')));
  } finally {
    await rm(dir, { recursive: true });
  }
});
test('public roster rejects private fields, unsafe links, duplicate identities and traversal', () => {
  const member = {
    id: 'abc',
    name: 'Person',
    role: 'Role',
    photo: 'team/revision/photo.webp',
    links: [{ label: 'Website', url: 'https://example.test' }],
  };
  const roster = (members: unknown[]) => ({
    revision: 'revision',
    publishedAt: '2026-10-01T00:00:00Z',
    members,
  });
  validateRoster(roster([member]));
  for (const invalid of [
    { ...member, email: 'private@example.test' },
    { ...member, photo: '../../secret.png' },
    { ...member, links: [{ label: 'Link', url: 'javascript:alert(1)' }] },
  ])
    assert.throws(() => validateRoster(roster([invalid])));
  assert.throws(() => validateRoster(roster([member, member])));
});
