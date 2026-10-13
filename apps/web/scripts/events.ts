import ical, { type ParameterValue, type DateWithTimeZone } from 'node-ical';
import { safeHttps, validateEvents } from './validate-content';
import type { EventSummary } from '../src/content';

const plainText = (value: ParameterValue | undefined) =>
  (typeof value === 'string' ? value : value?.val || '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim();
const calendarDay = (date: DateWithTimeZone) =>
  date.tz
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: date.tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date)
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function importCalendar(
  source: string,
  calendarUrl: string,
  now = new Date(),
) {
  if (!safeHttps(calendarUrl))
    throw new Error('A public HTTPS calendar destination is required');
  if (
    !/^BEGIN:VCALENDAR\r?$/m.test(source) ||
    !/^END:VCALENDAR\s*$/m.test(source) ||
    !/^VERSION:2\.0\r?$/m.test(source)
  )
    throw new Error('Invalid iCalendar document');
  const begins = source.match(/^BEGIN:VEVENT\r?$/gm)?.length || 0;
  const ends = source.match(/^END:VEVENT\r?$/gm)?.length || 0;
  if (begins !== ends) throw new Error('Incomplete iCalendar events');
  const parsed = ical.sync.parseICS(source);
  const until = new Date(now.getTime() + 90 * 86400000);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const occurrences = new Map<string, EventSummary>();
  for (const item of Object.values(parsed)) {
    if (item?.type !== 'VEVENT') continue;
    if (item.status === 'CANCELLED') continue;
    if (
      !item.uid ||
      !item.start ||
      !Number.isFinite(item.start.getTime()) ||
      !plainText(item.summary)
    )
      throw new Error('Calendar event is missing required fields');
    if (
      item.end &&
      (!Number.isFinite(item.end.getTime()) || item.end < item.start)
    )
      throw new Error('Calendar event has an invalid end date');
    for (const instance of ical.expandRecurringEvent(item, {
      from: new Date(now.getTime() - 86400000),
      to: until,
      expandOngoing: true,
    })) {
      if (instance.event.status === 'CANCELLED') continue;
      const start = instance.isFullDay
        ? calendarDay(instance.start)
        : instance.start.toISOString();
      const end = instance.isFullDay
        ? calendarDay(instance.end)
        : instance.end.toISOString();
      if (
        instance.isFullDay
          ? end <= today
          : instance.end.getTime() <= now.getTime()
      )
        continue;
      const id = `${item.uid}:${start}`;
      const location = plainText(instance.event.location);
      occurrences.set(id, {
        id,
        title: plainText(instance.summary),
        start,
        ...(end !== start ? { end } : {}),
        allDay: instance.isFullDay,
        ...(location ? { location } : {}),
        url: safeHttps(instance.event.url) ? instance.event.url : calendarUrl,
      });
      if (occurrences.size > 1000)
        throw new Error('Calendar exceeds the public occurrence limit');
    }
  }
  if (
    begins > 0 &&
    !Object.values(parsed).some((item) => item?.type === 'VEVENT')
  )
    throw new Error('Calendar events were not parsed');
  const snapshot = {
    updatedAt: now.toISOString(),
    events: [...occurrences.values()].sort((a, b) =>
      a.start.localeCompare(b.start),
    ),
  };
  validateEvents(snapshot);
  return snapshot;
}
