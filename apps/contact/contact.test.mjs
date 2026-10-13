import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './contact.mjs';

const origin = 'https://gcom.techtom.tech';
const valid = {
  name: 'Contact fixture',
  email: 'visitor@example.com',
  subject: 'Membership',
  message: 'Hello, I would like to join.',
};

function fixture(
  t,
  overrides = {},
  deliver = async () => Response.json({ id: 'email-id' }),
) {
  const mails = [],
    keys = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    mails.push({ url, ...options, body: JSON.parse(options.body) });
    return deliver(options);
  });
  const env = {
    CONTACT_FROM: 'club@example.com',
    RESEND_API_KEY: 'test-only',
    CONTACT_RATE_LIMIT: {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: true };
      },
    },
    ...overrides,
  };
  const request = (
    body = valid,
    headers = {},
    method = 'POST',
    path = '/api/contact',
  ) =>
    worker.fetch(
      new Request(`https://contact.example${path}`, {
        method,
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '192.0.2.1',
          ...headers,
        },
        ...(method === 'POST'
          ? {
              body:
                body instanceof ReadableStream
                  ? body
                  : typeof body === 'string'
                    ? body
                    : JSON.stringify(body),
              duplex: 'half',
            }
          : {}),
      }),
      env,
    );
  return { request, mails, keys };
}

test('sends fixed plain text mail and waits for provider acceptance', async (t) => {
  let accept;
  const pending = new Promise((resolve) => {
    accept = resolve;
  });
  const { request, mails } = fixture(t, {}, () => pending);
  let completed = false;
  const delivery = request().then((response) => {
    completed = true;
    return response;
  });
  while (!mails.length) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false);
  assert.equal(mails[0].url, 'https://api.resend.com/emails');
  assert.equal(mails[0].method, 'POST');
  assert.equal(mails[0].redirect, 'error');
  assert.equal(mails[0].headers.Authorization, 'Bearer test-only');
  assert.deepEqual(mails[0].body, {
    from: 'club@example.com',
    to: ['kitsunies@gmail.com'],
    reply_to: 'visitor@example.com',
    subject: 'GCOM contact: Membership',
    text: 'Name: Contact fixture\nEmail: visitor@example.com\nSubject: Membership\n\nHello, I would like to join.',
  });
  accept(Response.json({ id: 'email-id' }));
  const response = await delivery;
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('only the server config can override the recipient', async (t) => {
  const { request, mails } = fixture(t, {
    CONTACT_RECIPIENT: 'committee@example.com',
  });
  assert.equal((await request()).status, 200);
  assert.deepEqual(mails[0].body.to, ['committee@example.com']);
  assert.equal(
    (await request({ ...valid, to: 'attacker@example.com' })).status,
    400,
  );
  assert.equal(mails.length, 1);
});

test('provider rejection, missing IDs, invalid bodies, and transport failure return safe 502 errors', async (t) => {
  const results = [
    () => Response.json({ id: 'email-id' }, { status: 401 }),
    () => Response.json({}),
    () => Response.json({ id: '' }),
    () => Response.json({ id: 1 }),
    () => Response.json(null),
    () => new Response('{bad'),
    () => new Response('x'.repeat(16385)),
    () => {
      throw Error('Secret test-only provider detail');
    },
    () => Response.json({ id: 'email-id' }),
  ];
  const { request } = fixture(t, {}, () => results.shift()());
  for (let i = 0; i < 8; i++) {
    const response = await request();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      message:
        'Your message could not be delivered. Please try again or email us directly.',
    });
  }
  assert.equal((await request()).status, 200);
});

test('provider timeout covers the request and returns an honest failure', async (t) => {
  let timeout;
  const controller = new AbortController();
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    timeout = ms;
    return controller.signal;
  });
  const { request, mails } = fixture(
    t,
    {},
    (options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => reject(options.signal.reason),
          { once: true },
        );
      }),
  );
  const delivery = request();
  while (!mails.length) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timeout, 10000);
  controller.abort();
  assert.equal((await delivery).status, 502);
});

test('missing or invalid configuration returns 503 without provider calls', async (t) => {
  const { request, mails } = fixture(t, { RESEND_API_KEY: '' });
  assert.equal((await request()).status, 503);
  assert.equal(mails.length, 0);
  for (const overrides of [
    { CONTACT_FROM: '' },
    { CONTACT_FROM: 'club@example.com\r\nBcc:bad@example.com' },
    { CONTACT_RECIPIENT: 'bad' },
    { RESEND_API_KEY: 'bad\nkey' },
    { CONTACT_ALLOWED_ORIGIN: 'https://gcom.techtom.tech/path' },
    { CONTACT_RATE_LIMIT: undefined },
  ]) {
    const setup = fixture(t, overrides);
    assert.equal(
      (await setup.request()).status,
      503,
      JSON.stringify(overrides),
    );
    assert.equal(setup.mails.length, 0);
  }
});

test('CORS requires the configured exact origin and narrow POST preflight', async (t) => {
  const configured = 'http://100.126.154.2:8766';
  const { request, mails, keys } = fixture(t, {
    CONTACT_ALLOWED_ORIGIN: configured,
  });
  for (const Origin of [origin, '', 'null', `${configured}/`]) {
    const response = await request(valid, { Origin });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  const headers = {
    Origin: configured,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'Content-Type',
  };
  const preflight = await request(undefined, headers, 'OPTIONS');
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get('access-control-allow-origin'),
    configured,
  );
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST');
  assert.equal(
    preflight.headers.get('access-control-allow-headers'),
    'Content-Type',
  );
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
  assert.equal(preflight.headers.get('vary'), 'Origin');
  assert.equal(
    (
      await request(
        undefined,
        { ...headers, 'Access-Control-Request-Method': 'GET' },
        'OPTIONS',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        undefined,
        { ...headers, 'Access-Control-Request-Headers': 'Authorization' },
        'OPTIONS',
      )
    ).status,
    403,
  );
  const get = await request(undefined, { Origin: configured }, 'GET');
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST, OPTIONS');
  assert.equal(
    (await request(valid, { Origin: configured }, 'POST', '/other')).status,
    404,
  );
  assert.equal(keys.length, 0);
  assert.equal(mails.length, 0);
});

test('preserves field limits, prevents control injection, and rejects honeypot and unknown fields', async (t) => {
  const { request, mails } = fixture(t);
  for (const body of [
    null,
    [],
    {},
    { ...valid, name: '' },
    { ...valid, name: 'x'.repeat(101) },
    { ...valid, name: 'Name\nBcc:bad@example.com' },
    { ...valid, email: 'bad' },
    { ...valid, email: 'a..b@example.com' },
    { ...valid, email: '"a"@example.com' },
    { ...valid, email: 'x'.repeat(65) + '@example.com' },
    { ...valid, email: 'v@example.com\r\nBcc:bad@example.com' },
    { ...valid, subject: 'x'.repeat(151) },
    { ...valid, subject: 'Hi\r\nBcc:bad@example.com' },
    { ...valid, message: '' },
    { ...valid, message: 'x'.repeat(5001) },
    { ...valid, message: 'Hello\u0000' },
    { ...valid, website: 'https://bot.example.com' },
    { ...valid, website: 123 },
    { ...valid, recipient: 'bad@example.com' },
  ])
    assert.equal(
      (await request(body)).status,
      400,
      JSON.stringify(body).slice(0, 80),
    );
  assert.equal(mails.length, 0);
  assert.equal(
    (
      await request({
        ...valid,
        subject: '',
        website: '',
        message: 'First line\r\nSecond line\tindent',
      })
    ).status,
    200,
  );
  assert.equal(mails[0].body.subject, 'GCOM contact: Website contact');
});

test('requires JSON and enforces the byte limit on streams without trusting Content-Length', async (t) => {
  const { request, mails } = fixture(t);
  assert.equal(
    (await request(valid, { 'Content-Type': 'text/plain' })).status,
    415,
  );
  assert.equal((await request('{bad')).status, 400);
  const text = JSON.stringify(valid);
  assert.equal(
    (await request(text + ' '.repeat(16384 - Buffer.byteLength(text)))).status,
    200,
  );
  assert.equal(
    (await request(text + ' '.repeat(16385 - Buffer.byteLength(text)))).status,
    413,
  );
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.enqueue(new Uint8Array(16385));
    },
    cancel() {
      cancelled = true;
    },
  });
  assert.equal((await request(stream, { 'Content-Length': '1' })).status, 413);
  assert.equal(cancelled, true);
  assert.equal(mails.length, 1);
  const broken = new ReadableStream({
    start(controller) {
      controller.error(Error('private details'));
    },
  });
  assert.equal((await request(broken)).status, 400);
});

test('rate limits by the platform IP, ignores forwarded headers, and fails closed without a binding or IP', async (t) => {
  let count = 0;
  const keys = [];
  const { request, mails } = fixture(t, {
    CONTACT_RATE_LIMIT: {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: ++count <= 5 };
      },
    },
  });
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await request(valid, { 'X-Forwarded-For': `192.0.2.${i + 2}` })).status,
      200,
    );
  const limited = await request(valid, { 'X-Forwarded-For': '198.51.100.1' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.deepEqual(keys, Array(6).fill('192.0.2.1'));
  assert.equal(mails.length, 5);
  assert.equal((await request(valid, { 'CF-Connecting-IP': '' })).status, 503);
  const broken = fixture(t, {
    CONTACT_RATE_LIMIT: {
      limit: async () => {
        throw Error('platform unavailable');
      },
    },
  });
  assert.equal((await broken.request()).status, 503);
  assert.equal(broken.mails.length, 0);
});
