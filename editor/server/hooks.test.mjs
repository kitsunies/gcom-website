import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function fixture() {
  let emails = ['committee@example.com'];
  const hooks = {};
  const context = {
    module: { exports: {} },
    $os: { getenv: () => '/allowlist', readFile: () => JSON.stringify(emails) },
    ForbiddenError: Error,
  };
  vm.runInNewContext(
    readFileSync(new URL('../pb_hooks/access.js', import.meta.url), 'utf8'),
    context,
  );
  const access = context.module.exports;
  const methods = [
    'onBootstrap',
    'onRecordAuthWithOAuth2Request',
    'onRecordAuthRequest',
    'onRecordAuthRefreshRequest',
    'onRecordsListRequest',
    'onRecordViewRequest',
    'onRecordCreateRequest',
    'onRecordUpdateRequest',
    'onRecordDeleteRequest',
  ];
  const global = {
    __hooks: '/hooks',
    require: () => access,
    $apis: { requireAuth: () => {} },
    routerAdd: () => {},
    ForbiddenError: Error,
    ...Object.fromEntries(
      methods.map((method) => [method, (fn) => (hooks[method] = fn)]),
    ),
  };
  vm.runInNewContext(
    readFileSync(
      new URL('../pb_hooks/committee.pb.js', import.meta.url),
      'utf8',
    ),
    global,
  );
  const user = {
    collection: () => ({ name: 'committee_users' }),
    verified: () => true,
    email: () => 'Committee@Example.com',
  };
  const app = {
    findAllExternalAuthsByRecord: () => [{ provider: () => 'google' }],
  };
  return { hooks, access, user, app, revoke: () => (emails = []) };
}
test('Google OAuth rejects unverified email, alternate provider, mismatched email and client account injection', () => {
  const { hooks } = fixture();
  const oauth = hooks.onRecordAuthWithOAuth2Request;
  const base = {
    providerName: 'google',
    oAuth2User: {
      email: 'Committee@Example.com',
      rawUser: { email_verified: true },
    },
    createData: { email: 'attacker@example.com', verified: true },
    next: () => {},
  };
  for (const event of [
    { ...base, providerName: 'github' },
    {
      ...base,
      oAuth2User: { ...base.oAuth2User, rawUser: { email_verified: false } },
    },
    { ...base, record: { email: () => 'attacker@example.com' } },
  ])
    assert.throws(() => oauth(event));
  oauth(base);
  assert.equal(
    JSON.stringify(base.createData),
    '{"email":"committee@example.com"}',
  );
});
test('every profile operation and token refresh rechecks Google provenance and allowlist', () => {
  const { hooks, user, app, revoke } = fixture();
  const names = [
    'onRecordsListRequest',
    'onRecordViewRequest',
    'onRecordCreateRequest',
    'onRecordUpdateRequest',
    'onRecordDeleteRequest',
    'onRecordAuthRefreshRequest',
    'onRecordAuthRequest',
  ];
  for (const name of names) {
    const event = { app, auth: user, record: user, next: () => {} };
    hooks[name](event);
    assert.throws(() =>
      hooks[name]({
        ...event,
        app: { findAllExternalAuthsByRecord: () => [] },
      }),
    );
  }
  revoke();
  for (const name of names)
    assert.throws(() =>
      hooks[name]({ app, auth: user, record: user, next: () => {} }),
    );
});
