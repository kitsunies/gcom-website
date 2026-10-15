import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fixture from '../content/roster.fixture.json';
import {
  assertConfiguredSnapshot,
  assertSanitySnapshot,
  fetchRoster,
  rosterQuery,
  writeSnapshot,
} from '../scripts/roster';
import {
  assertSanityPortraits,
  validateRoster,
} from '../scripts/validate-content';

const copy = () => structuredClone(fixture);

test('synthetic roster includes portrait and portrait-free TeamMember records', () => {
  validateRoster(fixture);
  assert.equal(
    fixture.members[0].photo?.src,
    'artwork/purple-original-web.webp',
  );
  assert.equal(
    fixture.members[0].photo?.alt,
    'Fictional illustration for Ada Example',
  );
  assert.equal(fixture.members[1].photo, undefined);
  assert.throws(() => assertSanityPortraits(fixture), /Sanity portraits/);
  const live = copy();
  live.members[0].photo!.src =
    'https://cdn.sanity.io/images/project/staging/portrait.webp';
  assert.doesNotThrow(() => assertSanityPortraits(live));
});

test('public whitelist rejects private and unknown fields, unsafe URLs and invalid limits', () => {
  for (const mutate of [
    (value: any) => (value.token = 'secret'),
    (value: any) => (value.members[0].email = 'private@example.test'),
    (value: any) => (value.members[0].id = ''),
    (value: any) => (value.members[0].links[0].url = 'javascript:alert(1)'),
    (value: any) =>
      (value.members[0].links[0].url = 'https://user:pass@example.test'),
    (value: any) =>
      (value.members[0].links[0].url = `https://x.test/${'x'.repeat(2050)}`),
    (value: any) =>
      (value.members[0].photo.src = 'http://cdn.sanity.io/a.webp'),
    (value: any) =>
      (value.members[0].photo.src = 'https://evil.test/photo.webp'),
    (value: any) => (value.members[0].photo.src = 'artwork/../secret.webp'),
    (value: any) =>
      (value.members[0].links = Array(7).fill({
        label: 'x',
        url: 'https://x.test',
      })),
    (value: any) => value.members.push(value.members[0]),
  ]) {
    const value = copy();
    mutate(value);
    assert.throws(() => validateRoster(value));
  }
  assert.throws(() => validateRoster({ members: 'bad' }));
  assert.throws(() => validateRoster(null));
  assert.throws(() => validateRoster({ members: [], private: true }));
});

test('published query excludes drafts and validates a published empty roster', async () => {
  const { parse, evaluate } = await import('groq-js');
  const expression = parse(rosterQuery);
  assert(!rosterQuery.includes('drafts.'));
  assert(rosterQuery.includes('_id == "roster" && _type == "roster"'));
  const projected = await (
    await evaluate(expression, {
      dataset: [
        {
          _id: 'roster',
          _type: 'roster',
          members: [
            {
              _key: 'legacy-member-key',
              _type: 'member',
              name: 'Ada Example',
              role: 'President',
              email: 'private@example.test',
              photo: { asset: { _ref: 'portrait-asset' }, alt: 'Portrait' },
              links: [
                {
                  _key: 'link-key',
                  label: 'Site',
                  url: 'https://example.test',
                  private: 'x',
                },
              ],
            },
            {
              _key: 'portrait-free-key',
              _type: 'member',
              id: 'portrait-free',
              name: 'Lin Sample',
              role: 'Treasurer',
              private: 'hidden',
              links: [],
            },
          ],
        },
        {
          _id: 'drafts.roster',
          _type: 'roster',
          members: [{ _key: 'private-draft', email: 'draft@example.test' }],
        },
        {
          _id: 'portrait-asset',
          _type: 'sanity.imageAsset',
          url: 'https://cdn.sanity.io/images/fictional/staging/portrait.webp',
        },
      ],
    })
  ).get();
  assert.deepEqual(projected, {
    members: [
      {
        id: 'legacy-member-key',
        name: 'Ada Example',
        role: 'President',
        photo: {
          src: 'https://cdn.sanity.io/images/fictional/staging/portrait.webp',
          alt: 'Portrait',
        },
        links: [{ label: 'Site', url: 'https://example.test' }],
      },
      {
        id: 'portrait-free',
        name: 'Lin Sample',
        role: 'Treasurer',
        links: [],
      },
    ],
  });
  validateRoster(projected);
  assert.equal('photo' in projected.members[1], false);
  const empty = await (
    await evaluate(expression, {
      dataset: [{ _id: 'roster', _type: 'roster', members: [] }],
    })
  ).get();
  validateRoster(empty);
  assert.deepEqual(empty, { members: [] });
  const missing = await (
    await evaluate(expression, {
      dataset: [
        {
          _id: 'drafts.roster',
          _type: 'roster',
          members: [{ email: 'secret' }],
        },
      ],
    })
  ).get();
  assert.throws(() => validateRoster(missing));
  const malformed = await (
    await evaluate(expression, {
      dataset: [{ _id: 'roster', _type: 'roster' }],
    })
  ).get();
  assert.throws(() => validateRoster(malformed));
  const invalidMember = await (
    await evaluate(expression, {
      dataset: [
        {
          _id: 'roster',
          _type: 'roster',
          members: [{ _key: 'broken-member', role: 'Role', links: [] }],
        },
      ],
    })
  ).get();
  assert.throws(() => validateRoster(invalidMember));
  const brokenPortrait = await (
    await evaluate(expression, {
      dataset: [
        {
          _id: 'roster',
          _type: 'roster',
          members: [
            {
              _key: 'broken-photo',
              name: 'Name',
              role: 'Role',
              photo: { alt: 'Missing asset' },
              links: [],
            },
          ],
        },
      ],
    })
  ).get();
  assert.throws(() => validateRoster(brokenPortrait));
  await assert.rejects(fetchRoster({}), /SANITY_PROJECT_ID/);
});

test('atomic snapshot write rejects invalid data and a failed replacement keeps old bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcom-roster-'));
  const file = join(dir, 'roster.json');
  try {
    await writeSnapshot(fixture, file);
    const before = await readFile(file, 'utf8');
    await assert.rejects(
      writeSnapshot({ members: [{ email: 'private' }] }, file),
    );
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, 'occupied');
    await assert.rejects(writeSnapshot(fixture, file));
    assert.equal(await readFile(file, 'utf8'), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('release provenance binds Sanity source, project, dataset and snapshot hash', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcom-provenance-'));
  const file = join(dir, 'roster.json');
  const provenance = join(dir, 'roster-source.json');
  try {
    await writeSnapshot(fixture, file, { source: 'fixture' }, provenance);
    await assertConfiguredSnapshot(
      { CI: 'true', ROSTER_SOURCE: 'fixture' },
      file,
      provenance,
    );
    await assert.rejects(
      assertConfiguredSnapshot(
        {
          CI: 'true',
          ROSTER_SOURCE: 'sanity',
          SANITY_PROJECT_ID: 'fictional123',
          SANITY_DATASET: 'staging',
        },
        file,
        provenance,
      ),
      /Sanity/,
    );
    await writeSnapshot(
      fixture,
      file,
      {
        source: 'sanity',
        projectId: 'fictional123',
        dataset: 'staging',
      },
      provenance,
    );
    await assertSanitySnapshot(
      { SANITY_PROJECT_ID: 'fictional123', SANITY_DATASET: 'staging' },
      file,
      provenance,
    );
    await assert.rejects(
      assertSanitySnapshot(
        { SANITY_PROJECT_ID: 'other123', SANITY_DATASET: 'staging' },
        file,
        provenance,
      ),
      /project/,
    );
    await assert.rejects(
      assertSanitySnapshot(
        { SANITY_PROJECT_ID: 'fictional123', SANITY_DATASET: 'production' },
        file,
        provenance,
      ),
    );
    await writeFile(file, `${JSON.stringify({ members: [] })}\n`);
    await assert.rejects(
      assertSanitySnapshot(
        { SANITY_PROJECT_ID: 'fictional123', SANITY_DATASET: 'staging' },
        file,
        provenance,
      ),
      /changed/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
