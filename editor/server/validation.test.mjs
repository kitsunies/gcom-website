import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorized,
  normalizeEmails,
  profile,
  roster,
  draftHash,
} from './validation.mjs';
const record = {
  id: 'abcdefghijklmn1',
  name: 'A Person',
  role: 'President',
  position: 0,
  photo: 'a'.repeat(64) + '.webp',
  links: [{ label: 'Website', url: 'https://example.com/' }],
  email: 'private@example.com',
  notes: 'private',
  collectionName: 'profiles',
};
test('committee access is exact, normalized, verified and revoked immediately', () => {
  const emails = normalizeEmails(['  Committee@Example.com ']);
  const user = {
    collectionName: 'committee_users',
    verified: true,
    email: 'COMMITTEE@example.com',
  };
  assert.equal(authorized(user, emails), true);
  assert.equal(
    authorized({ ...user, email: 'subcommittee@example.com' }, emails),
    false,
  );
  assert.equal(authorized({ ...user, verified: false }, emails), false);
  assert.equal(authorized({ ...user, collectionName: 'users' }, emails), false);
  assert.equal(authorized(user, normalizeEmails([])), false);
  assert.throws(() => normalizeEmails('committee@example.com'));
});
test('roster keeps array order, uses revision paths and drops every private field', () => {
  const snapshot = roster(
    [{ ...record, id: 'abcdefghijklmn2', position: 5 }, record],
    'a'.repeat(32),
    '2026-10-13T00:00:00.000Z',
  );
  assert.deepEqual(
    snapshot.members.map((m) => m.id),
    [record.id, 'abcdefghijklmn2'],
  );
  assert.deepEqual(Object.keys(snapshot.members[0]), [
    'id',
    'name',
    'role',
    'photo',
    'links',
  ]);
  assert.equal(
    snapshot.members[0].photo,
    `team/${'a'.repeat(32)}/${record.photo}`,
  );
  assert.equal(JSON.stringify(snapshot).includes('private'), false);
  assert.equal(draftHash([record]), draftHash([{ ...record }]));
  assert.notEqual(
    draftHash([record]),
    draftHash([{ ...record, role: 'Treasurer' }]),
  );
});
test('unsafe links, blank text, traversal, duplicates and invalid order are rejected', () => {
  for (const url of [
    'http://example.com',
    'javascript:alert(1)',
    'https://user:pass@example.com',
    'https://example.com/white space',
  ])
    assert.throws(() =>
      profile({ ...record, links: [{ label: 'Website', url }] }),
    );
  for (const changes of [
    { name: ' ' },
    { role: '\n' },
    { position: -1 },
    { position: 0.5 },
    { photo: '../../secret' },
    { links: [{ label: '', url: 'https://example.com' }] },
  ])
    assert.throws(() => profile({ ...record, ...changes }));
  assert.throws(() =>
    roster([record, record], 'a'.repeat(32), '2026-10-13T00:00:00.000Z'),
  );
});
