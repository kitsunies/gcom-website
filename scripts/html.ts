import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { validateRoster, validateEvents, safeHttps } from './validate-content';
import { loadEnv } from 'vite';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };

const roster = JSON.parse(await readFile('public/data/team.json', 'utf8'));
validateRoster(roster);
validateEvents(JSON.parse(await readFile('public/data/events.json', 'utf8')));
for (const member of roster.members)
  if (member.photo) await stat(`public/${member.photo}`);
if (env.VITE_CALENDAR_URL && !safeHttps(env.VITE_CALENDAR_URL))
  throw new Error('Calendar destination must use HTTPS');
if (
  env.VITE_CONTACT_EMAIL &&
  !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
    env.VITE_CONTACT_EMAIL,
  )
)
  throw new Error('Invalid configured contact email');
if (env.VITE_CONTACT_ENDPOINT) {
  const endpoint = new URL(env.VITE_CONTACT_ENDPOINT);
  const [first, second] = endpoint.hostname.split('.').map(Number);
  const preview =
    endpoint.protocol === 'http:' &&
    (endpoint.hostname === 'localhost' ||
      endpoint.hostname === '127.0.0.1' ||
      (first === 100 && second >= 64 && second <= 127));
  if (
    endpoint.username ||
    endpoint.password ||
    (!safeHttps(env.VITE_CONTACT_ENDPOINT) && !preview)
  )
    throw new Error(
      'Contact endpoint must use HTTPS, or a local/tailnet preview origin',
    );
}

export const pageMetadata = {
  home: [
    '',
    'GCOM | Make games. Make friends.',
    'Find your people and bring wild ideas to life with GCOM, the Monash University game development club.',
  ],
  about: [
    'about/',
    'About Us | GCOM',
    'Explore GCOM, a community for creating games, learning together and finding collaborators at Monash University.',
  ],
  team: [
    'team/',
    'Meet the Team | GCOM',
    'Meet the committee behind GCOM, the Monash University game development club.',
  ],
  contact: [
    'contact/',
    'Contact | GCOM',
    'Get in touch with the GCOM committee about game development, club activities and collaboration.',
  ],
};
export const origin = new URL(env.SITE_ORIGIN || 'https://gcom.techtom.tech');
if (
  origin.protocol !== 'https:' ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/'
)
  throw new Error('SITE_ORIGIN must be an HTTPS origin');
export const base = env.SITE_BASE || '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))
  throw new Error('SITE_BASE must be an absolute directory path ending in /');
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
for (const [page, [path, title, description]] of Object.entries(pageMetadata)) {
  if (path) await mkdir(path, { recursive: true });
  const canonical = new URL(`${base}${path}`, origin).href;
  const social = new URL(`${base}artwork/banner.png`, origin).href;
  const html = `<!doctype html>
<html lang="en-AU"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#1c1c1c" />
<title>${escape(title)}</title><meta name="description" content="${escape(description)}" /><link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="GCOM" /><meta property="og:title" content="${escape(title)}" /><meta property="og:description" content="${escape(description)}" /><meta property="og:url" content="${canonical}" /><meta property="og:image" content="${social}" /><meta property="og:image:alt" content="GCOM game development club" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${escape(title)}" /><meta name="twitter:description" content="${escape(description)}" /><meta name="twitter:image" content="${social}" />
<link rel="icon" type="image/png" href="${base}artwork/logo-original.png" />
</head><body data-page="${page}"><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`;
  await writeFile(`${path}index.html`, html);
}
