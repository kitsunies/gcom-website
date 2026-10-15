import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@sanity/client';
import { createSchema } from 'sanity';
import { validateDocument } from '@sanity/validation';
import { schemaTypes, validHttps } from './schema';
import { singletonTypes } from './singletons';
import { studioEnvironment } from './environment';
import { safeHttps } from '../web/scripts/validate-content';

const registry = new Map(schemaTypes.map((type) => [type.name, type]));
const roster = (members: unknown[]) => ({
  _id: 'roster',
  _type: 'roster',
  members,
  _rev: 'test',
  _createdAt: '2026-10-01T00:00:00Z',
  _updatedAt: '2026-10-01T00:00:00Z',
});
const member = (id = 'ada', name = 'Ada') => ({
  _key: id,
  _type: 'member',
  id,
  name,
  role: 'President',
  links: [
    {
      _key: 'site',
      _type: 'publicLink',
      label: 'Website',
      url: 'https://example.test',
    },
  ],
});

async function validate(document: ReturnType<typeof roster>) {
  return validateDocument({
    document,
    schema: createSchema({ name: 'gcom', types: schemaTypes }),
    client: createClient({
      projectId: 'dummy123',
      dataset: 'test',
      apiVersion: '2026-10-01',
      useCdn: false,
    }),
    getDocumentExists: async () => true,
  });
}

test('Studio schema exposes only the roster document and its member/link/image types', () => {
  assert.deepEqual(
    [...registry.keys()],
    ['portraitImage', 'publicLink', 'member', 'roster'],
  );
  assert.deepEqual(singletonTypes, ['roster']);
  assert.deepEqual(
    registry.get('roster')!.fields!.map((field) => field.name),
    ['members'],
  );
  assert.deepEqual(
    registry.get('member')!.fields!.map((field) => field.name),
    ['id', 'name', 'role', 'photo', 'links'],
  );
});

test('Studio config still requires its separate Studio environment variables', () => {
  assert.throws(() => studioEnvironment({}), /SANITY_STUDIO_PROJECT_ID/);
  assert.throws(
    () => studioEnvironment({ SANITY_STUDIO_PROJECT_ID: 'dummy123' }),
    /SANITY_STUDIO_DATASET/,
  );
  assert.deepEqual(
    studioEnvironment({
      SANITY_STUDIO_PROJECT_ID: 'dummy123',
      SANITY_STUDIO_DATASET: 'staging',
    }),
    { projectId: 'dummy123', dataset: 'staging' },
  );
});

test('Studio HTTPS validation matches the public snapshot validator', () => {
  for (const value of [
    'https://example.test',
    'https://user:secret@example.test',
    'http://example.test',
    'https://example.test/a b',
    'https://example.test/\n',
    'https://example.test/\u0085',
    `https://example.test/${'x'.repeat(2050)}`,
    '',
    undefined,
  ])
    assert.equal(validHttps(value), safeHttps(value), String(value));
});

test('roster validates unique IDs and member/link field limits and controls', async () => {
  assert.equal((await validate(roster([member()]))).status, 'passed');
  for (const members of [
    [member(), member()],
    [member('id', 'A'.repeat(121))],
    [{ ...member(), role: 'R'.repeat(121) }],
    [member('I'.repeat(201))],
    [{ ...member(), links: [{ ...member().links[0], label: 'L'.repeat(61) }] }],
    [
      {
        ...member(),
        links: [{ ...member().links[0], url: 'http://example.test' }],
      },
    ],
    [{ ...member(), name: 'Ada\u0085Example' }],
    [{ ...member(), name: 'Ada\u000bExample' }],
    [{ ...member(), links: [{ ...member().links[0], label: 'Web\u009f' }] }],
  ])
    assert.equal((await validate(roster(members))).status, 'failed');
});

test('portrait is optional, and a present portrait validates alt text limits', async () => {
  const withPortrait = {
    ...member(),
    photo: {
      _type: 'portraitImage',
      asset: { _type: 'reference', _ref: 'image-1' },
      alt: 'Portrait',
    },
  };
  assert.equal((await validate(roster([withPortrait]))).status, 'passed');
  for (const alt of ['Portrait\u0085text', 'A'.repeat(5001)]) {
    const invalid = { ...withPortrait, photo: { ...withPortrait.photo, alt } };
    assert.equal((await validate(roster([invalid]))).status, 'failed');
  }
  const { photo: _photo, ...withoutPortrait } = withPortrait;
  assert.equal((await validate(roster([withoutPortrait]))).status, 'passed');
});

test('disabled webhook recipe filters only published roster creates, updates and deletes', async () => {
  const { parse, evaluate } = await import('groq-js');
  const { default: hook } = await import('./webhook.json');
  const expression = parse(hook.rule.filter, { mode: 'delta' });
  for (const [before, after] of [
    [null, { _id: 'roster', _type: 'roster' }],
    [
      { _id: 'roster', _type: 'roster' },
      { _id: 'roster', _type: 'roster' },
    ],
    [{ _id: 'roster', _type: 'roster' }, null],
  ])
    assert.equal(
      await (await evaluate(expression, { before, after })).get(),
      true,
    );
  for (const document of [
    { _id: 'roster', _type: 'team' },
    { _id: 'team', _type: 'team' },
    { _id: 'drafts.roster', _type: 'roster' },
    { _id: 'versions.release.roster', _type: 'roster' },
    { _id: 'other', _type: 'roster' },
  ])
    assert.equal(
      await (
        await evaluate(expression, { before: null, after: document })
      ).get(),
      false,
      document._id,
    );
  assert.deepEqual(
    await (
      await evaluate(parse(hook.rule.projection, { mode: 'delta' }))
    ).get(),
    { ref: 'main' },
  );
  assert.equal(hook.includeDrafts, false);
  assert.equal(hook.includeAllVersions, false);
  assert.equal(hook.isDisabledByUser, true);
  assert(!('Authorization' in hook.headers));
});
