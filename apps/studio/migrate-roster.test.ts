import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateRoster, migrationOptions } from './migrate-roster';

type Doc = { _id: string; _type: string; _rev: string; members?: unknown };
function mock(
  options: {
    source?: Doc | null;
    sourceDraft?: Doc | null;
    target?: Doc | null;
    targetDraft?: Doc | null;
    changeRevision?: boolean;
  } = {},
) {
  const docs = new Map<string, Doc>();
  for (const [id, value] of Object.entries({
    team:
      'source' in options
        ? options.source
        : {
            _id: 'team',
            _type: 'team',
            _rev: 'rev-1',
            members: [
              {
                _key: 'legacy-key',
                id: 'old',
                photo: { asset: { _ref: 'image-existing' } },
                extra: 'preserved',
              },
            ],
          },
    'drafts.team': options.sourceDraft ?? null,
    roster: options.target ?? null,
    'drafts.roster': options.targetDraft ?? null,
  }))
    if (value) docs.set(id, value);
  const creates: Record<string, unknown>[] = [];
  const client = {
    getDocuments: async (ids: string[]) =>
      ids.map((id) => {
        const doc = docs.get(id);
        return doc ? structuredClone(doc) : null;
      }),
    create: async (document: Record<string, unknown>) => {
      creates.push(document);
      assert(!docs.has('roster'), 'exclusive target create');
      const created = { ...document, _rev: 'new-revision' } as Doc;
      docs.set('roster', structuredClone(created));
      if (options.changeRevision) docs.get('team')!._rev = 'changed-revision';
      return structuredClone(created);
    },
  };
  return { client, docs, creates };
}

test('migration preserves raw source and member data; identical rerun is a no-op', async () => {
  const state = mock();
  const sourceBefore = structuredClone(state.docs.get('team'));
  const before = structuredClone(state.docs.get('team')!.members);
  assert.deepEqual(await migrateRoster(state.client), { migrated: true });
  assert.deepEqual(state.docs.get('roster')!.members, before);
  assert.deepEqual(state.docs.get('team'), sourceBefore);
  assert.equal(state.creates.length, 1);
  assert.deepEqual(await migrateRoster(state.client), {
    migrated: false,
    reason: 'identical target already exists',
  });
  assert.equal(state.creates.length, 1);
});

test('expected source revision is checked before an identical-target no-op', async () => {
  const state = mock();
  await migrateRoster(state.client);
  const creates = state.creates.length;
  await assert.rejects(
    migrateRoster(state.client, { expectedSourceRevision: 'older-revision' }),
    /expected revision/,
  );
  assert.equal(state.creates.length, creates);
  assert.deepEqual(
    await migrateRoster(state.client, { expectedSourceRevision: 'rev-1' }),
    { migrated: false, reason: 'identical target already exists' },
  );
  assert.equal(state.creates.length, creates);
});

test('production migration requires explicit authorization and expected revision', () => {
  assert.throws(() => migrationOptions('production', []), /allow-production/);
  assert.throws(
    () => migrationOptions('production', ['--allow-production']),
    /expected-source-revision/,
  );
  assert.deepEqual(
    migrationOptions('production', [
      '--allow-production',
      '--expected-source-revision',
      'rev-1',
    ]),
    { expectedSourceRevision: 'rev-1' },
  );
  assert.deepEqual(migrationOptions('staging', []), {
    expectedSourceRevision: undefined,
  });
});

test('migration fails on missing source, source or target drafts, and target conflicts', async () => {
  for (const state of [
    mock({ source: null }),
    mock({
      sourceDraft: {
        _id: 'drafts.team',
        _type: 'team',
        _rev: 'd',
        members: [],
      },
    }),
    mock({
      targetDraft: {
        _id: 'drafts.roster',
        _type: 'roster',
        _rev: 'd',
        members: [],
      },
    }),
    mock({
      target: { _id: 'roster', _type: 'roster', _rev: 'x', members: [] },
    }),
  ]) {
    await assert.rejects(migrateRoster(state.client));
    assert.equal(state.creates.length, 0);
  }
});

test('migration stops on a source revision race and retains the created roster', async () => {
  const state = mock({ changeRevision: true });
  const sourceBefore = structuredClone(state.docs.get('team'));
  await assert.rejects(
    migrateRoster(state.client),
    /changed during roster migration/,
  );
  assert.equal(state.docs.has('roster'), true);
  assert.equal(state.creates.length, 1);
  assert.notDeepEqual(state.docs.get('team'), sourceBefore);
});
