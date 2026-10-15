import { readFile, rename, writeFile } from 'node:fs/promises';
import { importCalendar } from './events';
import { safeHttps, validateEvents } from './validate-content';
import { loadEnv } from 'vite';
import { calendar } from '../src/content';

export async function syncEvents(
  feed: string,
  destination: string,
  file = 'public/data/events.json',
  fetcher: typeof fetch = fetch,
) {
  validateEvents(JSON.parse(await readFile(file, 'utf8')));
  if (!safeHttps(feed))
    throw new Error('Feed must be an HTTPS calendar subscription URL');
  const response = await fetcher(feed, { signal: AbortSignal.timeout(30000) });
  if (!response.ok)
    throw new Error(`Calendar request returned ${response.status}`);
  if (!safeHttps(response.url || feed))
    throw new Error('Calendar redirected to an unsafe URL');
  if (Number(response.headers.get('content-length')) > 2 * 1024 * 1024)
    throw new Error('Calendar is too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Calendar response has no body');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 2 * 1024 * 1024) {
      await reader.cancel();
      throw new Error('Calendar is too large');
    }
    chunks.push(value);
  }
  const snapshot = importCalendar(
    Buffer.concat(chunks).toString('utf8'),
    destination,
  );
  await writeFile(`${file}.tmp`, `${JSON.stringify(snapshot, null, 2)}\n`);
  await rename(`${file}.tmp`, file);
  return snapshot.events.length;
}
if (process.argv[1]?.endsWith('import-events.ts')) {
  const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
  if (!env.LUMA_ICAL_URL)
    console.log('Calendar feed is unset; retaining the current snapshot.');
  else {
    try {
      console.log(
        `Imported ${await syncEvents(env.LUMA_ICAL_URL, calendar)} occurrences.`,
      );
    } catch (error) {
      console.error(
        `Calendar sync failed; the last valid snapshot is unchanged. ${error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[URL]') : 'Import error'}`,
      );
      process.exitCode = 1;
    }
  }
}
