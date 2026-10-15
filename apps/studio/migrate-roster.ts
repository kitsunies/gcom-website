import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiVersion } from './environment';

type RawDocument = {
  _id: string;
  _type: string;
  _rev: string;
  members?: unknown;
};
type MigrationClient = {
  getDocuments(ids: string[]): Promise<(RawDocument | null)[]>;
  create(document: Record<string, unknown>): Promise<RawDocument>;
};

export function migrationOptions(dataset: string, args: string[]) {
  const productionAuthorized = args.includes('--allow-production');
  const revisionIndex = args.indexOf('--expected-source-revision');
  const expectedSourceRevision =
    revisionIndex < 0 ? undefined : args[revisionIndex + 1]?.trim();
  if (revisionIndex >= 0)
    assert(
      expectedSourceRevision && !expectedSourceRevision.startsWith('--'),
      'Set a value after --expected-source-revision.',
    );
  if (dataset.toLowerCase() === 'production')
    assert(
      productionAuthorized && expectedSourceRevision,
      'Production migration requires --allow-production and --expected-source-revision.',
    );
  return { expectedSourceRevision };
}

export async function migrateRoster(
  client: MigrationClient,
  options: { expectedSourceRevision?: string } = {},
) {
  const ids = ['team', 'drafts.team', 'roster', 'drafts.roster'];
  const [source, sourceDraft, target, targetDraft] =
    await client.getDocuments(ids);
  assert(
    source && source._type === 'team' && source._rev,
    'Published legacy team document is missing or malformed',
  );
  if (options.expectedSourceRevision !== undefined)
    assert(
      source._rev === options.expectedSourceRevision,
      'Legacy team source revision does not match the expected revision',
    );
  assert(
    Array.isArray(source.members) && source.members.length <= 100,
    'Published legacy team members are malformed',
  );
  assert(!sourceDraft, 'Legacy team has an unpublished draft');
  assert(!targetDraft, 'Roster has an unpublished draft');
  if (target) {
    assert(
      target._type === 'roster' &&
        isDeepStrictEqual(target.members, source.members),
      'Existing roster conflicts with legacy team members',
    );
    return { migrated: false, reason: 'identical target already exists' };
  }
  const members = source.members;
  const created = await client.create({
    _id: 'roster',
    _type: 'roster',
    members,
  });
  const [
    verifiedSource,
    verifiedSourceDraft,
    verifiedTarget,
    verifiedTargetDraft,
  ] = await client.getDocuments(ids);
  assert(
    verifiedSource &&
      verifiedSource._type === 'team' &&
      verifiedSource._rev === source._rev &&
      isDeepStrictEqual(verifiedSource.members, members),
    'Legacy team changed during roster migration; the created roster is retained for inspection',
  );
  assert(
    !verifiedSourceDraft,
    'Legacy team gained an unpublished draft during roster migration',
  );
  assert(
    !verifiedTargetDraft,
    'Roster gained an unpublished draft during roster migration',
  );
  assert(
    verifiedTarget &&
      verifiedTarget._type === 'roster' &&
      verifiedTarget._rev === created._rev &&
      isDeepStrictEqual(verifiedTarget.members, members),
    'Roster changed during migration; the created roster is retained for inspection',
  );
  return { migrated: true };
}

async function main() {
  const projectId = process.env.SANITY_PROJECT_ID?.trim();
  const dataset = process.env.SANITY_DATASET?.trim();
  assert(projectId && /^[a-z0-9]+$/.test(projectId), 'Set SANITY_PROJECT_ID.');
  assert(
    dataset && /^[a-z0-9][a-z0-9_-]*$/.test(dataset),
    'Set SANITY_DATASET.',
  );
  const { expectedSourceRevision } = migrationOptions(
    dataset,
    process.argv.slice(2),
  );
  const token = process.env.SANITY_WRITE_TOKEN?.trim();
  assert(token, 'Set SANITY_WRITE_TOKEN to migrate the chosen dataset.');
  const root = resolve(
    fileURLToPath(new URL('../web/package.json', import.meta.url)),
    '..',
  );
  const { createClient } = createRequire(resolve(root, 'package.json'))(
    '@sanity/client',
  );
  const client = createClient({
    projectId,
    dataset,
    token,
    apiVersion,
    useCdn: false,
    perspective: 'raw',
  });
  console.log(await migrateRoster(client, { expectedSourceRevision }));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(
      error instanceof assert.AssertionError ||
        (error instanceof Error && error.message.startsWith('Set '))
        ? error.message
        : 'Roster migration failed; a successfully created roster is retained for inspection.',
    );
    process.exitCode = 1;
  });
