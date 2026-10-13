import type { EventSummary } from './content';

export function isCurrentEvent(event: EventSummary, now: number) {
  if (!event.allDay) return Date.parse(event.end || event.start) > now;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const end = event.end || new Date(Date.parse(event.start) + 86400000).toISOString().slice(0, 10);
  return end > today;
}

export function eventDate(event: EventSummary) {
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', timeZone: event.allDay ? 'UTC' : 'Australia/Melbourne' };
  const date = (value: string) => new Intl.DateTimeFormat('en-AU', options).format(new Date(value));
  if (event.allDay) {
    const inclusiveEnd = event.end ? new Date(new Date(event.end).getTime() - 86400000).toISOString() : undefined;
    return inclusiveEnd && inclusiveEnd.slice(0, 10) !== event.start.slice(0, 10) ? `${date(event.start)} to ${date(inclusiveEnd)}` : date(event.start);
  }
  const timed = (value: string) => new Intl.DateTimeFormat('en-AU', { ...options, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
  return event.end && date(event.end) !== date(event.start) ? `${timed(event.start)} to ${timed(event.end)}` : timed(event.start);
}
