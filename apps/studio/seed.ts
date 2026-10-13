import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiVersion } from './environment';
import { singletonTypes } from './singletons';
import { validateRoster } from '../web/scripts/validate-content';
import { validateSiteContent } from '../web/scripts/site-content';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../web');
type SeedDocument = Record<string, unknown> & { _id: string; _type: string };
export type SeedClient = {
  getDocuments(ids: string[]): Promise<(Record<string, unknown> | null)[]>;
  assets: {
    upload(
      type: 'image',
      data: Buffer,
      options: { filename: string },
    ): Promise<{ _id: string }>;
  };
  createIfNotExists(document: SeedDocument): Promise<unknown>;
};

export async function seedContent(
  client: SeedClient,
  options: { dataset: string },
) {
  assert(
    options.dataset && options.dataset.toLowerCase() !== 'production',
    'Seed refuses the production dataset. Choose an explicit non-production dataset.',
  );
  const fixture = JSON.parse(
    await readFile(join(root, 'content/fixture.json'), 'utf8'),
  );
  const roster = JSON.parse(
    await readFile(join(root, 'public/data/team.json'), 'utf8'),
  );
  validateRoster(roster);
  fixture.team.members = roster.members.map(
    (member: {
      id: string;
      name: string;
      role: string;
      photo?: string;
      links?: unknown[];
    }) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      ...(member.photo
        ? { photo: { src: member.photo, alt: member.name } }
        : {}),
      links: member.links ?? [],
    }),
  );

  validateSiteContent(fixture);

  const publishedAndDrafts = await client.getDocuments(
    singletonTypes.flatMap((id) => [id, `drafts.${id}`]),
  );
  const existing = new Set(
    publishedAndDrafts
      .filter((document) => document !== null)
      .map((document) => document._id),
  );
  const publicRoot = await realpath(join(root, 'public'));
  const assets = new Map<string, string>();
  const created: string[] = [];
  const skipped: string[] = [];

  const objectTypes: Record<string, string> = {
    brand: 'brand',
    artwork: 'artwork',
    metadata: 'metadata',
    intro: 'intro',
    hero: 'hero',
    footer: 'footer',
    invitation: 'invitation',
    motion: 'motion',
    events: 'events',
    explore: 'action',
    action: 'action',
    sidebar: 'sidebar',
    form: 'contactForm',
  };
  const arrayTypes: Record<string, string> = {
    quests: 'quest',
    sections: 'paragraph',
    activities: 'activity',
    members: 'member',
    links: 'publicLink',
  };
  async function convert(
    value: unknown,
    name = '',
    parent = '',
  ): Promise<unknown> {
    if (Array.isArray(value)) {
      const converted = [];
      for (const [index, entry] of value.entries()) {
        const item = await convert(entry);
        const type =
          parent === 'navigation' && name === 'links'
            ? 'navigationLink'
            : arrayTypes[name];
        converted.push(
          item && typeof item === 'object'
            ? { ...item, _type: type, _key: `item-${index}` }
            : item,
        );
      }
      return converted;
    }
    if (value && typeof value === 'object') {
      const item = value as Record<string, unknown>;
      if (typeof item.src === 'string' && typeof item.alt === 'string') {
        assert(
          /^(?:artwork\/[A-Za-z0-9_-]+\.(?:png|webp|jpe?g)|team\/[A-Za-z0-9_-]+\/[A-Za-z0-9][A-Za-z0-9_-]*\.(?:png|webp|jpe?g))$/.test(
            item.src,
          ),
          `Unapproved local image path: ${item.src}`,
        );
        if (!assets.has(item.src)) {
          const path = await realpath(join(publicRoot, item.src));
          const local = relative(publicRoot, path);
          assert(
            local &&
              local !== '..' &&
              !local.startsWith(`..${sep}`) &&
              !local.startsWith(sep),
            `Image must stay inside public/: ${item.src}`,
          );
          const asset = await client.assets.upload(
            'image',
            await readFile(path),
            { filename: basename(path) },
          );
          assets.set(item.src, asset._id);
        }
        return {
          _type:
            name === 'photo'
              ? 'portraitImage'
              : parent === 'metadata'
                ? 'socialImage'
                : 'siteImage',
          asset: { _type: 'reference', _ref: assets.get(item.src) },
          alt: item.alt,
        };
      }
      const result: Record<string, unknown> = objectTypes[name]
        ? { _type: objectTypes[name] }
        : {};
      for (const [key, entry] of Object.entries(item))
        result[key] = await convert(entry, key, name);
      return result;
    }
    return value;
  }

  for (const id of singletonTypes) {
    if (existing.has(id) || existing.has(`drafts.${id}`)) {
      skipped.push(id);
      continue;
    }
    const content = (await convert(fixture[id], id)) as Record<string, unknown>;
    await client.createIfNotExists({ ...content, _id: id, _type: id });
    created.push(id);
  }
  return { created, skipped };
}

async function main() {
  const projectId = process.env.SANITY_PROJECT_ID?.trim();
  const dataset = process.env.SANITY_DATASET?.trim();
  assert(
    projectId && /^[a-z0-9]+$/.test(projectId),
    'Set SANITY_PROJECT_ID to your Sanity project ID.',
  );
  assert(
    dataset && /^[a-z0-9][a-z0-9_-]*$/.test(dataset),
    'Set SANITY_DATASET explicitly to a non-production dataset.',
  );
  assert(
    dataset.toLowerCase() !== 'production',
    'Seed refuses the production dataset.',
  );
  const token = process.env.SANITY_WRITE_TOKEN?.trim();
  assert(
    token,
    'Set SANITY_WRITE_TOKEN to a token with write access to the chosen non-production dataset.',
  );
  // Use the website's pinned client for seeding.
  const { createClient } = createRequire(join(root, 'package.json'))(
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
  console.log(await seedContent(client, { dataset }));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      error instanceof assert.AssertionError ||
        (error instanceof Error && error.message.startsWith('Set SANITY_'))
        ? error.message
        : 'Seed failed. Check dataset access and approved local assets. Existing documents were not replaced.',
    );
    process.exitCode = 1;
  });
}
