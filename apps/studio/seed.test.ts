import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedRoster, type SeedClient } from './seed';

function mock(existing: string[] = []) {
  const docs = new Map(
    existing.map((id) => [
      id,
      { _id: id, _type: 'roster', members: [{ id: 'existing' }] },
    ]),
  );
  const creates: Record<string, unknown>[] = [];
  const client: SeedClient = {
    getDocuments: async (ids) => ids.map((id) => docs.get(id) ?? null),
    createIfNotExists: async (doc) => {
      creates.push(doc);
      if (!docs.has(doc._id)) docs.set(doc._id, doc);
    },
  };
  return { client, docs, creates };
}

test('seed creates an empty roster and leaves existing documents unchanged', async () => {
  const missing = mock();
  assert.deepEqual(await seedRoster(missing.client, { dataset: 'staging' }), {
    created: ['roster'],
    skipped: [],
  });
  assert.deepEqual(missing.docs.get('roster'), {
    _id: 'roster',
    _type: 'roster',
    members: [],
  });
  assert.equal(missing.creates.length, 1);

  for (const existing of ['roster', 'drafts.roster']) {
    const state = mock([existing]);
    const before = structuredClone([...state.docs]);
    assert.deepEqual(await seedRoster(state.client, { dataset: 'staging' }), {
      created: [],
      skipped: ['roster'],
    });
    assert.deepEqual([...state.docs], before);
    assert.equal(state.creates.length, 0);
  }
});

test('seed refuses production before any client call', async () => {
  const state = mock();
  await assert.rejects(
    seedRoster(state.client, { dataset: 'production' }),
    /production/,
  );
  assert.equal(state.creates.length, 0);
});
