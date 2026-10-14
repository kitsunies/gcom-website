const unavailable =
  'Message delivery is temporarily unavailable. Please email us directly.';
const deliveryFailed =
  'Your message could not be delivered. Please try again or email us directly.';
const controls = /[\u0000-\u001f\u007f-\u009f]/;
const bodyControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

function email(value) {
  if (typeof value !== 'string' || value.length > 254 || controls.test(value))
    return false;
  const parts = value.split('@');
  return (
    parts.length === 2 &&
    parts[0].length <= 64 &&
    /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(
      parts[0],
    ) &&
    parts[1].includes('.') &&
    parts[1]
      .split('.')
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  );
}

function validate(data) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).some(
      (key) =>
        !['name', 'email', 'subject', 'message', 'website'].includes(key),
    )
  )
    return null;
  for (const [key, max, required] of [
    ['name', 100, true],
    ['subject', 150, false],
    ['message', 5000, true],
    ['website', 200, false],
  ]) {
    const value = data[key];
    if (value === undefined && !required) continue;
    if (
      typeof value !== 'string' ||
      value.length > max ||
      (required && !value.trim()) ||
      (key === 'message' ? bodyControls : controls).test(value)
    )
      return null;
  }
  if (!email(data.email) || data.website?.trim()) return null;
  return {
    name: data.name.trim(),
    email: data.email,
    subject: data.subject?.trim() || 'Website contact',
    message: data.message.trim(),
  };
}

async function readJSON(message) {
  const reader = message.body?.getReader();
  if (!reader) throw { status: 400, message: 'Invalid JSON.' };
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        throw { status: 413, message: 'Message is too large.' };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw { status: 400, message: 'Invalid JSON.' };
    }
  } catch (error) {
    throw error.status
      ? error
      : { status: 400, message: 'Unable to read this message.' };
  } finally {
    reader.releaseLock();
  }
}

export default {
  async fetch(request, env) {
    const headers = new Headers({
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      'X-Content-Type-Options': 'nosniff',
    });
    const send = (message, status) =>
      Response.json(status === 200 ? { ok: true } : { message }, {
        status,
        headers,
      });
    if (new URL(request.url).pathname !== '/api/contact')
      return send('Not found.', 404);
    const allowedOrigin =
      env.CONTACT_ALLOWED_ORIGIN || 'https://gcom.techtom.tech';
    try {
      const url = new URL(allowedOrigin);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.origin !== allowedOrigin
      )
        return send(unavailable, 503);
    } catch {
      return send(unavailable, 503);
    }
    if (request.headers.get('Origin') !== allowedOrigin)
      return send('Origin denied.', 403);
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
    if (request.method === 'OPTIONS') {
      const requestedHeaders = (
        request.headers.get('Access-Control-Request-Headers') || ''
      )
        .toLowerCase()
        .split(',')
        .map((header) => header.trim())
        .filter(Boolean);
      if (
        request.headers.get('Access-Control-Request-Method') !== 'POST' ||
        requestedHeaders.some((header) => header !== 'content-type')
      )
        return send('Preflight denied.', 403);
      headers.set('Access-Control-Allow-Methods', 'POST');
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') {
      headers.set('Allow', 'POST, OPTIONS');
      return send('Method not allowed.', 405);
    }
    try {
      const ip = request.headers.get('CF-Connecting-IP');
      if (!ip || !env.CONTACT_RATE_LIMIT) return send(unavailable, 503);
      // shortcut: limits are per Cloudflare location, use a coordinated limiter for a strict global quota.
      const { success } = await env.CONTACT_RATE_LIMIT.limit({ key: ip });
      if (!success) {
        headers.set('Retry-After', '60');
        return send(
          'Too many messages. Please try again later or email us directly.',
          429,
        );
      }
      if (
        !/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(
          request.headers.get('Content-Type') || '',
        )
      ) {
        return send('Use application/json.', 415);
      }
      const data = validate(await readJSON(request));
      if (!data)
        return send('Please check your name, email, subject and message.', 400);
      const recipient = env.CONTACT_RECIPIENT || 'kitsunies@gmail.com';
      const from = env.CONTACT_FROM;
      const key = env.RESEND_API_KEY;
      if (
        !email(from) ||
        !email(recipient) ||
        typeof key !== 'string' ||
        !key.trim() ||
        key.length > 4096 ||
        controls.test(key)
      )
        return send(unavailable, 503);
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          redirect: 'manual',
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [recipient],
            reply_to: data.email,
            subject: `GCOM contact: ${data.subject}`,
            text: `Name: ${data.name}\nEmail: ${data.email}\nSubject: ${data.subject}\n\n${data.message}`,
          }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          return send(deliveryFailed, 502);
        }
        const result = await readJSON(response);
        if (
          typeof result?.id !== 'string' ||
          !result.id.trim() ||
          result.id.length > 128 ||
          controls.test(result.id)
        ) {
          return send(deliveryFailed, 502);
        }
      } catch {
        return send(deliveryFailed, 502);
      }
      return send('', 200);
    } catch (error) {
      return send(
        error.status ? error.message : unavailable,
        error.status || 503,
      );
    }
  },
};
