import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const origin = 'https://gcom.techtom.tech';
const valid = {
  name: 'Contact fixture',
  email: 'visitor@example.com',
  subject: 'Membership',
  message: 'Hello, I would like to join.',
};
const smtp = {
  CONTACT_SMTP_HOST: 'smtp.example.com',
  CONTACT_SMTP_USER: 'mailer',
  CONTACT_SMTP_PASS: 'test-only',
  CONTACT_SMTP_FROM: 'club@example.com',
};
const unavailable =
  'Message delivery is temporarily unavailable. Please email us directly.';

test('standalone server serves contact and health while retired editor routes stay unavailable', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'gcom-contact-test-'));
  const portServer = http.createServer();
  await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./index.mjs', import.meta.url))],
    {
      env: {
        ...process.env,
        ...Object.fromEntries(Object.keys(smtp).map((key) => [key, ''])),
        CONTACT_SMTP_PORT: '',
        CONTACT_RECIPIENT: '',
        CONTACT_ALLOWED_ORIGIN: origin,
        CONTACT_TRUSTED_PROXY_IPS: '',
        HOST: '127.0.0.1',
        PORT: String(port),
        EDITOR_STATE_DIR: directory,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  t.after(async () => {
    child.kill();
    if (child.exitCode === null) await once(child, 'exit');
    await rm(directory, { recursive: true, force: true });
  });
  await Promise.race([
    once(child.stdout, 'data'),
    once(child, 'exit').then(() => {
      throw new Error('Contact server exited before ready');
    }),
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Contact server did not start')),
        5000,
      );
      timer.unref();
    }),
  ]);
  const url = `http://127.0.0.1:${port}`;
  const response = await fetch(url + '/api/contact', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(valid),
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { message: unavailable });
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  const preflight = await fetch(url + '/api/contact', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(preflight.status, 204);
  const denied = await fetch(url + '/api/contact', {
    method: 'POST',
    headers: {
      Origin: 'https://other.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(valid),
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  const health = await fetch(url + '/health?check=1');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('referrer-policy'), 'no-referrer');
  assert.match(
    health.headers.get('content-security-policy'),
    /frame-ancestors 'none'/,
  );
  for (const path of [
    '/api/editor/setup',
    '/api/editor/profiles',
    '/api/collections/committee_users/auth-methods',
    '/',
  ])
    assert.equal((await fetch(url + path)).status, 404);
  const method = await fetch(url + '/api/contact', {
    headers: { Origin: origin },
  });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'POST, OPTIONS');
  const healthMethod = await fetch(url + '/health', { method: 'POST' });
  assert.equal(healthMethod.status, 405);
  assert.equal(healthMethod.headers.get('allow'), 'GET');
  assert.deepEqual(await readdir(directory), []);
});
