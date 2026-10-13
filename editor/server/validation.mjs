import { createHash } from 'node:crypto';
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function normalizeEmails(value) {
  if (!Array.isArray(value) || !value.every(x => typeof x === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.trim()))) fail('Invalid committee allowlist.', 503);
  return new Set(value.map(x => x.trim().toLowerCase()));
}
export function authorized(record, emails) {
  return record?.collectionName === 'committee_users' && record.verified === true && typeof record.email === 'string' && emails.has(record.email.trim().toLowerCase());
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x1f\x7f]/.test(value)) fail(`Invalid ${label}.`);
  return value.trim();
}
export function links(value = []) {
  if (!Array.isArray(value) || value.length > 5) fail('Use at most five social links.');
  return value.map(link => {
    const label = text(link?.label, 40, 'link label');
    const raw = text(link?.url, 500, 'link URL');
    let url; try { url = new URL(raw); } catch { fail('Social links need a valid HTTPS URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || /\s/.test(raw)) fail('Social links need a valid HTTPS URL without credentials.');
    return { label, url: url.href };
  });
}
export const photoPattern = /^[a-f0-9]{64}\.webp$/;
export function profile(value) {
  if (!value || typeof value !== 'object') fail('Invalid profile.');
  if (!Number.isInteger(value.position) || value.position < 0 || value.position > 1000) fail('Invalid roster position.');
  const result = {name:text(value.name, 80, 'name'), role:text(value.role, 100, 'role'), links:links(value.links), position:value.position, photo:value.photo || ''};
  if (typeof result.photo !== 'string' || (result.photo && !photoPattern.test(result.photo))) fail('Invalid portrait.');
  return result;
}
export function roster(records, revision, publishedAt) {
  if (!/^[a-f0-9]{32}$/.test(revision) || !Number.isFinite(Date.parse(publishedAt)) || records.length > 100) fail('Invalid revision.');
  const seen = new Set();
  const members = [...records].sort((a,b) => a.position - b.position || a.id.localeCompare(b.id)).map(record => {
    if (typeof record.id !== 'string' || !/^[a-z0-9]{15}$/.test(record.id) || seen.has(record.id)) fail('Invalid member ID.');
    seen.add(record.id);
    const p = profile(record);
    const member = {id:record.id, name:p.name, role:p.role};
    if (p.photo) member.photo = `team/${revision}/${p.photo}`;
    if (p.links.length) member.links = p.links;
    return member;
  });
  return { revision, publishedAt, members };
}
export const draftHash = records => createHash('sha256').update(JSON.stringify([...records].sort((a,b) => a.id.localeCompare(b.id)))).digest('hex');
