import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

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

async function fixture(
  t,
  {
    env = smtp,
    sendMail = async () => ({
      accepted: ['kitsunies@gmail.com'],
      rejected: [],
    }),
    now,
  } = {},
) {
  const { createContactHandler } = await import('./contact.mjs');
  const mails = [],
    options = [];
  const handler = createContactHandler({
    env,
    now,
    createTransport: (config) => {
      options.push(config);
      return {
        sendMail: async (mail) => {
          mails.push(mail);
          return sendMail(mail);
        },
      };
    },
  });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}/api/contact`;
  const request = (body = valid, headers = {}, method = 'POST') =>
    fetch(url, {
      method,
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...headers,
      },
      body:
        method === 'POST'
          ? typeof body === 'string'
            ? body
            : JSON.stringify(body)
          : undefined,
    });
  return { request, mails, options, url };
}

test('delivery fixes the envelope and reply address and waits for SMTP acceptance', async (t) => {
  let accept;
  const pending = new Promise((resolve) => {
    accept = resolve;
  });
  const { request, mails, options } = await fixture(t, {
    sendMail: () => pending,
  });
  let completed = false;
  const delivery = request().then((response) => {
    completed = true;
    return response;
  });
  while (!mails.length) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(completed, false);
  assert.equal(mails[0].from, 'club@example.com');
  assert.equal(mails[0].to, 'kitsunies@gmail.com');
  assert.equal(mails[0].replyTo, 'visitor@example.com');
  assert.deepEqual(mails[0].envelope, {
    from: 'club@example.com',
    to: ['kitsunies@gmail.com'],
  });
  assert.equal(mails[0].html, undefined);
  assert.match(mails[0].text, /Hello, I would like to join\./);
  assert.equal(options[0].requireTLS, true);
  assert.equal(options[0].logger, false);
  accept({ accepted: ['kitsunies@gmail.com'], rejected: [] });
  const response = await delivery;
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('SMTP failures and unaccepted recipients return safe errors and allow retry', async (t) => {
  let attempt = 0;
  const { request } = await fixture(t, {
    sendMail: async () => {
      if (++attempt === 1)
        throw new Error('SMTP password=test-only internal detail');
      if (attempt === 2)
        return { accepted: [], rejected: ['kitsunies@gmail.com'] };
      return { accepted: ['kitsunies@gmail.com'], rejected: [] };
    },
  });
  for (let i = 0; i < 2; i++) {
    const response = await request();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      message:
        'Your message could not be delivered. Please try again or email us directly.',
    });
  }
  assert.equal((await request()).status, 200);
});

test('operator recipient and TLS port override the defaults without accepting a client recipient', async (t) => {
  const { request, mails, options } = await fixture(t, {
    env: {
      ...smtp,
      CONTACT_RECIPIENT: 'committee@example.com',
      CONTACT_SMTP_PORT: '465',
    },
    sendMail: async () => ({
      accepted: ['committee@example.com'],
      rejected: [],
    }),
  });
  assert.equal((await request()).status, 200);
  assert.equal(mails[0].to, 'committee@example.com');
  assert.deepEqual(mails[0].envelope, {
    from: 'club@example.com',
    to: ['committee@example.com'],
  });
  assert.equal(options[0].secure, true);
  assert.equal(options[0].port, 465);
});

test('missing or invalid server configuration never creates a mail transport', async (t) => {
  for (const env of [
    {},
    { ...smtp, CONTACT_SMTP_PORT: 'bad' },
    { ...smtp, CONTACT_SMTP_FROM: 'club@example.com\r\nBcc:bad@example.com' },
    { ...smtp, CONTACT_RECIPIENT: 'bad' },
    { ...smtp, CONTACT_SMTP_HOST: 'smtp://bad.example' },
  ]) {
    const { request, options } = await fixture(t, { env });
    const response = await request();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { message: unavailable });
    assert.equal(options.length, 0);
  }
});

test('CORS accepts only the configured origin and narrow contact preflight', async (t) => {
  const configured = 'http://100.126.154.2:8766';
  const { request, mails } = await fixture(t, {
    env: { ...smtp, CONTACT_ALLOWED_ORIGIN: configured },
  });
  const denied = await request();
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  assert.equal((await request(valid, { Origin: '' })).status, 403);
  assert.equal(
    (await request(valid, { Origin: configured })).headers.get(
      'access-control-allow-origin',
    ),
    configured,
  );
  const preflight = await request(
    undefined,
    {
      Origin: configured,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type',
    },
    'OPTIONS',
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST');
  assert.equal(
    preflight.headers.get('access-control-allow-headers'),
    'Content-Type',
  );
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
  assert.match(preflight.headers.get('vary'), /Origin/);
  assert.equal(
    (
      await request(
        undefined,
        { Origin: configured, 'Access-Control-Request-Method': 'DELETE' },
        'OPTIONS',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        undefined,
        {
          Origin: configured,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization',
        },
        'OPTIONS',
      )
    ).status,
    403,
  );
  assert.equal(
    (await request(undefined, { Origin: configured }, 'GET')).status,
    405,
  );
  assert.equal(mails.length, 1);
});

test('validates all fields, prevents header injection, and rejects the honeypot or client recipient', async (t) => {
  const cases = [
    null,
    [],
    {},
    { ...valid, name: '' },
    { ...valid, name: 'x'.repeat(101) },
    { ...valid, name: 'x\nBcc:bad@example.com' },
    { ...valid, email: 'bad' },
    { ...valid, email: 'a..b@example.com' },
    { ...valid, email: '"a"@example.com' },
    { ...valid, email: 'v@example.com\r\nBcc:bad@example.com' },
    { ...valid, email: 'x'.repeat(65) + '@example.com' },
    { ...valid, subject: 'x'.repeat(151) },
    { ...valid, subject: 'Hi\r\nBcc:bad@example.com' },
    { ...valid, message: '' },
    { ...valid, message: 'x'.repeat(5001) },
    { ...valid, message: 'Hello\u0000' },
    { ...valid, website: 'https://bot.example.com' },
    { ...valid, website: 123 },
    { ...valid, to: 'bad@example.com' },
  ];
  for (const body of cases) {
    const { request, mails } = await fixture(t);
    assert.equal(
      (await request(body)).status,
      400,
      JSON.stringify(body).slice(0, 120),
    );
    assert.equal(mails.length, 0);
  }
  const { request } = await fixture(t);
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
});

test('requires JSON, bounds streamed bodies to 16KiB, and rejects malformed JSON', async (t) => {
  const { request, mails } = await fixture(t);
  assert.equal(
    (await request(valid, { 'Content-Type': 'text/plain' })).status,
    415,
  );
  assert.equal((await request('{broken')).status, 400);
  assert.equal(
    (await request(JSON.stringify({ ...valid, message: 'x'.repeat(17000) })))
      .status,
    413,
  );
  assert.equal(mails.length, 0);
});

test('chunked requests and exact byte boundaries enforce the limit without closing the response socket', async (t) => {
  const { request, url } = await fixture(t);
  const text = JSON.stringify(valid);
  assert.equal(
    (await request(text + ' '.repeat(16384 - Buffer.byteLength(text)))).status,
    200,
  );
  assert.equal(
    (await request(text + ' '.repeat(16385 - Buffer.byteLength(text)))).status,
    413,
  );
  const response = await new Promise((resolve, reject) => {
    const upload = http.request(
      url,
      {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
      },
      async (incoming) => {
        let body = '';
        for await (const chunk of incoming) body += chunk;
        resolve({ status: incoming.statusCode, body: JSON.parse(body) });
      },
    );
    upload.on('error', reject);
    upload.write('{"message":"');
    upload.write('x'.repeat(17000));
    upload.end('"}');
  });
  assert.equal(response.status, 413);
  assert.deepEqual(response.body, { message: 'Message is too large.' });
});

test('rate limiting ignores spoofed forwarded IPs and releases buckets after expiry', async (t) => {
  let time = 0;
  const { request, mails } = await fixture(t, { now: () => time });
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await request(valid, { 'X-Forwarded-For': `192.0.2.${i + 1}` })).status,
      200,
    );
  const limited = await request(valid, { 'X-Forwarded-For': '192.0.2.99' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '600');
  assert.equal(mails.length, 5);
  time = 600001;
  assert.equal((await request()).status, 200);
});

test('only explicitly trusted proxies can supply one valid forwarded IP', async (t) => {
  const { request } = await fixture(t, {
    env: { ...smtp, CONTACT_TRUSTED_PROXY_IPS: '127.0.0.1' },
  });
  for (let i = 0; i < 6; i++)
    assert.equal(
      (await request(valid, { 'X-Forwarded-For': `192.0.2.${i + 1}` })).status,
      200,
    );
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await request(valid, {
          'X-Forwarded-For': `192.0.2.${i + 1}, 192.0.2.100`,
        })
      ).status,
      200,
    );
  assert.equal(
    (await request(valid, { 'X-Forwarded-For': 'invalid' })).status,
    429,
  );
});

test('rate limiter denies new clients at bounded capacity and reclaims expired entries', async (t) => {
  let time = 0;
  const { request } = await fixture(t, {
    env: { CONTACT_TRUSTED_PROXY_IPS: '127.0.0.1' },
    now: () => time,
  });
  for (let i = 0; i < 1000; i++) {
    const response = await request(valid, {
      'X-Forwarded-For': `192.0.${Math.floor(i / 250)}.${(i % 250) + 1}`,
    });
    assert.equal(response.status, 503);
  }
  assert.equal(
    (await request(valid, { 'X-Forwarded-For': '198.51.100.1' })).status,
    429,
  );
  time = 600001;
  assert.equal(
    (await request(valid, { 'X-Forwarded-For': '198.51.100.1' })).status,
    503,
  );
});
