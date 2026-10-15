import assert from 'node:assert/strict';

export function safeHttps(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    /[\u0000-\u0020\u007f-\u009f]/.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
const record = (value: unknown): Record<string, unknown> => {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    'Expected an object',
  );
  return value as Record<string, unknown>;
};
const keys = (value: Record<string, unknown>, allowed: string[]) => {
  for (const key of Object.keys(value))
    assert(allowed.includes(key), `Unexpected public field: ${key}`);
};
const text = (value: unknown, max = 200) =>
  assert(
    typeof value === 'string' &&
      value.trim() &&
      value.length <= max &&
      !/[\u0000-\u001f\u007f-\u009f]/.test(value),
    'Invalid public text',
  );
const sanityPortrait = (value: unknown) =>
  safeHttps(value) &&
  new URL(value).hostname === 'cdn.sanity.io' &&
  /^\/images\/[a-z0-9]+\/[a-z0-9_-]+\/[a-zA-Z0-9_-]+\.(png|webp|jpe?g)$/.test(
    new URL(value).pathname,
  );
const localPortrait = (value: unknown) =>
  typeof value === 'string' &&
  /^artwork\/[A-Za-z0-9_-]+\.(png|webp|jpe?g)$/.test(value);

export function validateEvents(value: unknown) {
  const snapshot = record(value);
  keys(snapshot, ['updatedAt', 'events']);
  assert(
    snapshot.updatedAt === null ||
      (typeof snapshot.updatedAt === 'string' &&
        Number.isFinite(Date.parse(snapshot.updatedAt))),
    'Invalid import date',
  );
  assert(
    Array.isArray(snapshot.events) && snapshot.events.length <= 1000,
    'Invalid event snapshot',
  );
  const ids = new Set();
  for (const item of snapshot.events) {
    const event = record(item);
    keys(event, ['id', 'title', 'start', 'end', 'allDay', 'location', 'url']);
    text(event.id, 500);
    text(event.title);
    assert(typeof event.allDay === 'boolean', 'Invalid all-day flag');
    assert(!ids.has(event.id), 'Duplicate occurrence ID');
    ids.add(event.id);
    assert(safeHttps(event.url), 'Invalid event destination');
    for (const key of ['start', ...(event.end !== undefined ? ['end'] : [])]) {
      assert(
        typeof event[key] === 'string' &&
          Number.isFinite(Date.parse(event[key] as string)),
        'Invalid event date',
      );
      assert(
        event.allDay
          ? /^\d{4}-\d{2}-\d{2}$/.test(event[key] as string)
          : /^\d{4}-\d{2}-\d{2}T.*Z$/.test(event[key] as string),
        'Date precision does not match event',
      );
    }
    if (event.end)
      assert(
        Date.parse(event.end as string) >= Date.parse(event.start as string),
        'Event ends before it starts',
      );
    if (event.location !== undefined) text(event.location, 500);
  }
}

export function validateRoster(value: unknown) {
  const snapshot = record(value);
  keys(snapshot, ['members']);
  assert(
    Array.isArray(snapshot.members) && snapshot.members.length <= 100,
    'Invalid roster',
  );
  const ids = new Set<string>();
  for (const value of snapshot.members) {
    const member = record(value);
    keys(member, ['id', 'name', 'role', 'photo', 'links']);
    text(member.id);
    text(member.name, 120);
    text(member.role, 120);
    assert(!ids.has(member.id as string), 'Duplicate profile ID');
    ids.add(member.id as string);
    if (member.photo !== undefined) {
      const photo = record(member.photo);
      keys(photo, ['src', 'alt']);
      assert(
        localPortrait(photo.src) || sanityPortrait(photo.src),
        'Invalid portrait path or URL',
      );
      assert(
        typeof photo.alt === 'string' &&
          photo.alt.length <= 5000 &&
          !/[\u0000-\u001f\u007f-\u009f]/.test(photo.alt),
        'Invalid portrait description',
      );
    }
    const links = member.links;
    assert(Array.isArray(links) && links.length <= 6, 'Invalid public links');
    for (const value of links) {
      const link = record(value);
      keys(link, ['label', 'url']);
      text(link.label, 60);
      assert(safeHttps(link.url), 'Public links must use HTTPS');
    }
  }
}

export function assertSanityPortraits(value: unknown) {
  validateRoster(value);
  for (const member of (value as { members: { photo?: { src: string } }[] })
    .members)
    if (member.photo)
      assert(
        sanityPortrait(member.photo.src),
        'Sanity portraits must use a published Sanity CDN URL',
      );
}
