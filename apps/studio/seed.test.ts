import { siteQuery, validateSiteContent } from '../web/scripts/site-content';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedContent, type SeedClient } from './seed';
import { singletonTypes } from './singletons';
import { studioEnvironment } from './environment';
import fixture from '../web/content/fixture.json';
import { createSchema } from 'sanity';
import { validateDocument } from '@sanity/validation';
import { createClient } from '@sanity/client';
import { schemaTypes } from './schema';

function mock(existing: string[] = []) {
  const documents = new Map<string, Record<string, unknown>>(
    existing.map((id) => [
      id,
      { _id: id, _type: id.replace('drafts.', ''), edited: true },
    ]),
  );
  const uploads: string[] = [];
  const creates: string[] = [];
  const client: SeedClient = {
    getDocuments: async (ids) => ids.map((id) => documents.get(id) ?? null),
    assets: {
      upload: async (_type, _data, options) => {
        uploads.push(options.filename);
        return { _id: `image-${uploads.length}-100x100-png` };
      },
    },
    createIfNotExists: async (document) => {
      creates.push(document._id);
      if (!documents.has(document._id)) documents.set(document._id, document);
      return documents.get(document._id)!;
    },
  };
  return { client, documents, uploads, creates };
}

test('seed converts local images and is a no-op on rerun', async () => {
  const state = mock();
  const first = await seedContent(state.client, { dataset: 'test' });
  assert.deepEqual(first.created, [...singletonTypes]);
  const settings = state.documents.get('settings')!;
  assert.deepEqual(settings.logo, {
    _type: 'siteImage',
    asset: { _type: 'reference', _ref: 'image-1-100x100-png' },
    alt: '',
  });
  const quests = state.documents.get('home')!.quests as Record<
    string,
    unknown
  >[];
  assert.equal(quests.length, fixture.home.quests.length);
  assert.equal(quests[0]._key, 'item-0');
  assert.equal(quests[0]._type, 'quest');
  assert.equal(
    (state.documents.get('home')!.metadata as Record<string, unknown>)._type,
    'metadata',
  );
  assert.equal(
    (state.documents.get('navigation')!.links as Record<string, unknown>[])[0]
      ._type,
    'navigationLink',
  );
  assert.equal(state.uploads.filter((name) => name === 'banner.png').length, 1);
  const before = structuredClone([...state.documents]);
  const uploads = state.uploads.length;
  const creates = state.creates.length;
  const second = await seedContent(state.client, { dataset: 'test' });
  assert.deepEqual(second.skipped, [...singletonTypes]);
  assert.equal(state.uploads.length, uploads);
  assert.equal(state.creates.length, creates);
  assert.deepEqual([...state.documents], before);
});

test('published and draft documents skip uploads and creates', async () => {
  const state = mock(
    singletonTypes.map((id, index) => (index % 2 ? `drafts.${id}` : id)),
  );
  const before = structuredClone([...state.documents]);
  const result = await seedContent(state.client, { dataset: 'test' });
  assert.deepEqual(result.skipped, [...singletonTypes]);
  assert.equal(state.uploads.length, 0);
  assert.equal(state.creates.length, 0);
  assert.deepEqual([...state.documents], before);
});

test('production is rejected before any client calls', async () => {
  const state = mock();
  await assert.rejects(
    seedContent(state.client, { dataset: 'production' }),
    /production/,
  );
  assert.equal(state.uploads.length, 0);
  assert.equal(state.creates.length, 0);
});

test('environment requires explicit project and dataset', () => {
  assert.throws(() => studioEnvironment({}), /SANITY_STUDIO_PROJECT_ID/);
  assert.throws(
    () => studioEnvironment({ SANITY_STUDIO_PROJECT_ID: 'test1234' }),
    /SANITY_STUDIO_DATASET/,
  );
  assert.deepEqual(
    studioEnvironment({
      SANITY_STUDIO_PROJECT_ID: 'test1234',
      SANITY_STUDIO_DATASET: 'staging',
    }),
    { projectId: 'test1234', dataset: 'staging' },
  );
});

test('createIfNotExists preserves an edit appearing during an upload', async () => {
  const state = mock();
  const upload = state.client.assets.upload;
  state.client.assets.upload = async (...args) => {
    state.documents.set('settings', {
      _id: 'settings',
      _type: 'settings',
      edited: true,
    });
    return upload(...args);
  };
  await seedContent(state.client, { dataset: 'test' });
  assert.equal(state.documents.get('settings')!.edited, true);
  assert.equal(state.documents.get('settings')!.logo, undefined);
});

test('generated singleton documents pass Sanity validation and preserve image subtypes', async () => {
  const state = mock();
  await seedContent(state.client, { dataset: 'test' });
  const schema = createSchema({ name: 'gcom', types: schemaTypes });
  const client = createClient({
    projectId: 'dummy123',
    dataset: 'test',
    apiVersion: '2026-10-01',
    useCdn: false,
  });
  for (const [id, document] of state.documents) {
    const errors = await validateDocument({
      document: {
        ...document,
        _id: id,
        _type: id,
        _rev: 'test',
        _createdAt: '2026-10-01T00:00:00Z',
        _updatedAt: '2026-10-01T00:00:00Z',
      },
      schema,
      client,
      getDocumentExists: async () => true,
    });
    assert.equal(errors.status, 'passed', id);
    assert.deepEqual(errors.markers, [], id);
  }
  const walk = (value: unknown, definition: ReturnType<typeof schema.get>) => {
    assert(definition);
    if (Array.isArray(value)) {
      assert('of' in definition);
      const members = definition.of as NonNullable<
        ReturnType<typeof schema.get>
      >[];
      for (const item of value) walk(item, members[0]);
    } else if (value && typeof value === 'object') {
      const object = value as Record<string, unknown>;
      assert.equal(object._type, definition.name);
      if (
        !['siteImage', 'socialImage', 'portraitImage'].includes(definition.name)
      ) {
        assert('fields' in definition);
        for (const field of definition.fields)
          walk(object[field.name], field.type);
      }
    }
  };
  for (const [id, document] of state.documents) walk(document, schema.get(id));
});

test('clearing optional Studio strings remains publishable and projects valid defaults', async () => {
  const state = mock();
  await seedContent(state.client, { dataset: 'test' });
  const settings = state.documents.get('settings')!;
  delete settings.calendarUrl;
  delete (settings.logo as Record<string, unknown>).alt;
  delete (
    state.documents.get('navigation')!.links as Record<string, unknown>[]
  )[0].url;
  const schema = createSchema({ name: 'gcom', types: schemaTypes });
  const client = createClient({
    projectId: 'dummy123',
    dataset: 'test',
    apiVersion: '2026-10-01',
    useCdn: false,
  });
  for (const id of ['settings', 'navigation']) {
    const result = await validateDocument({
      document: {
        ...state.documents.get(id)!,
        _id: id,
        _type: id,
        _rev: 'test',
        _createdAt: '2026-10-01T00:00:00Z',
        _updatedAt: '2026-10-01T00:00:00Z',
      },
      schema,
      client,
      getDocumentExists: async () => true,
    });
    assert.equal(result.status, 'passed');
    assert.deepEqual(result.markers, []);
  }
  const { parse, evaluate } = await import('groq-js');
  const assets = state.uploads.map((_, index) => ({
    _id: `image-${index + 1}-100x100-png`,
    _type: 'sanity.imageAsset',
    url: `https://cdn.sanity.io/images/dummy123/test/${index + 1}-100x100.png`,
  }));
  const result = await (
    await evaluate(parse(siteQuery), {
      dataset: [...state.documents.values(), ...assets],
    })
  ).get();
  validateSiteContent(result);
  assert.equal(result.settings.calendarUrl, '');
  assert.equal(result.settings.logo.alt, '');
  assert.equal(result.navigation.links[0].url, '');
});
