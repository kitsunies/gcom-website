import { useEffect, useState } from 'react';
import { content, href, calendar, type EventSummary } from '../content';
import snapshot from '../../public/data/events.json';
import { eventDate, isCurrentEvent } from '../event-date';
export function Events() {
  const calendar = content.settings.calendarUrl;
  const copy = content.home.events;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const events = (snapshot.events as EventSummary[])
    .filter((event) => now === null || isCurrentEvent(event, now))
    .slice(0, 6);
  return (
    <section
      className="events-section container"
      id="events"
      aria-labelledby="events-heading"
    >
      <div className="section-top">
        <div>
          <span className="eyebrow pixel">{copy.eyebrow}</span>
          <h2 id="events-heading">{copy.heading}</h2>
        </div>
        {calendar ? (
          <a className="text-link" href={calendar}>
            {copy.calendarLabel} <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </div>
      {events.length ? (
        <ul className="event-list">
          {events.map((event) => (
            <li key={event.id}>
              <a href={event.url}>
                <div>
                  <time dateTime={event.start}>{eventDate(event)}</time>
                  <h3>{event.title}</h3>
                  {event.location ? <p>{event.location}</p> : null}
                </div>
                <span className="event-action">
                  {copy.eventLabel} <span aria-hidden="true">↗</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <span className="empty-symbol pixel" aria-hidden="true">
            [ + ]
          </span>
          <div>
            <h3>{calendar ? copy.emptyHeading : copy.unconnectedHeading}</h3>
            <p>{calendar ? copy.emptyText : copy.unconnectedText}</p>
          </div>
        </div>
      )}
      <p className="events-note">{copy.note}</p>
    </section>
  );
}
