import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assertSanitySnapshot } from './roster';
import { validateEvents, safeHttps } from './validate-content';

type Environment = Record<string, string | undefined>;
const run = promisify(execFile);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export async function deploymentState(root: string, env: Environment) {
  const web = join(root, 'apps/web');
  const rosterFile = join(web, 'src/generated/roster.json');
  await assertSanitySnapshot(
    env,
    rosterFile,
    join(web, 'src/generated/roster-source.json'),
  );
  const roster: unknown = JSON.parse(await readFile(rosterFile, 'utf8'));
  const eventsFile = 'apps/web/public/data/events.json';
  const events = JSON.parse(await readFile(join(root, eventsFile), 'utf8'));
  validateEvents(events);
  const { stdout } = await run('git', [
    '-C',
    root,
    'ls-files',
    '-z',
    '--',
    'apps/web',
    'package.json',
    'package-lock.json',
    'apps/*/package.json',
    '.github/workflows',
    '.npmrc',
    '.nvmrc',
    '.node-version',
  ]);
  const files = [];
  for (const file of stdout.split('\0').filter(Boolean).sort()) {
    if (file === eventsFile) continue;
    files.push([
      file,
      createHash('sha256')
        .update(await readFile(join(root, file)))
        .digest('hex'),
    ]);
  }
  const settings = Object.fromEntries(
    [
      'SITE_ORIGIN',
      'SITE_BASE',
      'VITE_CONTACT_ENDPOINT',
      'SANITY_PROJECT_ID',
      'SANITY_DATASET',
    ].map((key) => [key, env[key] || '']),
  );
  return {
    version: 1,
    fingerprint: createHash('sha256')
      .update(canonical({ files, settings, roster, events: events.events }))
      .digest('hex'),
  };
}

export async function deployedFingerprint(
  env: Environment,
  fetcher: typeof fetch = fetch,
) {
  try {
    if (
      !safeHttps(env.SITE_ORIGIN) ||
      !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(env.SITE_BASE || '/')
    )
      return null;
    const url = new URL(
      `${env.SITE_BASE || '/'}deployment-state.json`,
      env.SITE_ORIGIN,
    );
    url.searchParams.set('refresh', String(Date.now()));
    const response = await fetcher(url, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const state = await response.json();
    if (
      state &&
      Object.keys(state).sort().join(',') === 'fingerprint,version' &&
      state.version === 1 &&
      typeof state.fingerprint === 'string' &&
      /^[a-f0-9]{64}$/.test(state.fingerprint)
    )
      return state.fingerprint as string;
  } catch {
    // An unavailable baseline must never suppress a checked release.
  }
  return null;
}

async function main() {
  const state = await deploymentState(resolve('../..'), process.env);
  const previous = await deployedFingerprint(process.env);
  const changed = previous !== state.fingerprint;
  await writeFile(
    'src/generated/deployment-state.json',
    `${JSON.stringify(state)}\n`,
  );
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  console.log(
    changed
      ? 'Release inputs changed or deployed state is unavailable.'
      : 'Release inputs match the live deployment; skipping refresh publication.',
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
