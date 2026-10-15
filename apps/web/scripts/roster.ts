import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@sanity/client';
import { createImageUrlBuilder } from '@sanity/image-url';
import { loadEnv } from 'vite';
import type { TeamMember } from '../src/site-content';
import fixture from '../content/roster.fixture.json';
import { assertSanityPortraits, validateRoster } from './validate-content';

export const rosterSnapshotFile = 'src/generated/roster.json';
export const rosterSourceFile = 'src/generated/roster-source.json';
const apiVersion = '2026-10-01';
export const rosterQuery = `*[_id == "roster" && _type == "roster"][0]{"members": members[]{_key, name, role, ...select(defined(photo)=>{"photo":{"src": photo.asset->url, "alt": coalesce(photo.alt, "")}}), "links": coalesce(links[]{label, url}, [])}}`;

export async function writeSnapshot(
  value: unknown,
  file = rosterSnapshotFile,
  provenance: {
    source: 'fixture' | 'sanity';
    projectId?: string;
    dataset?: string;
  } = { source: 'fixture' },
  provenanceFile = file === rosterSnapshotFile ? rosterSourceFile : undefined,
) {
  validateRoster(value);
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  const provenanceTemporary =
    provenanceFile && `${provenanceFile}.${process.pid}.tmp`;
  let wroteSnapshot = false;
  let wroteProvenance = false;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: 'wx',
    });
    wroteSnapshot = true;
    if (provenanceFile) {
      const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
      const details = {
        ...provenance,
        projectId: provenance.projectId ?? null,
        dataset: provenance.dataset ?? null,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
      await mkdir(dirname(provenanceFile), { recursive: true });
      await writeFile(
        provenanceTemporary!,
        `${JSON.stringify(details, null, 2)}\n`,
        { flag: 'wx' },
      );
      wroteProvenance = true;
      await rename(provenanceTemporary!, provenanceFile);
    }
    await rename(temporary, file);
  } catch (error) {
    if (wroteSnapshot) await rm(temporary, { force: true });
    if (wroteProvenance && provenanceTemporary)
      await rm(provenanceTemporary, { force: true });
    throw error;
  }
}

export async function assertSnapshot(
  env: Record<string, string | undefined>,
  file = rosterSnapshotFile,
  provenanceFile = rosterSourceFile,
) {
  const source = JSON.parse(await readFile(provenanceFile, 'utf8'));
  const bytes = await readFile(file);
  assert(
    source.sha256 === createHash('sha256').update(bytes).digest('hex'),
    'Roster snapshot changed after Sanity validation',
  );
  validateRoster(JSON.parse(bytes.toString('utf8')));
}

export async function assertSanitySnapshot(
  env: Record<string, string | undefined>,
  file = rosterSnapshotFile,
  provenanceFile = rosterSourceFile,
) {
  await assertSnapshot(env, file, provenanceFile);
  const source = JSON.parse(await readFile(provenanceFile, 'utf8'));
  assert(source.source === 'sanity', 'Release roster must come from Sanity');
  assert(
    source.projectId === env.SANITY_PROJECT_ID,
    'Roster project does not match release environment',
  );
  assert(
    source.dataset === env.SANITY_DATASET,
    'Roster dataset does not match release environment',
  );
}

export async function assertConfiguredSnapshot(
  env: Record<string, string | undefined>,
  file = rosterSnapshotFile,
  provenanceFile = rosterSourceFile,
) {
  const source = env.ROSTER_SOURCE || 'fixture';
  assert(
    source === 'fixture' || source === 'sanity',
    'ROSTER_SOURCE must be fixture or sanity',
  );
  if (source === 'sanity' || env.RELEASE_BUILD)
    return assertSanitySnapshot(env, file, provenanceFile);
  await assertSnapshot(env, file, provenanceFile);
  const provenance = JSON.parse(await readFile(provenanceFile, 'utf8'));
  assert(
    provenance.source === 'fixture',
    'Fixture builds require fixture roster content',
  );
}

export async function fetchRoster(env: Record<string, string | undefined>) {
  assert(
    env.SANITY_PROJECT_ID && /^[a-z0-9]+$/.test(env.SANITY_PROJECT_ID),
    'Set SANITY_PROJECT_ID',
  );
  assert(
    env.SANITY_DATASET && /^[a-z0-9][a-z0-9_-]*$/.test(env.SANITY_DATASET),
    'Set SANITY_DATASET',
  );
  const client = createClient({
    projectId: env.SANITY_PROJECT_ID,
    dataset: env.SANITY_DATASET,
    apiVersion,
    useCdn: false,
    perspective: 'published',
    token: env.SANITY_READ_TOKEN,
    timeout: 30000,
    maxRetries: 2,
  });
  const value: unknown = await client.fetch(rosterQuery);
  assertSanityPortraits(value);
  const builder = createImageUrlBuilder(client);
  for (const member of (value as { members: TeamMember[] }).members)
    if (member.photo)
      member.photo.src = builder
        .image(member.photo.src)
        .width(800)
        .fit('max')
        .auto('format')
        .url();
  validateRoster(value);
  return value;
}

async function main() {
  const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
  const requestedSource = env.ROSTER_SOURCE || 'fixture';
  assert(
    ['fixture', 'sanity'].includes(requestedSource),
    'ROSTER_SOURCE must be fixture or sanity',
  );
  const source = requestedSource as 'fixture' | 'sanity';
  if (env.RELEASE_BUILD)
    assert(source === 'sanity', 'Release builds require Sanity roster content');
  if (
    process.argv.includes('--check') ||
    process.argv.includes('--check-release')
  ) {
    if (process.argv.includes('--check-release'))
      await assertSanitySnapshot(env);
    else await assertConfiguredSnapshot(env);
    return;
  }
  const value = source === 'fixture' ? fixture : await fetchRoster(env);
  await writeSnapshot(value, rosterSnapshotFile, {
    source,
    ...(source === 'sanity'
      ? { projectId: env.SANITY_PROJECT_ID, dataset: env.SANITY_DATASET }
      : {}),
  });
  console.log(`Validated roster snapshot from ${source}.`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(
      error instanceof assert.AssertionError
        ? error.message
        : 'Roster snapshot failed. Check Sanity access; the previous snapshot is unchanged.',
    );
    process.exitCode = 1;
  });
