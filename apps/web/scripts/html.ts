import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { validateEvents, safeHttps } from './validate-content';
import { settings } from '../src/content';
import { pageMetadata } from './page-metadata';
import { pageHtml, pagePaths } from './page-metadata';
import { loadEnv } from 'vite';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
validateEvents(JSON.parse(await readFile('public/data/events.json', 'utf8')));
const checkMedia = async (value: unknown): Promise<void> => {
  if (!value || typeof value !== 'object') return;
  if ('src' in value && typeof value.src === 'string' && !safeHttps(value.src))
    await stat(`public/${value.src}`);
  else await Promise.all(Object.values(value).map(checkMedia));
};
await checkMedia({ ...settings, metadata: pageMetadata });
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
const origin = new URL(env.SITE_ORIGIN || 'https://gcom.techtom.tech');
if (
  origin.protocol !== 'https:' ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash
)
  throw new Error('SITE_ORIGIN must be an HTTPS origin');
const base = env.SITE_BASE || '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))
  throw new Error('SITE_BASE must be an absolute directory path ending in /');
for (const [page, path] of Object.entries(pagePaths)) {
  if (path) await mkdir(path, { recursive: true });
  await writeFile(
    `${path}index.html`,
    pageHtml(page as keyof typeof pagePaths, origin, base),
  );
}
