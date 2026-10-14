import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const requireWrangler = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = requireWrangler('miniflare');

test('the Worker runtime reaches the provider without following redirects', async () => {
  const requests = [];
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: fileURLToPath(new URL('./contact.mjs', import.meta.url)),
      compatibilityDate: '2026-10-06',
      bindings: {
        CONTACT_FROM: 'onboarding@resend.dev',
        CONTACT_RECIPIENT: 'kitsunies@gmail.com',
        RESEND_API_KEY: 'runtime-test-only',
      },
      ratelimits: {
        CONTACT_RATE_LIMIT: {
          namespace_id: '1001',
          simple: { limit: 5, period: 60 },
        },
      },
      outboundService: async (request) => {
        requests.push(request.url);
        assert.equal(request.url, 'https://api.resend.com/emails');
        assert.equal(request.method, 'POST');
        assert.equal(
          request.headers.get('authorization'),
          'Bearer runtime-test-only',
        );
        return requests.length === 1
          ? Response.json({ id: 'runtime-acceptance' })
          : new Response(null, {
              status: 302,
              headers: { Location: 'https://redirect.invalid/' },
            });
      },
    }),
  );
  try {
    const submit = () =>
      runtime.dispatchFetch('https://contact.invalid/api/contact', {
        method: 'POST',
        headers: {
          Origin: 'https://gcom.techtom.tech',
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '192.0.2.1',
        },
        body: JSON.stringify({
          name: 'Runtime fixture',
          email: 'visitor@example.com',
          message: 'Isolated runtime test: outbound delivery is mocked.',
        }),
      });
    const accepted = await submit();
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { ok: true });
    assert.equal(requests.length, 1);
    assert.equal((await submit()).status, 502);
    assert.equal(requests.length, 2);
  } finally {
    await runtime.dispose();
  }
});
