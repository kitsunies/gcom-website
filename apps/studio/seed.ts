import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiVersion } from './environment';

type SeedDocument = { _id: string; _type: 'roster'; members: [] };
export type SeedClient = {
  getDocuments(ids: string[]): Promise<(Record<string, unknown> | null)[]>;
  createIfNotExists(document: SeedDocument): Promise<unknown>;
};

export async function seedRoster(
  client: SeedClient,
  options: { dataset: string },
) {
  assert(
    options.dataset && options.dataset.toLowerCase() !== 'production',
    'Seed refuses the production dataset. Choose an explicit non-production dataset.',
  );
  const [published, draft] = await client.getDocuments([
    'roster',
    'drafts.roster',
  ]);
  if (published || draft) return { created: [], skipped: ['roster'] };
  await client.createIfNotExists({
    _id: 'roster',
    _type: 'roster',
    members: [],
  });
  return { created: ['roster'], skipped: [] };
}

async function main() {
  const projectId = process.env.SANITY_PROJECT_ID?.trim();
  const dataset = process.env.SANITY_DATASET?.trim();
  assert(projectId && /^[a-z0-9]+$/.test(projectId), 'Set SANITY_PROJECT_ID.');
  assert(
    dataset && /^[a-z0-9][a-z0-9_-]*$/.test(dataset),
    'Set SANITY_DATASET.',
  );
  assert(
    dataset.toLowerCase() !== 'production',
    'Seed refuses the production dataset.',
  );
  const token = process.env.SANITY_WRITE_TOKEN?.trim();
  assert(token, 'Set SANITY_WRITE_TOKEN to seed a non-production dataset.');
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
  console.log(await seedRoster(client, { dataset }));
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
        : 'Roster seed failed. Existing documents were not replaced.',
    );
    process.exitCode = 1;
  });
