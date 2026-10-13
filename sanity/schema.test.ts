import assert from 'node:assert/strict';
import { test } from 'node:test';
import fixture from '../content/fixture.json';
import { schemaTypes, validHttps, validInternal } from './schema';

test('Studio fields exactly match the canonical fixture', () => {
  type Shape = {
    name: string;
    type: string;
    fields?: Shape[];
    of?: { type: string }[];
  };
  const registry = new Map(
    schemaTypes.map((definition) => [definition.name, definition as Shape]),
  );
  const walk = (value: unknown, definition: Shape) => {
    const shape = registry.get(definition.type) ?? definition;
    if (shape.type === 'image') {
      assert.deepEqual(Object.keys(value as object).sort(), ['alt', 'src']);
    } else if (Array.isArray(value)) {
      for (const item of value)
        walk(item, { name: '', type: shape.of![0].type });
    } else if (value && typeof value === 'object') {
      assert.deepEqual(
        shape.fields!.map((field) => field.name).sort(),
        Object.keys(value).sort(),
        definition.name,
      );
      for (const field of shape.fields!)
        walk((value as Record<string, unknown>)[field.name], field);
    } else assert.equal(shape.type, 'string');
  };
  for (const [name, value] of Object.entries(fixture))
    walk(value, registry.get(name)!);
  assert.deepEqual(
    registry.get('member')!.fields!.map((field) => field.name),
    ['id', 'name', 'role', 'photo', 'links'],
  );
});

test('link validation permits code routes and public HTTPS only', () => {
  for (const url of [
    '',
    'about/',
    'team/',
    'contact/',
    '#events',
    '#quests',
    'about/#events',
    'team/#quests',
  ])
    assert(validInternal(url));
  for (const url of [
    '/about/',
    'events/',
    '#main-content',
    '../team/',
    '//evil.test',
    'javascript:alert(1)',
    'about/#other',
    undefined,
  ])
    assert(!validInternal(url));
  assert(validHttps('https://example.test/path'));
  for (const url of [
    'http://example.test',
    'https://user:secret@example.test',
    '',
    undefined,
  ])
    assert(!validHttps(url));
});

test('publication webhook excludes drafts and versions and fixes the dispatch branch', async () => {
  const { parse, evaluate } = await import('groq-js');
  const { default: hook } = await import('./webhook.json');
  const expression = parse(hook.rule.filter, { mode: 'delta' });
  for (const id of [
    'settings',
    'navigation',
    'home',
    'about',
    'team',
    'contact',
  ]) {
    for (const [before, after] of [
      [null, { _id: id }],
      [{ _id: id }, { _id: id }],
      [{ _id: id }, null],
    ]) {
      assert.equal(
        await (await evaluate(expression, { before, after })).get(),
        true,
      );
    }
  }
  for (const id of [
    'drafts.home',
    'drafts.settings',
    'versions.release.home',
    'unrelated',
  ]) {
    assert.equal(
      await (
        await evaluate(expression, { before: null, after: { _id: id } })
      ).get(),
      false,
    );
  }
  assert.deepEqual(
    await (
      await evaluate(parse(hook.rule.projection, { mode: 'delta' }))
    ).get(),
    { ref: 'main' },
  );
  assert.equal(hook.includeDrafts, false);
  assert.equal(hook.includeAllVersions, false);
  assert(
    !('Authorization' in hook.headers),
    'Webhook credentials must remain outside source',
  );
});
