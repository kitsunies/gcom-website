import assert from 'node:assert/strict';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createClient } from '@sanity/client';
import { createImageUrlBuilder } from '@sanity/image-url';
import { loadEnv } from 'vite';
import fixture from '../content/fixture.json';
import type { SiteContent } from '../src/site-content';
import { safeHttps } from './validate-content';

export const apiVersion = '2026-10-01';
export const snapshotFile = 'src/generated/site-content.json';
export const documentNames = Object.keys(fixture) as (keyof SiteContent)[];
export const safeLink = (value: unknown) =>
  typeof value === 'string' &&
  (safeHttps(value) ||
    /^(?:(?:about|team|contact)\/)?(?:#(?:events|quests))?$/.test(value));
const record = (value: unknown): Record<string, unknown> => {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    'Expected content object',
  );
  return value as Record<string, unknown>;
};

export function validateSiteContent(
  value: unknown,
): asserts value is SiteContent {
  const walk = (actual: unknown, expected: unknown, path: string) => {
    if (typeof expected === 'string') {
      assert(
        typeof actual === 'string' &&
          actual.length <= 5000 &&
          !/[\u0000-\u001f\u007f-\u009f]/.test(actual),
        `Invalid text: ${path}`,
      );
      assert(
        actual.trim() ||
          path.endsWith('.alt') ||
          path.endsWith('.url') ||
          path === 'settings.calendarUrl',
        `Required text: ${path}`,
      );
      if (path.endsWith('.url') || path.endsWith('Url'))
        assert(safeLink(actual), `Invalid link: ${path}`);
      if (path.endsWith('.src'))
        assert(
          /^artwork\/[A-Za-z0-9_-]+\.(png|webp|jpe?g)$/.test(actual) ||
            /^team\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(png|webp|jpe?g)$/.test(
              actual,
            ) ||
            (safeHttps(actual) &&
              new URL(actual).hostname === 'cdn.sanity.io' &&
              /^\/images\/[a-z0-9]+\/[a-z0-9_-]+\/[a-zA-Z0-9_-]+\.(png|webp|jpe?g|gif|svg)$/.test(
                new URL(actual).pathname,
              )),
          `Invalid image: ${path}`,
        );
      if (path.endsWith('.metadata.image.alt'))
        assert(actual.trim(), `Required social image description: ${path}`);
      return;
    }
    if (Array.isArray(expected)) {
      assert(
        Array.isArray(actual) && actual.length <= 100,
        `Invalid array: ${path}`,
      );
      if (path !== 'team.members' && !path.startsWith('team.members.'))
        assert(actual.length > 0, `Empty content array: ${path}`);
      if (path === 'team.members') {
        const ids = new Set<string>();
        for (const member of actual) {
          const item = record(member);
          const template = {
            id: 'id',
            name: 'name',
            role: 'role',
            links: [{ label: 'Link', url: 'https://example.test' }],
            ...(item.photo === undefined
              ? {}
              : { photo: { src: 'image', alt: '' } }),
          };
          const links = item.links;
          assert(
            Array.isArray(links) && links.length <= 6,
            'Invalid committee links',
          );
          walk(item, template, `${path}.${ids.size}`);
          assert(!ids.has(item.id as string), 'Duplicate committee ID');
          ids.add(item.id as string);
          for (const link of links)
            assert(
              safeHttps(record(link).url),
              'Committee links must use HTTPS',
            );
        }
      } else for (const item of actual) walk(item, expected[0], `${path}[]`);
      return;
    }
    assert(
      actual && typeof actual === 'object' && !Array.isArray(actual),
      `Missing required object: ${path}`,
    );
    const object = record(actual),
      shape = record(expected);
    assert.deepEqual(
      Object.keys(object).sort(),
      Object.keys(shape).sort(),
      `Unexpected or missing fields: ${path}`,
    );
    for (const [key, template] of Object.entries(shape))
      walk(object[key], template, path ? `${path}.${key}` : key);
  };
  walk(value, fixture, '');
  const content = value as SiteContent;
  assert(
    content.home.hero.heading.length === 2,
    'Hero requires two title lines',
  );
  assert(content.home.quests.length === 3, 'Home requires three quest cards');
  assert(
    safeHttps(content.settings.membershipUrl),
    'Membership must use HTTPS',
  );
  assert(
    [
      content.navigation.footer.instagram,
      content.navigation.footer.discord,
    ].every((link) => safeHttps(link.url)),
    'Footer social links must use HTTPS',
  );
  assert(
    !content.settings.calendarUrl || safeHttps(content.settings.calendarUrl),
    'Calendar must use HTTPS',
  );
  assert(
    content.settings.contactEmail.length <= 254 &&
      /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
        content.settings.contactEmail,
      ),
    'Invalid public email',
  );
  const keys = content.navigation.links.map((link) => link.key);
  assert(
    keys.every((key) =>
      ['home', 'events', 'about', 'team', 'contact'].includes(key),
    ) && new Set(keys).size === keys.length,
    'Invalid navigation identities',
  );
  assert(
    content.home.quests.every((quest) =>
      ['purple', 'green', 'yellow'].includes(quest.theme),
    ),
    'Invalid quest style',
  );
  assert(
    new Set(content.home.quests.map((quest) => quest.name)).size ===
      content.home.quests.length,
    'Duplicate quest names',
  );
}

const projection = (value: unknown, path = ''): string => {
  if (Array.isArray(value)) {
    if (path === 'team.members')
      return '[]{"id":coalesce(id,_key),name,role,defined(photo.asset)=>{photo{"src":asset->url,"alt":coalesce(alt,"")}},"links":coalesce(links[]{label,url},[])}';
    return typeof value[0] === 'string'
      ? ''
      : `[]{${projection(value[0], path)}}`;
  }
  if (!value || typeof value !== 'object') return '';
  if ('src' in value) return '"src":asset->url,"alt":coalesce(alt,"")';
  return Object.entries(value)
    .map(([key, item]) => {
      const next = path ? `${path}.${key}` : key;
      const body = projection(item, next);
      if (key === 'url' || next === 'settings.calendarUrl')
        return `"${key}":coalesce(${key},"")`;
      return `${key}${Array.isArray(item) ? body : typeof item === 'object' ? `{${body}}` : ''}`;
    })
    .join(',');
};
export const siteQuery = `{${documentNames.map((name) => `"${name}":*[_id=="${name}" && _type=="${name}"][0]{${projection(fixture[name], name)}}`).join(',')}}`;

export async function writeSnapshot(content: unknown, file = snapshotFile) {
  validateSiteContent(content);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, `${JSON.stringify(content, null, 2)}\n`);
  await rename(`${file}.tmp`, file);
}

export async function fetchSiteContent(
  env: Record<string, string | undefined>,
) {
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
  const content: unknown = await client.fetch(siteQuery);
  validateSiteContent(content);
  const builder = createImageUrlBuilder(client);
  const resize = (value: unknown, path = '') => {
    if (Array.isArray(value)) {
      value.forEach((item) => resize(item, path));
      return;
    }
    if (!value || typeof value !== 'object') return;
    if ('src' in value && typeof value.src === 'string') {
      const width = path.includes('metadata')
        ? 1200
        : path.includes('photo')
          ? 800
          : path.includes('logo')
            ? 112
            : path.includes('artwork.hero')
              ? 1080
              : path === 'about.image'
                ? 256
                : path === 'contact.image'
                  ? 384
                  : path === 'team.image'
                    ? 192
                    : 512;
      value.src = builder
        .image(value.src)
        .width(width)
        .fit('max')
        .auto('format')
        .url();
    } else
      for (const [key, item] of Object.entries(value))
        resize(item, path ? `${path}.${key}` : key);
  };
  resize(content);
  return content;
}

if (process.argv[1]?.endsWith('site-content.ts')) {
  const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
  try {
    const source = env.CONTENT_SOURCE || 'fixture';
    assert(
      ['sanity', 'fixture'].includes(source),
      'CONTENT_SOURCE must be sanity or fixture',
    );
    assert(
      !(env.CI && source === 'fixture'),
      'CI builds require Sanity published content',
    );
    await writeSnapshot(
      source === 'fixture' ? fixture : await fetchSiteContent(env),
    );
    console.log(`Validated website snapshot from ${source}.`);
  } catch (error) {
    // SDK errors can contain request configuration; never print credentials.
    console.error(
      error instanceof assert.AssertionError
        ? error.message
        : 'CMS snapshot failed. Check Sanity access and published content; the previous snapshot is unchanged.',
    );
    process.exitCode = 1;
  }
}
