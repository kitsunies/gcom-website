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
