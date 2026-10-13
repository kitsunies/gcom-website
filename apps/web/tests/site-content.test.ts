import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fixture from '../content/fixture.json';
import {
  validateSiteContent,
  writeSnapshot,
  siteQuery,
  safeLink,
  fetchSiteContent,
} from '../scripts/site-content';

test('complete fixture passes; missing fields, documents and private fields fail', () => {
  validateSiteContent(fixture);
  for (const key of Object.keys(fixture)) {
    const copy = structuredClone(fixture) as Record<string, unknown>;
    delete copy[key];
    assert.throws(() => validateSiteContent(copy));
  }
  for (const mutate of [
    (c: any) => delete c.contact.form.failed,
    (c: any) => (c.settings.token = 'private'),
    (c: any) => (c.home.quests[0].theme = 'injected'),
    (c: any) => (c.about.image.src = '../../secret'),
    (c: any) =>
      (c.team.members = [
        {
          id: 'x',
          name: 'Name',
          role: 'Role',
          links: [],
          email: 'private@example.test',
        },
      ]),
    (c: any) => (c.home.metadata.image.alt = ''),
    (c: any) => (c.settings.calendarUrl = 'javascript:alert(1)'),
    (c: any) => c.navigation.links.push(c.navigation.links[0]),
  ]) {
    const copy = structuredClone(fixture);
    mutate(copy);
    assert.throws(() => validateSiteContent(copy));
  }
});
test('links and ordered committee handle optional portraits without unsafe destinations', () => {
  for (const url of [
    '',
    'about/',
    '#events',
    'team/#quests',
    'https://example.test/path',
  ])
    assert(safeLink(url));
  for (const url of [
    '//evil.test',
    '/about/',
    '../secret',
    'javascript:alert(1)',
    'https://user:pass@example.test',
    'contact/?bad',
  ])
    assert(!safeLink(url));
  const content: any = structuredClone(fixture);
  content.team.members = [
    { id: 'two', name: 'Second', role: 'Role', links: [] },
    {
      id: 'one',
      name: 'First',
      role: 'Role',
      photo: {
        src: 'https://cdn.sanity.io/images/abc/staging/hash-400x400.webp',
        alt: 'Portrait',
      },
      links: [{ label: 'Website', url: 'https://example.test' }],
    },
  ];
  validateSiteContent(content);
  assert.equal(content.team.members[0].id, 'two');
  content.team.members.push(content.team.members[0]);
  assert.throws(() => validateSiteContent(content));
});
test('snapshot replacement is atomic and invalid content preserves last valid bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcom-content-'));
  const file = join(dir, 'snapshot.json');
  try {
    await writeSnapshot(fixture, file);
    const before = await readFile(file, 'utf8');
    await assert.rejects(writeSnapshot({ home: null }, file));
    assert.equal(await readFile(file, 'utf8'), before);
  } finally {
    await rm(dir, { recursive: true });
  }
});
test('query requires fixed published identities and never projects private fields', async () => {
  for (const key of Object.keys(fixture))
    assert(siteQuery.includes(`_id=="${key}" && _type=="${key}"`));
  assert(!siteQuery.includes('...'));
  assert(!siteQuery.includes('drafts.'));
  assert(siteQuery.includes('asset->url'));
  await assert.rejects(fetchSiteContent({}), /SANITY_PROJECT_ID/);
});
